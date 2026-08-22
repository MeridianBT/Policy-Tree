"use server";

/**
 * Editing the plan structure from the sheet itself.
 *
 * Two rules shape this module.
 *
 * The kind and level of a new node are *derived*, never asked for. A child of a
 * Goal is a Theme one level down; a child of a Theme is an Objective at the
 * same level; a child of an Objective is a Theme one level down. So the UI
 * offers "Add theme" or "Add objective" where each is valid and never presents
 * a level picker, which is what made the admin structure builder tedious.
 *
 * Deleting is destructive and says so. A node carries its descendants, their
 * Control Items and every figure ever keyed against them. Delete therefore runs
 * in two steps: the first call reports exactly what would be lost, and only a
 * second call carrying that acknowledgement removes anything.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";

export type StructureResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string }
  | { ok: false; needsConfirmation: true; message: string; impact: DeletionImpact };

export interface DeletionImpact {
  nodes: number;
  controlItems: number;
  entries: number;
}

function fail(error: unknown): StructureResult {
  if (error instanceof z.ZodError) {
    return { ok: false, message: error.issues[0]?.message ?? "That input is not valid." };
  }
  return { ok: false, message: error instanceof Error ? error.message : "That did not work." };
}

function revalidate() {
  revalidatePath("/sheet");
  revalidatePath("/admin");
}

/** What kind of child a node can carry, and at what level. */
export async function childOptions(parentId: string | null): Promise<
  Array<{ kind: "GOAL" | "THEME" | "OBJECTIVE"; level: number; label: string }>
> {
  if (!parentId) return [{ kind: "GOAL", level: 1, label: "Goal" }];

  const parent = await prisma.node.findUnique({
    where: { id: parentId },
    select: { kind: true, level: true },
  });
  if (!parent) return [];

  switch (parent.kind) {
    case "GOAL":
      return [{ kind: "THEME", level: parent.level + 1, label: "Theme" }];
    case "THEME":
      return [{ kind: "OBJECTIVE", level: parent.level, label: "Objective" }];
    case "OBJECTIVE":
      // An Objective carries Control Items, and may also carry a deeper Theme
      // that deploys it further down the organisation.
      return [{ kind: "THEME", level: parent.level + 1, label: "Theme" }];
  }
}

const addNodeSchema = z.object({
  kiId: z.string().min(1),
  parentId: z.string().nullable(),
  statement: z.string().trim().min(1, "Give the row a statement.").max(300),
});

export async function addNode(input: unknown): Promise<StructureResult> {
  try {
    await requireRole("ADMIN");
    const { kiId, parentId, statement } = addNodeSchema.parse(input);

    const options = await childOptions(parentId);
    const target = options[0];
    if (!target) return { ok: false, message: "Nothing can be added under that row." };

    const siblings = await prisma.node.count({ where: { kiId, parentId } });
    const created = await prisma.node.create({
      data: {
        kiId,
        parentId,
        kind: target.kind,
        level: target.level,
        statement,
        sortOrder: siblings,
      },
    });

    revalidate();
    return { ok: true, message: `${target.label} added.`, id: created.id };
  } catch (error) {
    return fail(error);
  }
}

const renameSchema = z.object({
  id: z.string().min(1),
  statement: z.string().trim().min(1, "A row needs a statement.").max(300),
});

export async function renameNode(input: unknown): Promise<StructureResult> {
  try {
    await requireRole("ADMIN");
    const { id, statement } = renameSchema.parse(input);
    await prisma.node.update({ where: { id }, data: { statement } });
    revalidate();
    return { ok: true, message: "Renamed." };
  } catch (error) {
    return fail(error);
  }
}

export async function renameControlItem(input: unknown): Promise<StructureResult> {
  try {
    await requireRole("ADMIN");
    const { id, statement } = renameSchema.parse(input);
    await prisma.controlItem.update({ where: { id }, data: { name: statement } });
    revalidate();
    return { ok: true, message: "Renamed." };
  } catch (error) {
    return fail(error);
  }
}

/** Everything that would go with a node: itself, its descendants, their data. */
async function measureNodeDeletion(nodeId: string): Promise<DeletionImpact> {
  const nodeIds = await descendantNodeIds(nodeId);
  const controlItems = await prisma.controlItem.findMany({
    where: { nodeId: { in: nodeIds } },
    select: { id: true },
  });
  const entries = controlItems.length
    ? await prisma.entry.count({ where: { controlItemId: { in: controlItems.map((c) => c.id) } } })
    : 0;

  return { nodes: nodeIds.length, controlItems: controlItems.length, entries };
}

async function descendantNodeIds(nodeId: string): Promise<string[]> {
  const ids = [nodeId];
  let frontier = [nodeId];
  // Depth is bounded by the level structure; the guard stops a cycle from
  // looping forever if one is ever introduced by bad data.
  for (let depth = 0; frontier.length && depth < 12; depth++) {
    const children = await prisma.node.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((child) => child.id);
    ids.push(...frontier);
  }
  return ids;
}

const deleteSchema = z.object({
  id: z.string().min(1),
  confirm: z.boolean().default(false),
});

export async function deleteNode(input: unknown): Promise<StructureResult> {
  try {
    await requireRole("ADMIN");
    const { id, confirm } = deleteSchema.parse(input);

    const node = await prisma.node.findUnique({
      where: { id },
      select: { statement: true, kind: true },
    });
    if (!node) return { ok: false, message: "That row no longer exists." };

    const impact = await measureNodeDeletion(id);

    if (!confirm && (impact.nodes > 1 || impact.controlItems > 0)) {
      return {
        ok: false,
        needsConfirmation: true,
        impact,
        message: describeImpact(node.statement, impact),
      };
    }

    // Cascades handle descendants, Control Items, entries and audit rows.
    await prisma.node.delete({ where: { id } });
    revalidate();
    return {
      ok: true,
      message:
        impact.controlItems > 0
          ? `Deleted, along with ${impact.controlItems} Control ${impact.controlItems === 1 ? "Item" : "Items"} and ${impact.entries} stored ${impact.entries === 1 ? "figure" : "figures"}.`
          : "Deleted.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteControlItem(input: unknown): Promise<StructureResult> {
  try {
    await requireRole("ADMIN");
    const { id, confirm } = deleteSchema.parse(input);

    const item = await prisma.controlItem.findUnique({
      where: { id },
      select: { name: true },
    });
    if (!item) return { ok: false, message: "That Control Item no longer exists." };

    const entries = await prisma.entry.count({ where: { controlItemId: id } });

    if (!confirm && entries > 0) {
      const impact = { nodes: 0, controlItems: 1, entries };
      return {
        ok: false,
        needsConfirmation: true,
        impact,
        message:
          `Deleting "${item.name}" removes ${entries} stored ` +
          `${entries === 1 ? "figure" : "figures"}, including every actual keyed against it. ` +
          "That cannot be undone.",
      };
    }

    await prisma.controlItem.delete({ where: { id } });
    revalidate();
    return { ok: true, message: `Deleted "${item.name}".` };
  } catch (error) {
    return fail(error);
  }
}

function describeImpact(statement: string, impact: DeletionImpact): string {
  const parts: string[] = [];
  if (impact.nodes > 1) parts.push(`${impact.nodes - 1} row${impact.nodes - 1 === 1 ? "" : "s"} beneath it`);
  if (impact.controlItems > 0) {
    parts.push(`${impact.controlItems} Control ${impact.controlItems === 1 ? "Item" : "Items"}`);
  }
  if (impact.entries > 0) {
    parts.push(`${impact.entries} stored ${impact.entries === 1 ? "figure" : "figures"}`);
  }

  const quoted = statement.length > 60 ? `${statement.slice(0, 57)}…` : statement;
  return `Deleting "${quoted}" also removes ${parts.join(", ")}. That cannot be undone.`;
}

const addControlItemSchema = z.object({
  nodeId: z.string().min(1),
  name: z.string().trim().min(1, "Give the measure a name.").max(200),
  measuredAs: z.string().trim().max(120).nullable(),
  unit: z.enum(["PERCENT", "CURRENCY", "COUNT", "RATIO", "DAYS", "INDEX"]),
  direction: z.enum(["HIGHER_BETTER", "LOWER_BETTER"]),
  aggregation: z.enum(["SUM", "AVERAGE", "LATEST"]),
  decimalPlaces: z.coerce.number().int().min(0).max(4),
  dicOrgUnitId: z.string().min(1, "A Control Item needs a Division in charge."),
});

export async function addControlItem(input: unknown): Promise<StructureResult> {
  try {
    await requireRole("ADMIN");
    const data = addControlItemSchema.parse(input);

    const node = await prisma.node.findUnique({
      where: { id: data.nodeId },
      select: { kind: true, kiId: true },
    });
    if (!node) return { ok: false, message: "That row no longer exists." };
    if (node.kind !== "OBJECTIVE") {
      return { ok: false, message: "A Control Item must sit under an Objective." };
    }

    // INVERSE is a cost-item convention; the plain ratio is the only meaningful
    // reading for a higher-is-better item, so it is chosen here rather than asked.
    const achievementMethod = data.direction === "LOWER_BETTER" ? "INVERSE" : "RATIO";

    const siblings = await prisma.controlItem.count({ where: { nodeId: data.nodeId } });
    const created = await prisma.controlItem.create({
      data: {
        nodeId: data.nodeId,
        code: await uniqueCode(data.name),
        name: data.name,
        measuredAs: data.measuredAs,
        unit: data.unit,
        direction: data.direction,
        achievementMethod,
        aggregation: data.aggregation,
        decimalPlaces: data.decimalPlaces,
        dicOrgUnitId: data.dicOrgUnitId,
        sortOrder: siblings,
      },
    });

    revalidate();
    return { ok: true, message: `${data.name} added.`, id: created.id };
  } catch (error) {
    return fail(error);
  }
}

/**
 * A code is what a formula addresses a Control Item by, so it is derived from
 * the name and made unique rather than asked for at the point of creation.
 */
async function uniqueCode(name: string): Promise<string> {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 20) || "ITEM";

  for (let suffix = 0; suffix < 200; suffix++) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const taken = await prisma.controlItem.findUnique({ where: { code: candidate } });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36).toUpperCase()}`;
}
