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
  /**
   * What this year is called in the business. Optional: left blank it derives
   * the numbered code from the start year - April 2026 is 103KI, April 2027 is
   * 104KI, one number per year unbroken - so opening next year does not depend
   * on anyone remembering which number comes next.
   *
   * Still accepted explicitly, because the derivation encodes one company's
   * numbering and another's will differ. Only the start date decides which
   * months the year covers; the code is a label throughout.
   */
  code: z.string().trim().min(1).max(30).optional(),
  makeCurrent: z.boolean().default(true),
});

export async function createKi(input: unknown): Promise<AdminResult> {
  try {
    await requireRole("SUPER_ADMIN");
    const { startYear, code: given, makeCurrent } = createKiSchema.parse(input);
    const code = given || kiCodeFor(startYear);

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
    await requireRole("SUPER_ADMIN");
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
    await requireRole("SUPER_ADMIN");
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
    await requireRole("SUPER_ADMIN");
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
  // Omitted for the normal case: an invitation redeemable only by signing in
  // through Microsoft, with no password to set, send or ever rotate.
  password: z.string().min(8).optional(),
  role: z.enum(["SUPER_ADMIN", "EXECUTIVE", "OWNER", "VIEWER"]),
  orgUnitId: z.string().nullable(),
});

export async function createUser(input: unknown): Promise<AdminResult> {
  try {
    await requireRole("SUPER_ADMIN");
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
        passwordHash: data.password ? await bcrypt.hash(data.password, 10) : null,
      },
    });
    revalidatePath("/admin");
    return {
      ok: true,
      message: data.password
        ? `${email} created.`
        : `${email} invited — they sign in with Microsoft.`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function setUserActive(userId: string, isActive: boolean): Promise<AdminResult> {
  try {
    await requireRole("SUPER_ADMIN");
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
    await requireRole("SUPER_ADMIN");
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
              measuredAs: item.measuredAs,
              // Copied forward as-is: next year's plan starts from this
              // year's, and a measure does not change business unit by
              // crossing a year boundary.
              businessUnitId: item.businessUnitId,
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

// ------------------------------------------------------------- Departments

const createDepartmentSchema = z.object({
  divisionId: z.string().min(1, "Choose which division this department sits under."),
  code: z
    .string()
    .trim()
    .min(1, "Give the department a code.")
    .max(20)
    .regex(/^[A-Za-z0-9._-]+$/, "Use letters, digits, dot, dash or underscore."),
  name: z.string().trim().min(1, "Give the department a name.").max(120),
});

/** Adds a Department to the pick list, filed under an existing Division. */
export async function createDepartment(input: unknown): Promise<AdminResult> {
  try {
    await requireRole("SUPER_ADMIN");
    const data = createDepartmentSchema.parse(input);

    const division = await prisma.orgUnit.findUnique({ where: { id: data.divisionId } });
    if (!division || division.type !== "DIVISION") {
      return { ok: false, message: "Choose a division to file the department under." };
    }

    const code = data.code.toUpperCase();
    if (await prisma.orgUnit.findUnique({ where: { code } })) {
      return { ok: false, message: `${code} is already in use.` };
    }

    const siblings = await prisma.orgUnit.count({ where: { parentId: division.id } });
    await prisma.orgUnit.create({
      data: {
        code,
        name: data.name,
        type: "DEPARTMENT",
        parentId: division.id,
        sortOrder: siblings,
      },
    });

    revalidatePath("/admin");
    revalidatePath("/sheet");
    return { ok: true, message: `${code} added under ${division.code}.` };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Removes a Department from the pick list.
 *
 * This never cascades. Postgres's default action on an optional foreign key
 * is SET NULL, which for `node.org_unit_id` or `app_user.org_unit_id` would
 * silently strip a Level 4 branch of the department it belongs to, or unassign
 * a user, rather than stop the deletion - exactly the kind of quiet data loss
 * this module exists to prevent. So every reference is counted first, and the
 * deletion is refused outright, with no override, until the department is
 * genuinely empty: no Level 4 rows, no Control Items, no users left pointing
 * at it. There is nothing to "delete anyway" here, because an org unit is an
 * identity other rows depend on, not plan content with a value of its own.
 */
export async function deleteDepartment(id: string): Promise<AdminResult> {
  try {
    await requireRole("SUPER_ADMIN");

    const department = await prisma.orgUnit.findUnique({ where: { id } });
    if (!department) return { ok: false, message: "That department no longer exists." };
    if (department.type !== "DEPARTMENT") {
      return { ok: false, message: "Only a Department can be removed here." };
    }

    const [nodes, controlItems, users] = await Promise.all([
      prisma.node.count({ where: { orgUnitId: id } }),
      prisma.controlItem.count({ where: { dicOrgUnitId: id } }),
      prisma.appUser.count({ where: { orgUnitId: id } }),
    ]);

    const blockers: string[] = [];
    if (nodes > 0) blockers.push(`${nodes} Level 4 row${nodes === 1 ? "" : "s"}`);
    if (controlItems > 0) blockers.push(`${controlItems} Control Item${controlItems === 1 ? "" : "s"}`);
    if (users > 0) blockers.push(`${users} user${users === 1 ? "" : "s"}`);

    if (blockers.length > 0) {
      return {
        ok: false,
        message:
          `${department.code} still has ${blockers.join(", ")} pointing at it. ` +
          "Move or remove those first - deleting the department itself would leave them belonging " +
          "to nothing rather than actually removing anything.",
      };
    }

    await prisma.orgUnit.delete({ where: { id } });
    revalidatePath("/admin");
    revalidatePath("/sheet");
    return { ok: true, message: `${department.code} removed.` };
  } catch (error) {
    return fail(error);
  }
}

// ------------------------------------------------------------- Resetting a Ki

export interface KiResetImpact {
  kiCode: string;
  nodes: number;
  controlItems: number;
  entries: number;
}

export type KiResetResult =
  | { ok: true; message: string }
  | { ok: false; message: string }
  | { ok: false; needsConfirmation: true; impact: KiResetImpact; message: string };

/** What a reset would destroy, counted before anything is touched. */
export async function kiResetImpact(kiId: string): Promise<KiResetImpact | null> {
  await requireRole("SUPER_ADMIN");
  const ki = await prisma.ki.findUnique({ where: { id: kiId }, select: { code: true } });
  if (!ki) return null;

  const [nodes, controlItems, entries] = await Promise.all([
    prisma.node.count({ where: { kiId } }),
    prisma.controlItem.count({ where: { node: { kiId } } }),
    prisma.entry.count({ where: { controlItem: { node: { kiId } } } }),
  ]);
  return { kiCode: ki.code, nodes, controlItems, entries };
}

/**
 * Empty a Ki: every Goal, Objective, Control Item and stored figure for that
 * year, gone. The year itself and its six plan versions survive, so it is
 * immediately ready to be built again or copied into.
 *
 * There is no undo, and no soft delete to recover from - so the caller must
 * type the Ki's own code back. That is deliberately harder than clicking twice:
 * this is the one action in the application that can destroy a year of a
 * company's planning, and a mis-click on the wrong row in a list of years would
 * be unrecoverable. Naming the year proves you looked at which one.
 *
 * The current Ki is refused outright. Emptying the year everyone is actively
 * keying into is never what was meant; make another Ki current first, which is
 * a deliberate act with its own visible consequence.
 */
export async function resetKi(kiId: string, confirmation?: string): Promise<KiResetResult> {
  try {
    await requireRole("SUPER_ADMIN");

    const ki = await prisma.ki.findUnique({ where: { id: kiId } });
    if (!ki) return { ok: false, message: "That Ki no longer exists." };
    if (ki.isCurrent) {
      return {
        ok: false,
        message: `${ki.code} is the current Ki. Make another Ki current before emptying this one.`,
      };
    }

    const impact = await kiResetImpact(kiId);
    if (!impact) return { ok: false, message: "That Ki no longer exists." };

    if (confirmation?.trim() !== ki.code) {
      return {
        ok: false,
        needsConfirmation: true,
        impact,
        message:
          `Emptying ${ki.code} removes ${impact.nodes} rows, ` +
          `${impact.controlItems} Control Items and ${impact.entries} stored figures. ` +
          `This cannot be undone. Type ${ki.code} to confirm.`,
      };
    }

    // Deleting the nodes is enough: control items cascade from their node,
    // entries and their audit trail cascade from the control item, and formula
    // dependencies cascade from both ends. The plan versions hang off the Ki
    // rather than off a node, so they survive and the year stays usable.
    await prisma.node.deleteMany({ where: { kiId } });

    revalidatePath("/admin");
    revalidatePath("/sheet");
    return {
      ok: true,
      message:
        `${ki.code} emptied — ${impact.nodes} rows, ${impact.controlItems} Control Items ` +
        `and ${impact.entries} figures removed. Its plan versions are intact.`,
    };
  } catch (error) {
    return fail(error);
  }
}

// ----------------------------------------------------------- Business units

const createBusinessUnitSchema = z.object({
  code: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9-]+$/, "Use letters, digits or dashes."),
  name: z.string().trim().min(1).max(80),
});

/**
 * A business unit is data, not an enum, so a company that starts a fourth
 * product line adds one here rather than waiting on a deploy.
 */
export async function createBusinessUnit(input: unknown): Promise<AdminResult> {
  try {
    await requireRole("SUPER_ADMIN");
    const data = createBusinessUnitSchema.parse(input);

    const code = data.code.toUpperCase();
    if (await prisma.businessUnit.findUnique({ where: { code } })) {
      return { ok: false, message: `${code} is already in use.` };
    }

    const existing = await prisma.businessUnit.count();
    await prisma.businessUnit.create({ data: { code, name: data.name, sortOrder: existing } });

    revalidatePath("/admin");
    revalidatePath("/sheet");
    return { ok: true, message: `${code} added.` };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Refuses outright while any measure still points at it, and never cascades.
 * The same reasoning as deleting a department: a business unit is an identity
 * other rows depend on, not plan content with a value of its own, and the
 * database would otherwise refuse anyway - the foreign key is ON DELETE
 * RESTRICT. Better to say which measures are in the way than to surface a
 * constraint violation.
 */
export async function deleteBusinessUnit(id: string): Promise<AdminResult> {
  try {
    await requireRole("SUPER_ADMIN");

    const unit = await prisma.businessUnit.findUnique({ where: { id } });
    if (!unit) return { ok: false, message: "That business unit no longer exists." };

    const inUse = await prisma.controlItem.count({ where: { businessUnitId: id } });
    if (inUse > 0) {
      return {
        ok: false,
        message:
          `${unit.code} still carries ${inUse} Control ${inUse === 1 ? "Item" : "Items"}. ` +
          "Move them to another business unit first.",
      };
    }

    if ((await prisma.businessUnit.count()) === 1) {
      return { ok: false, message: "There has to be at least one business unit." };
    }

    await prisma.businessUnit.delete({ where: { id } });
    revalidatePath("/admin");
    revalidatePath("/sheet");
    return { ok: true, message: `${unit.code} removed.` };
  } catch (error) {
    return fail(error);
  }
}

// ------------------------------------------------------ Divisions and edits

const divisionSchema = z.object({
  code: z.string().trim().min(1, "Give the division a code.").max(20)
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, digits or dashes."),
  name: z.string().trim().min(1, "Give the division a name.").max(80),
});

export async function createDivision(input: unknown): Promise<AdminResult> {
  try {
    await requireRole("SUPER_ADMIN");
    const data = divisionSchema.parse(input);

    const code = data.code.toUpperCase();
    if (await prisma.orgUnit.findUnique({ where: { code } })) {
      return { ok: false, message: `${code} is already in use.` };
    }

    const company = await prisma.orgUnit.findFirst({ where: { type: "COMPANY" } });
    if (!company) return { ok: false, message: "There is no company to file the division under." };

    const siblings = await prisma.orgUnit.count({ where: { type: "DIVISION" } });
    await prisma.orgUnit.create({
      data: { code, name: data.name, type: "DIVISION", parentId: company.id, sortOrder: siblings },
    });

    revalidatePath("/admin");
    revalidatePath("/sheet");
    return { ok: true, message: `${code} added.` };
  } catch (error) {
    return fail(error);
  }
}

const updateOrgUnitSchema = z.object({
  id: z.string().min(1),
  code: z.string().trim().min(1, "An org unit needs a code.").max(20)
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, digits or dashes."),
  name: z.string().trim().min(1, "An org unit needs a name.").max(80),
  /** Departments only: move to a different division. Ignored for a division. */
  parentId: z.string().nullable().optional(),
});

/**
 * Renames, re-codes, and - for a department - moves it under another division.
 *
 * Safe to change a code: nothing stores one as a reference. Formulas address
 * Control Items by *their* code, and every place an org unit's code appears -
 * the DIC badge, the division scope, the export column - reads it at render
 * time from the row itself.
 */
export async function updateOrgUnit(input: unknown): Promise<AdminResult> {
  try {
    await requireRole("SUPER_ADMIN");
    const data = updateOrgUnitSchema.parse(input);

    const unit = await prisma.orgUnit.findUnique({ where: { id: data.id } });
    if (!unit) return { ok: false, message: "That org unit no longer exists." };
    if (unit.type === "COMPANY") {
      return { ok: false, message: "The company itself is not edited here." };
    }

    const code = data.code.toUpperCase();
    const clash = await prisma.orgUnit.findUnique({ where: { code } });
    if (clash && clash.id !== unit.id) {
      return { ok: false, message: `${code} is already in use.` };
    }

    let parentId = unit.parentId;
    if (unit.type === "DEPARTMENT" && data.parentId && data.parentId !== unit.parentId) {
      const division = await prisma.orgUnit.findUnique({ where: { id: data.parentId } });
      if (!division || division.type !== "DIVISION") {
        return { ok: false, message: "A department has to sit under a division." };
      }
      parentId = division.id;
    }

    await prisma.orgUnit.update({
      where: { id: unit.id },
      data: { code, name: data.name, parentId },
    });

    revalidatePath("/admin");
    revalidatePath("/sheet");
    revalidatePath("/division", "layout");
    return { ok: true, message: `${code} updated.` };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Refuses while anything still points at the division - its own departments
 * included - and never cascades.
 *
 * Postgres's default on an optional foreign key is SET NULL rather than block,
 * which for a division would silently strip its departments of a parent and
 * unassign its people. Counting first and refusing outright is the only way to
 * make the failure legible. Same rule as deleteDepartment, one level up.
 */
export async function deleteDivision(id: string): Promise<AdminResult> {
  try {
    await requireRole("SUPER_ADMIN");

    const division = await prisma.orgUnit.findUnique({ where: { id } });
    if (!division || division.type !== "DIVISION") {
      return { ok: false, message: "That division no longer exists." };
    }

    const [departments, controlItems, nodes, users] = await Promise.all([
      prisma.orgUnit.count({ where: { parentId: id } }),
      prisma.controlItem.count({ where: { dicOrgUnitId: id } }),
      prisma.node.count({ where: { orgUnitId: id } }),
      prisma.appUser.count({ where: { orgUnitId: id } }),
    ]);

    const blockers: string[] = [];
    if (departments) blockers.push(`${departments} department${departments === 1 ? "" : "s"}`);
    if (controlItems) blockers.push(`${controlItems} Control Item${controlItems === 1 ? "" : "s"}`);
    if (nodes) blockers.push(`${nodes} Level 4 row${nodes === 1 ? "" : "s"}`);
    if (users) blockers.push(`${users} user${users === 1 ? "" : "s"}`);

    if (blockers.length) {
      return {
        ok: false,
        message:
          `${division.code} still has ${blockers.join(", ")} pointing at it. ` +
          "Move or remove those first.",
      };
    }

    await prisma.orgUnit.delete({ where: { id } });
    revalidatePath("/admin");
    revalidatePath("/sheet");
    return { ok: true, message: `${division.code} removed.` };
  } catch (error) {
    return fail(error);
  }
}
