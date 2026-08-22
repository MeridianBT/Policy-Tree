"use server";

/**
 * Admin operations. Every one of these re-checks the ADMIN role on the server;
 * the navigation hiding the link is a courtesy, not a control.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { validateBands } from "@/lib/calc/bands";
import { kiCode as kiCodeFor } from "@/lib/domain/period";
import { PLAN_VERSIONS } from "@/prisma/seed-data";

export type AdminResult = { ok: true; message: string } | { ok: false; message: string };

function fail(error: unknown): AdminResult {
  return { ok: false, message: error instanceof Error ? error.message : "That did not work." };
}

// ---------------------------------------------------------------- Ki setup

const createKiSchema = z.object({
  startYear: z.coerce.number().int().min(2000).max(2100),
  makeCurrent: z.boolean().default(true),
});

export async function createKi(input: unknown): Promise<AdminResult> {
  try {
    await requireRole("ADMIN");
    const { startYear, makeCurrent } = createKiSchema.parse(input);
    const code = kiCodeFor(startYear);

    if (await prisma.ki.findUnique({ where: { code } })) {
      return { ok: false, message: `${code} already exists.` };
    }

    await prisma.$transaction(async (tx) => {
      if (makeCurrent) await tx.ki.updateMany({ data: { isCurrent: false } });
      const ki = await tx.ki.create({
        data: {
          code,
          startDate: new Date(Date.UTC(startYear, 3, 1)),
          endDate: new Date(Date.UTC(startYear + 1, 2, 31)),
          isCurrent: makeCurrent,
        },
      });
      await tx.planVersion.createMany({
        data: PLAN_VERSIONS.map((version) => ({ ...version, kiId: ki.id })),
      });
    });

    revalidatePath("/admin");
    return { ok: true, message: `${code} created with its six plan versions.` };
  } catch (error) {
    return fail(error);
  }
}

export async function setCurrentKi(kiId: string): Promise<AdminResult> {
  try {
    await requireRole("ADMIN");
    await prisma.$transaction([
      prisma.ki.updateMany({ data: { isCurrent: false } }),
      prisma.ki.update({ where: { id: kiId }, data: { isCurrent: true } }),
    ]);
    revalidatePath("/admin");
    revalidatePath("/sheet");
    return { ok: true, message: "Current Ki changed." };
  } catch (error) {
    return fail(error);
  }
}

// ------------------------------------------------------------ Version locks

export async function setVersionLock(planVersionId: string, locked: boolean): Promise<AdminResult> {
  try {
    await requireRole("ADMIN");
    const version = await prisma.planVersion.findUniqueOrThrow({ where: { id: planVersionId } });
    await prisma.planVersion.update({
      where: { id: planVersionId },
      data: { lockedAt: locked ? new Date() : null },
    });
    revalidatePath("/admin");
    revalidatePath("/sheet");
    return {
      ok: true,
      message: locked
        ? `${version.code} is locked. Its cells are now read-only for every role.`
        : `${version.code} is unlocked and can be edited again.`,
    };
  } catch (error) {
    return fail(error);
  }
}

// -------------------------------------------------------- Evaluation bands

const bandSchema = z.object({
  symbol: z.string().min(1).max(4),
  label: z.string().min(1),
  minPct: z.number().nullable(),
  maxPct: z.number().nullable(),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sortOrder: z.number().int(),
});

export async function saveBands(input: unknown): Promise<AdminResult> {
  try {
    await requireRole("ADMIN");
    const bands = z.array(bandSchema).min(1).parse(input);

    // Refuse a scale with a hole or an overlap: it would mis-evaluate silently.
    validateBands(bands);

    await prisma.$transaction(async (tx) => {
      await tx.evaluationBand.deleteMany({});
      for (const band of bands) await tx.evaluationBand.create({ data: band });
    });

    revalidatePath("/admin");
    revalidatePath("/sheet");
    return { ok: true, message: "Evaluation scale saved." };
  } catch (error) {
    return fail(error);
  }
}

// ------------------------------------------------------------------- Users

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "OWNER", "VIEWER"]),
  orgUnitId: z.string().nullable(),
});

export async function createUser(input: unknown): Promise<AdminResult> {
  try {
    await requireRole("ADMIN");
    const data = userSchema.parse(input);
    const email = data.email.toLowerCase();
    if (await prisma.appUser.findUnique({ where: { email } })) {
      return { ok: false, message: `${email} already has an account.` };
    }
    await prisma.appUser.create({
      data: {
        name: data.name,
        email,
        role: data.role,
        orgUnitId: data.orgUnitId,
        passwordHash: await bcrypt.hash(data.password, 10),
      },
    });
    revalidatePath("/admin");
    return { ok: true, message: `${email} created.` };
  } catch (error) {
    return fail(error);
  }
}

export async function setUserActive(userId: string, isActive: boolean): Promise<AdminResult> {
  try {
    await requireRole("ADMIN");
    await prisma.appUser.update({ where: { id: userId }, data: { isActive } });
    revalidatePath("/admin");
    return { ok: true, message: isActive ? "Account reactivated." : "Account deactivated." };
  } catch (error) {
    return fail(error);
  }
}

// -------------------------------------------------- Copy structure from Ki

/**
 * Copy the Level 1-4 structure and its Control Items from one Ki into another.
 * Entries are never copied: a new Ki starts with an empty plan, which is the
 * point of planning it.
 */
export async function copyStructure(fromKiId: string, toKiId: string): Promise<AdminResult> {
  try {
    await requireRole("ADMIN");
    if (fromKiId === toKiId) return { ok: false, message: "Pick two different Ki." };

    const [source, target] = await Promise.all([
      prisma.ki.findUniqueOrThrow({ where: { id: fromKiId } }),
      prisma.ki.findUniqueOrThrow({ where: { id: toKiId } }),
    ]);

    const existing = await prisma.node.count({ where: { kiId: toKiId } });
    if (existing > 0) {
      return {
        ok: false,
        message: `${target.code} already has a structure. Copying would duplicate it.`,
      };
    }

    const nodes = await prisma.node.findMany({
      where: { kiId: fromKiId },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
      include: { controlItems: true },
    });

    const idMap = new Map<string, string>();
    let copiedNodes = 0;
    let copiedItems = 0;

    await prisma.$transaction(async (tx) => {
      // Levels ascend, so a parent is always created before its children.
      for (const node of nodes) {
        const created = await tx.node.create({
          data: {
            kiId: toKiId,
            parentId: node.parentId ? idMap.get(node.parentId) ?? null : null,
            level: node.level,
            kind: node.kind,
            statement: node.statement,
            orgUnitId: node.orgUnitId,
            sortOrder: node.sortOrder,
          },
        });
        idMap.set(node.id, created.id);
        copiedNodes++;

        for (const item of node.controlItems) {
          await tx.controlItem.create({
            data: {
              nodeId: created.id,
              // Codes are unique across the database, so they are namespaced
              // by Ki when a structure is copied forward.
              code: `${item.code}@${target.code.replace(/\s+/g, "")}`,
              name: item.name,
              measuredAs: item.measuredAs,
              unit: item.unit,
              direction: item.direction,
              achievementMethod: item.achievementMethod,
              aggregation: item.aggregation,
              decimalPlaces: item.decimalPlaces,
              dicOrgUnitId: item.dicOrgUnitId,
              responsibleUserId: item.responsibleUserId,
              sortOrder: item.sortOrder,
            },
          });
          copiedItems++;
        }
      }
    }, { timeout: 60_000 });

    revalidatePath("/admin");
    return {
      ok: true,
      message: `Copied ${copiedNodes} nodes and ${copiedItems} Control Items from ${source.code} into ${target.code}. No values were copied.`,
    };
  } catch (error) {
    return fail(error);
  }
}

// --------------------------------------------------------- Structure builder

const nodeSchema = z.object({
  kiId: z.string(),
  parentId: z.string().nullable(),
  level: z.number().int().min(1).max(4),
  kind: z.enum(["GOAL", "THEME", "OBJECTIVE"]),
  statement: z.string().min(1),
  orgUnitId: z.string().nullable(),
});

export async function createNode(input: unknown): Promise<AdminResult> {
  try {
    await requireRole("ADMIN");
    const data = nodeSchema.parse(input);
    await assertLadderValid(data.parentId, data.level, data.kind);

    const siblings = await prisma.node.count({
      where: { kiId: data.kiId, parentId: data.parentId },
    });
    await prisma.node.create({ data: { ...data, sortOrder: siblings } });

    revalidatePath("/admin");
    revalidatePath("/sheet");
    return { ok: true, message: `${data.kind.toLowerCase()} added.` };
  } catch (error) {
    return fail(error);
  }
}

const controlItemSchema = z.object({
  nodeId: z.string(),
  code: z.string().min(1).regex(/^[A-Za-z0-9._@-]+$/, "Use letters, digits, dot, dash, underscore or @."),
  name: z.string().min(1),
  measuredAs: z.string().trim().min(1).nullable(),
  unit: z.enum(["PERCENT", "CURRENCY", "COUNT", "RATIO", "DAYS", "INDEX"]),
  direction: z.enum(["HIGHER_BETTER", "LOWER_BETTER"]),
  achievementMethod: z.enum(["RATIO", "INVERSE"]),
  aggregation: z.enum(["SUM", "AVERAGE", "LATEST"]),
  decimalPlaces: z.coerce.number().int().min(0).max(4),
  dicOrgUnitId: z.string().min(1),
  responsibleUserId: z.string().nullable(),
});

export async function createControlItem(input: unknown): Promise<AdminResult> {
  try {
    await requireRole("ADMIN");
    const data = controlItemSchema.parse(input);

    const node = await prisma.node.findUniqueOrThrow({ where: { id: data.nodeId } });
    // A Control Item is what an Objective is measured by; it cannot hang off a
    // Goal or a Theme.
    if (node.kind !== "OBJECTIVE") {
      return { ok: false, message: "A Control Item must sit under an Objective." };
    }
    if (data.direction === "HIGHER_BETTER" && data.achievementMethod === "INVERSE") {
      return {
        ok: false,
        message:
          "INVERSE is a cost-item method. For a higher-is-better Control Item use RATIO.",
      };
    }

    const siblings = await prisma.controlItem.count({ where: { nodeId: data.nodeId } });
    await prisma.controlItem.create({ data: { ...data, sortOrder: siblings } });

    revalidatePath("/admin");
    revalidatePath("/sheet");
    return { ok: true, message: `${data.name} added.` };
  } catch (error) {
    return fail(error);
  }
}

/**
 * The laddering rule, enforced here rather than left to convention:
 * a Level 3 Objective's chain reaches a Level 2 Objective, and a Level 4
 * Objective's chain reaches a Level 1-3 Objective.
 */
async function assertLadderValid(
  parentId: string | null,
  level: number,
  kind: "GOAL" | "THEME" | "OBJECTIVE",
): Promise<void> {
  if (level === 1) {
    if (kind !== "GOAL") throw new Error("Level 1 carries the company Goals and nothing else.");
    if (parentId) throw new Error("A Level 1 Goal sits at the root and has no parent.");
    return;
  }
  if (!parentId) throw new Error(`A Level ${level} node must hang off a parent.`);

  const chain = await ancestorChain(parentId);
  if (chain.length === 0) throw new Error("That parent does not exist.");

  if (kind === "OBJECTIVE" && level >= 3) {
    const laddersTo = chain.find(
      (ancestor) => ancestor.kind === "OBJECTIVE" && ancestor.level < level,
    );
    if (!laddersTo) {
      throw new Error(
        `A Level ${level} Objective must ladder into an Objective at a level above it. ` +
          "Put it under a Theme whose parent chain reaches one.",
      );
    }
  }
}

async function ancestorChain(nodeId: string) {
  const chain: Array<{ id: string; level: number; kind: string }> = [];
  let current: string | null = nodeId;
  for (let depth = 0; current && depth < 12; depth++) {
    const node: { id: string; level: number; kind: string; parentId: string | null } | null =
      await prisma.node.findUnique({
        where: { id: current },
        select: { id: true, level: true, kind: true, parentId: true },
      });
    if (!node) break;
    chain.push({ id: node.id, level: node.level, kind: node.kind });
    current = node.parentId;
  }
  return chain;
}
