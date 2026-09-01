"use server";

/**
 * Editing the plan structure from the sheet itself.
 *
 * Two rules shape the ADMIN half of this module.
 *
 * The kind and level of a new node are *derived*, never asked for, for a plain
 * continuation of the tree: a child of a Goal is a Level 2 Objective; a child
 * of a Level 2 Objective is a Level 3 one. So "Add measure" appears wherever it
 * is valid and never presents a level picker. `addNode` keeps making a bare
 * Objective for the toolbar's "Add goal" and for the workbook upload, which
 * names the rows it creates rather than clicking them into place.
 *
 * Deleting is destructive and says so. A node carries its descendants, their
 * Control Items and every figure ever keyed against them. Delete therefore
 * runs in two steps: the first call reports exactly what would be lost, and
 * only a second call carrying that acknowledgement removes anything.
 *
 * The OWNER half is a separate, narrower path: a division or department lead
 * may start a Level 4 branch under any Level 2 or 3 Objective in the company -
 * "against any of the L3 measures" is the whole point of laddering - but only
 * ever scoped to their own org unit. They can never touch Levels 1-3, and
 * every call re-derives that scope from `dic_org_unit_id` / `org_unit_id`
 * rather than trusting anything the client sends.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  assignableOrgUnitIds,
  canEditInKi,
  canEditStructureAt,
  requireSession,
  type AuthenticatedUser,
} from "@/lib/auth/session";
import { ReorderError, reorderWithinLevel } from "./reorder";
import { controlItemLabel } from "@/lib/calc/item-label";

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

class NotPermitted extends Error {}

function revalidate() {
  revalidatePath("/sheet");
  revalidatePath("/admin");
  revalidatePath("/division", "layout");
}

// ------------------------------------------------------------------ Reading

/**
 * What a row can carry beneath it.
 *
 * One rule for the whole tree since it was flattened: a Goal, then Objectives
 * all the way down. Level is depth - a Goal is 1, and each Objective is one
 * deeper than the Objective above it.
 *
 * Level 4 is the exception and the only one: a department branch carries an
 * org unit, so it goes through `addDepartmentBranch` rather than this plain
 * continuation. An Objective created here with no org unit would be Level 4
 * work belonging to nobody.
 */
export async function childOptions(
  parentId: string | null,
): Promise<Array<{ kind: "GOAL" | "OBJECTIVE"; level: number; label: string }>> {
  if (!parentId) return [{ kind: "GOAL", level: 1, label: "Goal" }];

  const parent = await prisma.node.findUnique({
    where: { id: parentId },
    select: { kind: true, level: true },
  });
  if (!parent) return [];

  switch (parent.kind) {
    case "GOAL":
      return [{ kind: "OBJECTIVE", level: 2, label: "Objective" }];
    case "OBJECTIVE":
      return parent.level === 2 ? [{ kind: "OBJECTIVE", level: 3, label: "Objective" }] : [];
  }
}

// -------------------------------------------------------------------- Nodes

/**
 * The sort order a new child should take: ahead of every sibling at its level,
 * so it lands directly beneath the row it was added from.
 *
 * Appending is the obvious thing and it is wrong here. A Goal on the demo plan
 * carries thirty-one Objectives, so a new one added at the end arrives some
 * sixty rows below the heading somebody just clicked - off the screen
 * entirely, which reads as nothing having happened. What you add appears where
 * you were looking.
 *
 * Two details this has to get right. It is scoped to the row's own **level**,
 * because an Objective's children are not all the same level - a Level 4
 * branch is ordered ahead of the Level 3 breakdown regardless of number (see
 * `compareNodes`), so "first" has to mean first among its own kind. And it
 * takes the minimum rather than counting, because sort orders are not dense:
 * the seeders allocate them in blocks and `reorderWithinLevel` renumbers only
 * the rows it touches, so counting lands a new row in a gap between existing
 * ones. Going below the minimum needs no renumbering, and the negatives it
 * produces are normalised away the first time anybody drags a row.
 */
async function firstSortOrder(
  kiId: string,
  parentId: string | null,
  level: number,
): Promise<number> {
  const first = await prisma.node.findFirst({
    where: { kiId, parentId, level },
    orderBy: { sortOrder: "asc" },
    select: { sortOrder: true },
  });
  return first ? first.sortOrder - 1 : 0;
}

const addNodeSchema = z.object({
  kiId: z.string().min(1),
  parentId: z.string().nullable(),
  statement: z.string().trim().min(1, "Give the row a statement.").max(300),
});

/** The plain continuation of the tree: a Goal or an Objective, ADMIN only. */
export async function addNode(input: unknown): Promise<StructureResult> {
  try {
    const user = await requireSession();
    const { kiId, parentId, statement } = addNodeSchema.parse(input);

    if (!(await canEditStructureAt(user, 1, null))) {
      throw new NotPermitted(
        "Only a super admin or an executive can extend the company structure (Levels 1 to 3).",
      );
    }
    if (!(await canEditInKi(user, kiId))) {
      throw new NotPermitted("That year is closed. Only a super admin can add to it.");
    }

    const options = await childOptions(parentId);
    const target = options[0];
    if (!target) return { ok: false, message: "Nothing can be added under that row." };

    const parentNode = parentId
      ? await prisma.node.findUnique({ where: { id: parentId }, select: { orgUnitId: true } })
      : null;

    const sortOrder = await firstSortOrder(kiId, parentId, target.level);
    const created = await prisma.node.create({
      data: {
        kiId,
        parentId,
        kind: target.kind,
        level: target.level,
        statement,
        // An Objective inherits its parent's org unit scope (null for the
        // company-wide Levels 1-3), so it stays consistent if a Level 4 branch
        // is later added beneath it.
        orgUnitId: parentNode?.orgUnitId ?? null,
        sortOrder,
      },
    });

    revalidate();
    return { ok: true, message: `${target.label} added.`, id: created.id };
  } catch (error) {
    return permissionAware(error);
  }
}

const addDepartmentBranchSchema = z.object({
  kiId: z.string().min(1),
  /** A Level 2 or 3 Objective - "any of the L3 measures" ladders from here. */
  parentObjectiveId: z.string().min(1),
  orgUnitId: z.string().min(1, "Choose which division or department this belongs to."),
  statement: z.string().trim().min(1, "Give the row a statement.").max(300),
});

/**
 * Starts (or continues) a Level 4 branch under a Level 2 or 3 Objective. This
 * is the one structure edit an OWNER may perform on their own, always scoped
 * to their own org unit or a department beneath it.
 */
export async function addDepartmentBranch(input: unknown): Promise<StructureResult> {
  try {
    const user = await requireSession();
    const { kiId, parentObjectiveId, orgUnitId, statement } = addDepartmentBranchSchema.parse(input);

    if (!(await canEditStructureAt(user, 4, orgUnitId))) {
      throw new NotPermitted(
        user.role === "OWNER"
          ? "You can only add a department branch under your own division or department."
          : "You do not have permission to add a department branch.",
      );
    }

    const parent = await prisma.node.findUnique({
      where: { id: parentObjectiveId },
      select: { kind: true, level: true },
    });
    if (!parent || parent.kind !== "OBJECTIVE" || parent.level >= 4) {
      return {
        ok: false,
        message: "A department branch ladders from a Level 2 or 3 Objective.",
      };
    }

    const sortOrder = await firstSortOrder(kiId, parentObjectiveId, 4);
    const created = await prisma.node.create({
      data: {
        kiId,
        parentId: parentObjectiveId,
        kind: "OBJECTIVE",
        level: 4,
        statement,
        orgUnitId,
        sortOrder,
      },
    });

    revalidate();
    return { ok: true, message: "Department objective added.", id: created.id };
  } catch (error) {
    return permissionAware(error);
  }
}

/*
 * `addDepartmentObjective` used to add an Objective under a Level 4 Theme.
 * There are no Themes now: a department branch *is* an Objective, and a
 * department that needs a second one calls addDepartmentBranch again against
 * the same company Objective. One action fewer, and one fewer tier to explain.
 */

const renameSchema = z.object({
  id: z.string().min(1),
  statement: z.string().trim().min(1, "A row needs a statement.").max(300),
});

export async function renameNode(input: unknown): Promise<StructureResult> {
  try {
    const user = await requireSession();
    const { id, statement } = renameSchema.parse(input);

    const node = await prisma.node.findUnique({
      where: { id },
      select: { level: true, orgUnitId: true, kiId: true },
    });
    if (!node) return { ok: false, message: "That row no longer exists." };
    if (!(await canEditStructureAt(user, node.level, node.orgUnitId))) {
      throw new NotPermitted();
    }
    if (!(await canEditInKi(user, node.kiId))) {
      throw new NotPermitted("That year is closed. Only a super admin can change it.");
    }

    await prisma.node.update({ where: { id }, data: { statement } });
    revalidate();
    return { ok: true, message: "Renamed." };
  } catch (error) {
    return permissionAware(error);
  }
}

const updateControlItemSchema = z.object({
  id: z.string().min(1),
  /**
   * The Measure's name, which every Control Item under it shares. Optional
   * because a measure with several is named once: the form opened from its
   * first row offers the name, the forms opened from the others do not, and
   * leaving it out here means "the measure keeps the name it has" rather than
   * "the measure has no name".
   */
  name: z.string().trim().min(1, "Give the measure a name.").max(200).optional(),
  measuredAs: z.string().trim().max(120).nullable(),
  unit: z.enum(["PERCENT", "CURRENCY", "COUNT", "RATIO", "DAYS", "INDEX"]),
  direction: z.enum(["HIGHER_BETTER", "LOWER_BETTER"]),
  aggregation: z.enum(["SUM", "AVERAGE", "LATEST"]),
  decimalPlaces: z.coerce.number().int().min(0).max(4),
  dicOrgUnitId: z.string().min(1, "A Control Item needs a Department in charge."),
  businessUnitId: z.string().min(1, "A Control Item needs a business unit."),
  /**
   * Who keys the number. Optional: `dicOrgUnitId` remains the required
   * accountability, and this names the individual within it. Naming somebody
   * narrows the month-end reminder to them - see lib/reminders/match.ts.
   */
  responsibleUserId: z.string().min(1).nullable().default(null),
});

/**
 * Editing a Control Item in place: everything about it except the code a
 * formula addresses it by.
 *
 * Until this existed the only thing that could change was the name, so a
 * measure filed against the wrong department - or set to sum when it should
 * average - was stuck that way for the year, because the only alternative was
 * to delete it and lose every figure ever keyed against it.
 *
 * Two guards beyond the usual role and year checks.
 *
 * Moving a measure to another department needs authority over *both* ends,
 * not just the one it is leaving. Otherwise a division lead could push work
 * onto a division that never agreed to it, which is the same act as filing it
 * there in the first place - and `addControlItem` already asks permission for
 * that.
 *
 * Changing how a figure is *read* is free; changing what it *means* is not.
 * Roll-up and direction are the two settings that reach back through stored
 * figures: switch sum to average and a closed quarter reads differently,
 * switch higher-is-better to lower and every achievement and evaluation symbol
 * on that row inverts. Doing that to a locked version rewrites what was
 * committed, so it is refused for every role - the same rule, and the same
 * helper, as deleting a row out from under one.
 */
export async function updateControlItem(input: unknown): Promise<StructureResult> {
  try {
    const user = await requireSession();
    const data = updateControlItemSchema.parse(input);

    const item = await prisma.controlItem.findUnique({
      where: { id: data.id },
      select: {
        nodeId: true,
        dicOrgUnitId: true,
        direction: true,
        aggregation: true,
        node: { select: { statement: true, level: true, kiId: true } },
      },
    });
    if (!item) return { ok: false, message: "That Control Item no longer exists." };
    const node = item.node;
    const label = data.name ?? node.statement;

    if (!(await canControlItemScope(user, node.level, item.dicOrgUnitId))) {
      throw new NotPermitted();
    }
    if (
      data.dicOrgUnitId !== item.dicOrgUnitId &&
      !(await canControlItemScope(user, node.level, data.dicOrgUnitId))
    ) {
      throw new NotPermitted(
        "You can only move a measure to a division or department you are responsible for.",
      );
    }
    if (!(await canEditInKi(user, node.kiId))) {
      throw new NotPermitted("That year is closed. Only a super admin can change it.");
    }
    if (!(await canAssignTo(user, data.responsibleUserId))) {
      throw new NotPermitted(
        "You can only make someone in your own division or department responsible for a measure.",
      );
    }

    const changesMeaning =
      data.direction !== item.direction || data.aggregation !== item.aggregation;
    if (changesMeaning) {
      const locked = await lockedVersionsHolding([data.id]);
      if (locked.length) {
        return {
          ok: false,
          message:
            `"${label}" holds figures in ${locked.length === 1 ? "a locked version" : "locked versions"} ` +
            `(${locked.join(", ")}). Changing how it rolls up, or which direction is better, would change ` +
            "what those closed figures say - so it is refused for everyone, including an administrator. " +
            "Everything else about the measure can still be edited. Unlock the version first if this " +
            "genuinely needs to change.",
        };
      }
    }

    // INVERSE is the cost-item convention; a plain ratio is the only meaningful
    // reading for a higher-is-better item. Re-derived here for the same reason
    // it is derived on creation - it is a consequence of direction, not a
    // separate decision.
    const achievementMethod = data.direction === "LOWER_BETTER" ? "INVERSE" : "RATIO";

    // The name belongs to the Objective, so renaming here renames every one
    // of its Control Items at once - which is the point of naming it once.
    if (data.name && data.name !== node.statement) {
      await prisma.node.update({ where: { id: item.nodeId }, data: { statement: data.name } });
    }

    await prisma.controlItem.update({
      where: { id: data.id },
      data: {
        measuredAs: data.measuredAs,
        unit: data.unit,
        direction: data.direction,
        achievementMethod,
        aggregation: data.aggregation,
        decimalPlaces: data.decimalPlaces,
        dicOrgUnitId: data.dicOrgUnitId,
        businessUnitId: data.businessUnitId,
        responsibleUserId: data.responsibleUserId,
      },
    });

    revalidate();
    return { ok: true, message: `${label} updated.` };
  } catch (error) {
    return permissionAware(error);
  }
}

/**
 * A SUPER_ADMIN may rename any Control Item. Everyone else falls through to
 * the same level-and-org-unit rule as the rest of this module, which lets an
 * EXECUTIVE through at any level and an OWNER only at Level 4 within their
 * own org unit.
 */
async function canControlItemScope(
  user: AuthenticatedUser,
  level: number,
  dicOrgUnitId: string,
): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") return true;
  return canEditStructureAt(user, level, dicOrgUnitId);
}

/** Everything that would go with a node: itself, its descendants, their data. */
async function measureNodeDeletion(
  nodeId: string,
): Promise<DeletionImpact & { controlItemIds: string[] }> {
  const nodeIds = await descendantNodeIds(nodeId);
  const controlItems = await prisma.controlItem.findMany({
    where: { nodeId: { in: nodeIds } },
    select: { id: true },
  });
  const controlItemIds = controlItems.map((c) => c.id);
  const entries = controlItemIds.length
    ? await prisma.entry.count({ where: { controlItemId: { in: controlItemIds } } })
    : 0;

  return { nodes: nodeIds.length, controlItems: controlItems.length, entries, controlItemIds };
}

/**
 * The locked plan versions holding at least one figure among these Control
 * Items, by code, for a refusal message that names what is in the way.
 *
 * This is the guard that was missing. Deleting a node removes its Control
 * Items and their entries by database cascade
 * (`onDelete: Cascade` on control_item.node_id and entry.control_item_id), so
 * no application code was ever asked whether a version was locked - and a
 * closed forecast could be erased by deleting the row above it, which is
 * exactly the history-rewrite that lib/entries/save.ts refuses outright.
 *
 * Locked means locked here too, for every role including SUPER_ADMIN. The one
 * sanctioned way to destroy a closed year is Admin -> Empty year, which is
 * about the year rather than one row and carries its own two guards.
 */
async function lockedVersionsHolding(controlItemIds: string[]): Promise<string[]> {
  if (!controlItemIds.length) return [];
  const rows = await prisma.entry.findMany({
    where: {
      controlItemId: { in: controlItemIds },
      planVersion: { lockedAt: { not: null } },
    },
    select: { planVersion: { select: { code: true } } },
    distinct: ["planVersionId"],
  });
  return rows.map((row) => row.planVersion.code);
}

function lockedRefusal(what: string, versions: string[]): StructureResult {
  const list = versions.join(", ");
  return {
    ok: false,
    message:
      `${what} holds figures in ${versions.length === 1 ? "a locked version" : "locked versions"} ` +
      `(${list}). A closed version is the record of what was committed, so nothing may remove it - ` +
      "not even an administrator. Unlock it first if it genuinely needs to change.",
  };
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
    const user = await requireSession();
    const { id, confirm } = deleteSchema.parse(input);

    const node = await prisma.node.findUnique({
      where: { id },
      select: { statement: true, kind: true, level: true, orgUnitId: true, kiId: true },
    });
    if (!node) return { ok: false, message: "That row no longer exists." };
    if (!(await canEditStructureAt(user, node.level, node.orgUnitId))) {
      throw new NotPermitted();
    }
    if (!(await canEditInKi(user, node.kiId))) {
      throw new NotPermitted(
        "That year is closed. Only a super admin can change a Ki that is no longer current.",
      );
    }

    const impact = await measureNodeDeletion(id);

    // Before anything is reported or removed: a closed version's figures are
    // not this delete's to take.
    const locked = await lockedVersionsHolding(impact.controlItemIds);
    if (locked.length) return lockedRefusal(`"${node.statement}"`, locked);

    if (!confirm && (impact.nodes > 1 || impact.controlItems > 0)) {
      const { nodes, controlItems, entries } = impact;
      return {
        ok: false,
        needsConfirmation: true,
        impact: { nodes, controlItems, entries },
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
    return permissionAware(error);
  }
}

export async function deleteControlItem(input: unknown): Promise<StructureResult> {
  try {
    const user = await requireSession();
    const { id, confirm } = deleteSchema.parse(input);

    const item = await prisma.controlItem.findUnique({
      where: { id },
      select: {
        nodeId: true,
        measuredAs: true,
        dicOrgUnitId: true,
        node: {
          select: {
            statement: true,
            level: true,
            kiId: true,
            _count: { select: { controlItems: true } },
          },
        },
      },
    });
    if (!item) return { ok: false, message: "That Control Item no longer exists." };
    const node = item.node;
    const siblingCount = node._count.controlItems;
    const label = controlItemLabel(node.statement, item.measuredAs, siblingCount);
    if (!(await canControlItemScope(user, node.level, item.dicOrgUnitId))) {
      throw new NotPermitted();
    }
    if (!(await canEditInKi(user, node.kiId))) {
      throw new NotPermitted(
        "That year is closed. Only a super admin can change a Ki that is no longer current.",
      );
    }

    const locked = await lockedVersionsHolding([id]);
    if (locked.length) return lockedRefusal(`"${label}"`, locked);

    const entries = await prisma.entry.count({ where: { controlItemId: id } });
    // The Objective survives its last Control Item: an Objective with nothing
    // measuring it is a hole in the deployment the sheet is meant to show, not
    // a row to tidy away.
    const lastOfMeasure = false;

    if (!confirm && entries > 0) {
      const impact = { nodes: 0, controlItems: 1, entries };
      return {
        ok: false,
        needsConfirmation: true,
        impact,
        message:
          `Deleting "${label}" removes ${entries} stored ` +
          `${entries === 1 ? "figure" : "figures"}, including every actual keyed against it. ` +
          (siblingCount <= 1
            ? "The Objective stays, with nothing measuring it. That cannot be undone."
            : `The Objective keeps its other ${siblingCount - 1 === 1 ? "Control Item" : "Control Items"}. ` +
              "That cannot be undone."),
      };
    }

    void lastOfMeasure;
    await prisma.controlItem.delete({ where: { id } });
    revalidate();
    return { ok: true, message: `Deleted "${label}".` };
  } catch (error) {
    return permissionAware(error);
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

// ---------------------------------------------------------------- Ordering

const reorderSchema = z.object({
  kind: z.enum(["NODE", "MEASURE"]),
  id: z.string().min(1),
  /**
   * The sibling the row should land in front of, or null to land last. Sent
   * as a neighbour rather than as an index so a stale sheet cannot silently
   * drop a row somewhere nobody pointed at: an id that is not a sibling at the
   * same level is refused outright.
   */
  beforeId: z.string().min(1).nullable(),
});

/**
 * Moving a row among its siblings. Only `sort_order` is written - never
 * `parent_id`, never `org_unit_id` - so a reorder can rearrange a list and can
 * never re-file a row under a parent its author has no business touching.
 *
 * Locked versions are deliberately not consulted. A lock protects the figures
 * that were committed, and the order rows are printed in is not one of them;
 * this is the same reasoning that lets `renameNode` through. What does apply
 * is `canEditInKi`, so a closed year stays closed.
 */
export async function reorderRow(input: unknown): Promise<StructureResult> {
  try {
    const user = await requireSession();
    const { kind, id, beforeId } = reorderSchema.parse(input);
    return kind === "NODE"
      ? await reorderNode(user, id, beforeId)
      : await reorderControlItem(user, id, beforeId);
  } catch (error) {
    if (error instanceof ReorderError) return { ok: false, message: error.message };
    return permissionAware(error);
  }
}

async function reorderNode(
  user: AuthenticatedUser,
  id: string,
  beforeId: string | null,
): Promise<StructureResult> {
  const node = await prisma.node.findUnique({
    where: { id },
    select: { kiId: true, parentId: true, level: true, orgUnitId: true },
  });
  if (!node) return { ok: false, message: "That row no longer exists." };
  if (!(await canEditStructureAt(user, node.level, node.orgUnitId))) throw new NotPermitted();
  if (!(await canEditInKi(user, node.kiId))) {
    throw new NotPermitted("That year is closed. Only a super admin can change it.");
  }

  const siblings = await prisma.node.findMany({
    where: { kiId: node.kiId, parentId: node.parentId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, level: true },
  });

  const updates = reorderWithinLevel(siblings, id, beforeId);
  await prisma.$transaction(
    updates.map((update) =>
      prisma.node.update({ where: { id: update.id }, data: { sortOrder: update.sortOrder } }),
    ),
  );

  revalidate();
  return { ok: true, message: "Moved." };
}

async function reorderControlItem(
  user: AuthenticatedUser,
  id: string,
  beforeId: string | null,
): Promise<StructureResult> {
  const item = await prisma.controlItem.findUnique({
    where: { id },
    select: {
      nodeId: true,
      dicOrgUnitId: true,
      node: {
        select: {
          level: true,
          kiId: true,
          parentId: true,
          _count: { select: { controlItems: true } },
        },
      },
    },
  });
  if (!item) return { ok: false, message: "That Control Item no longer exists." };
  const node = item.node;
  if (!(await canControlItemScope(user, node.level, item.dicOrgUnitId))) {
    throw new NotPermitted();
  }
  if (!(await canEditInKi(user, node.kiId))) {
    throw new NotPermitted("That year is closed. Only a super admin can change it.");
  }

  /*
   * Two different moves wear the same drag handle, and which one it is follows
   * from what is being dragged rather than from a second control.
   *
   * A Control Item of an Objective judged on several things moves among those
   * - the Objective keeps its place in the plan and its own rows reorder
   * inside it. An Objective judged on one thing has no such siblings, so
   * dragging its row moves the *Objective* among the Objectives beside it,
   * which is what somebody reordering the sheet means by it.
   */
  if (node._count.controlItems > 1) {
    const siblings = await prisma.controlItem.findMany({
      where: { nodeId: item.nodeId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const updates = reorderWithinLevel(
      siblings.map((sibling) => ({ id: sibling.id, level: node.level })),
      id,
      beforeId,
    );
    await prisma.$transaction(
      updates.map((update) =>
        prisma.controlItem.update({
          where: { id: update.id },
          data: { sortOrder: update.sortOrder },
        }),
      ),
    );
    revalidate();
    return { ok: true, message: "Moved." };
  }

  // Reordering Objectives: the row dragged and the row dropped in front of are
  // both Control Items, so both resolve to the Objectives they belong to.
  const beforeNodeId = beforeId
    ? (await prisma.controlItem.findUnique({ where: { id: beforeId }, select: { nodeId: true } }))
        ?.nodeId ?? null
    : null;
  return reorderNode(user, item.nodeId, beforeNodeId);
}

// ------------------------------------------------------------ Control Items

const addControlItemSchema = z.object({
  nodeId: z.string().min(1),
  name: z.string().trim().min(1, "Give the measure a name.").max(200),
  /**
   * The code a formula will address this by. Normally derived from the name,
   * because it is machinery rather than a decision - but an upload carries
   * codes somebody already planned against, and generating a different one
   * would break the very references the file was written to use.
   */
  code: z.string().trim().min(1).max(30).optional(),
  measuredAs: z.string().trim().max(120).nullable(),
  unit: z.enum(["PERCENT", "CURRENCY", "COUNT", "RATIO", "DAYS", "INDEX"]),
  direction: z.enum(["HIGHER_BETTER", "LOWER_BETTER"]),
  aggregation: z.enum(["SUM", "AVERAGE", "LATEST"]),
  decimalPlaces: z.coerce.number().int().min(0).max(4),
  dicOrgUnitId: z.string().min(1, "A Control Item needs a Department in charge."),
  businessUnitId: z.string().min(1, "A Control Item needs a business unit."),
  /**
   * Who keys the number. Optional: `dicOrgUnitId` remains the required
   * accountability, and this names the individual within it. Naming somebody
   * narrows the month-end reminder to them - see lib/reminders/match.ts.
   */
  responsibleUserId: z.string().min(1).nullable().default(null),
});

export async function addControlItem(input: unknown): Promise<StructureResult> {
  try {
    const user = await requireSession();
    const data = addControlItemSchema.parse(input);

    const node = await prisma.node.findUnique({
      where: { id: data.nodeId },
      select: { kind: true, kiId: true, level: true, orgUnitId: true },
    });
    if (!node) return { ok: false, message: "That row no longer exists." };

    /*
     * "Add a measure under this row" now means "add an Objective under it,
     * with the first thing that measures it" - the two are one act since the
     * tree was flattened.
     *
     * A Goal takes a Level 2 Objective and a Level 2 Objective takes a Level
     * 3. Level 4 is not offered here whatever the row: a department branch
     * carries an org unit, so it goes through addDepartmentBranch, and an
     * Objective created here would belong to nobody.
     */
    const goingTo = node.level + 1;
    if (goingTo > 3) {
      return {
        ok: false,
        message:
          "Level 4 work belongs to a department, so it is added with the L4+ button, which asks " +
          "which division or department it is for.",
      };
    }
    if (!(await canEditStructureAt(user, goingTo, null))) {
      throw new NotPermitted(
        "Only a super admin or an executive can add to the company structure.",
      );
    }
    if (!(await canEditInKi(user, node.kiId))) {
      throw new NotPermitted("That year is closed. Only a super admin can add to it.");
    }
    if (!(await canAssignTo(user, data.responsibleUserId))) {
      throw new NotPermitted(
        "You can only make someone in your own division or department responsible for a measure.",
      );
    }

    // INVERSE is a cost-item convention; the plain ratio is the only meaningful
    // reading for a higher-is-better item, so it is chosen here rather than asked.
    const achievementMethod = data.direction === "LOWER_BETTER" ? "INVERSE" : "RATIO";

    // A new Objective and its first Control Item, created together. Adding a
    // "measure" from the sheet means exactly this now: a statement with one
    // thing measuring it.
    const sortOrder = await firstSortOrder(node.kiId, data.nodeId, goingTo);
    const objective = await prisma.node.create({
      data: {
        kiId: node.kiId,
        parentId: data.nodeId,
        kind: "OBJECTIVE",
        level: goingTo,
        statement: data.name,
        orgUnitId: node.orgUnitId,
        sortOrder,
      },
    });
    const created = await prisma.controlItem.create({
      data: {
        nodeId: objective.id,
        code: data.code ? await freeCode(data.code) : await uniqueCode(data.name),
        measuredAs: data.measuredAs,
        unit: data.unit,
        direction: data.direction,
        achievementMethod,
        aggregation: data.aggregation,
        decimalPlaces: data.decimalPlaces,
        dicOrgUnitId: data.dicOrgUnitId,
        businessUnitId: data.businessUnitId,
        responsibleUserId: data.responsibleUserId,
        sortOrder: 0,
      },
    });

    revalidate();
    return { ok: true, message: `${data.name} added.`, id: created.id };
  } catch (error) {
    return permissionAware(error);
  }
}

const addToObjectiveSchema = addControlItemSchema
  .omit({ nodeId: true, name: true })
  .extend({ objectiveId: z.string().min(1) });

/**
 * Another Control Item under an Objective that already exists.
 *
 * This is what lets one Objective be held to several targets at once - a
 * service experience judged on an NPS, a first-time fix rate and a waiting
 * time together. The new Control Item shares only the statement. Its unit,
 * direction, roll-up, department, business unit and responsible person are its
 * own, and it is keyed, rolled up and evaluated entirely separately.
 *
 * Permission follows the Objective's own level, exactly as adding the first
 * one does: adding to an Objective is filing work on a division, whichever row
 * on the sheet the form was opened from.
 */
export async function addControlItemToObjective(input: unknown): Promise<StructureResult> {
  try {
    const user = await requireSession();
    const data = addToObjectiveSchema.parse(input);

    const measure = await prisma.node.findUnique({
      where: { id: data.objectiveId },
      select: {
        statement: true,
        kiId: true,
        level: true,
        kind: true,
        orgUnitId: true,
        _count: { select: { controlItems: true } },
      },
    });
    if (!measure || measure.kind !== "OBJECTIVE") {
      return { ok: false, message: "That Objective no longer exists." };
    }

    if (measure.level === 4) {
      /*
       * Both ends, and the branch first.
       *
       * A Level 4 Objective belongs to the division or department that started
       * it, so adding to it is editing their branch - checking only the
       * Department the form chose would let any division lead hang their own
       * work off somebody else's row.
       */
      if (!(await canEditStructureAt(user, 4, measure.orgUnitId))) {
        throw new NotPermitted(
          "That branch belongs to another division. You can only add to your own.",
        );
      }
      if (!(await canEditStructureAt(user, 4, data.dicOrgUnitId))) throw new NotPermitted();
    } else if (!(await canEditStructureAt(user, measure.level, null))) {
      throw new NotPermitted(
        "Only a super admin or an executive can add a Control Item to the company structure.",
      );
    }
    if (!(await canEditInKi(user, measure.kiId))) {
      throw new NotPermitted("That year is closed. Only a super admin can add to it.");
    }
    if (!(await canAssignTo(user, data.responsibleUserId))) {
      throw new NotPermitted(
        "You can only make someone in your own division or department responsible for a measure.",
      );
    }

    const achievementMethod = data.direction === "LOWER_BETTER" ? "INVERSE" : "RATIO";
    const created = await prisma.controlItem.create({
      data: {
        nodeId: data.objectiveId,
        // Derived from the statement and what this one measures, so three
        // Control Items of one Objective do not collide on the name alone.
        code: await uniqueCode(`${measure.statement} ${data.measuredAs ?? ""}`),
        measuredAs: data.measuredAs,
        unit: data.unit,
        direction: data.direction,
        achievementMethod,
        aggregation: data.aggregation,
        decimalPlaces: data.decimalPlaces,
        dicOrgUnitId: data.dicOrgUnitId,
        businessUnitId: data.businessUnitId,
        responsibleUserId: data.responsibleUserId,
        sortOrder: measure._count.controlItems,
      },
    });

    revalidate();
    return {
      ok: true,
      message: `Added a Control Item to "${measure.statement}".`,
      id: created.id,
    };
  } catch (error) {
    return permissionAware(error);
  }
}

/**
 * A caller's own code, refused when something already answers to it.
 *
 * Suffixing a duplicate the way `uniqueCode` does would be wrong here: the
 * caller asked for *this* code because a formula or a spreadsheet already
 * refers to it, and quietly filing it as CODE-2 would leave both broken.
 */
async function freeCode(code: string): Promise<string> {
  const wanted = code.trim().toUpperCase();
  const taken = await prisma.controlItem.findUnique({ where: { code: wanted }, select: { id: true } });
  if (taken) throw new Error(`The code ${wanted} is already in use.`);
  return wanted;
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

// --------------------------------------------------------------------- Read

/**
 * Which org units the signed-in user may file a new Level 4 branch or Control
 * Item under. The add-department form uses this to build its picker instead
 * of showing every division in the company to someone who may only use one.
 */
export interface AssignableDic {
  id: string;
  code: string;
  name: string;
  type: "DIVISION" | "DEPARTMENT";
  parentCode: string | null;
}

export async function assignableDics(): Promise<AssignableDic[]> {
  const user = await requireSession();
  const scope = await assignableOrgUnitIds(user);
  if (scope !== "ALL" && scope.length === 0) return [];

  const rows = await prisma.orgUnit.findMany({
    where: {
      type: { in: ["DIVISION", "DEPARTMENT"] },
      ...(scope === "ALL" ? {} : { id: { in: scope } }),
    },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
    select: { id: true, code: true, name: true, type: true, parentId: true },
  });

  const codeById = new Map(rows.map((row) => [row.id, row.code]));
  // A Department's own parent Division may sit outside the OWNER's scope in
  // theory, but never in practice - a Department's parent is always the
  // Division that contains it, and covering the Department implies covering
  // the Division. Fetched separately only if that ever stops holding.
  const missingParents = rows.filter((row) => row.parentId && !codeById.has(row.parentId));
  if (missingParents.length) {
    const parents = await prisma.orgUnit.findMany({
      where: { id: { in: missingParents.map((row) => row.parentId!) } },
      select: { id: true, code: true },
    });
    for (const parent of parents) codeById.set(parent.id, parent.code);
  }

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type as "DIVISION" | "DEPARTMENT",
    parentCode: row.type === "DEPARTMENT" && row.parentId ? codeById.get(row.parentId) ?? null : null,
  }));
}

/**
 * Which people the signed-in user may name responsible for a measure.
 *
 * Same shape and same reasoning as `assignableDics` above: scoped on the
 * server rather than fetched whole and filtered on screen, so a stale or
 * manipulated client cannot offer somebody it should not.
 *
 * Only existing, active accounts. This never creates or provisions anyone -
 * if a person has not been invited they simply do not appear, and the lead
 * knows to ask an admin. Invite-only has to keep meaning something.
 */
export interface AssignableUser {
  id: string;
  name: string;
  email: string;
  orgUnitCode: string | null;
}

export async function assignableUsers(): Promise<AssignableUser[]> {
  const user = await requireSession();
  const scope = await assignableOrgUnitIds(user);
  if (scope !== "ALL" && scope.length === 0) return [];

  const rows = await prisma.appUser.findMany({
    where: {
      isActive: true,
      ...(scope === "ALL" ? {} : { orgUnitId: { in: scope } }),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, orgUnit: { select: { code: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    orgUnitCode: row.orgUnit?.code ?? null,
  }));
}

/**
 * Whether this user may hand a measure to that person. Re-derived from the
 * database on every write rather than trusted from the form.
 */
async function canAssignTo(
  user: AuthenticatedUser,
  responsibleUserId: string | null,
): Promise<boolean> {
  // Clearing the field is always allowed - it hands the measure back to the
  // org unit, which is where it started.
  if (!responsibleUserId) return true;
  if (user.role === "SUPER_ADMIN" || user.role === "EXECUTIVE") {
    const exists = await prisma.appUser.findFirst({
      where: { id: responsibleUserId, isActive: true },
      select: { id: true },
    });
    return Boolean(exists);
  }
  const scope = await assignableOrgUnitIds(user);
  if (scope === "ALL") return true;
  if (scope.length === 0) return false;
  const match = await prisma.appUser.findFirst({
    where: { id: responsibleUserId, isActive: true, orgUnitId: { in: scope } },
    select: { id: true },
  });
  return Boolean(match);
}

function permissionAware(error: unknown): StructureResult {
  if (error instanceof NotPermitted) {
    return {
      ok: false,
      message: error.message || "You do not have permission to do that.",
    };
  }
  return fail(error);
}
