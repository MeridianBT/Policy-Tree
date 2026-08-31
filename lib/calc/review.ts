/**
 * The month-end review: what a Hoshin review actually asks, in the order it
 * asks it.
 *
 * A monthly review opens with four questions. The sheet answers two of them
 * well - "what is off track" is the Below target preset, and "who owns it" is
 * the responsible person on the row - and this module exists for the other
 * two, which no screen answered before it:
 *
 *   Is the data even in?        /my-entries shows what one person owes.
 *                               Nobody could see the company's gap.
 *   What is getting worse?      The sheet shows every month, but a direction
 *                               of travel had to be read off twelve columns
 *                               by eye, one row at a time.
 *
 * So the ranking here is by movement, not by depth. A measure at 92% falling
 * from 110% is the review's business; a measure at 92% climbing from 80% is
 * somebody's plan working, and putting the second above the first because its
 * number is lower would waste the meeting on the wrong row.
 *
 * Pure: no React, no Prisma, no fetching. Everything comes from rows the sheet
 * has already loaded, so the page costs one query and the rule can be tested
 * directly.
 */

import type { ControlItemRow, SheetRowModel } from "@/lib/sheet/types";
import type { SheetCell } from "@/lib/calc/row";
import { belowTargetIn, monthCell } from "@/components/sheet/below-target";
import { controlItemLabel } from "@/lib/calc/item-label";

/**
 * How much achievement has to move before it counts as movement.
 *
 * One point - 0.01 of the ratio. Without a width every row lands in
 * "worsening" or "recovering" on rounding noise, and a list where everything
 * is moving says nothing about what is moving.
 */
export const FLAT_BAND = 0.01;

export type Movement = "WORSENING" | "FLAT" | "RECOVERING" | "NEW";

export interface ReviewLine {
  id: string;
  code: string;
  name: string;
  dicCode: string;
  dicName: string;
  responsibleUserName: string | null;
  unit: ControlItemRow["unit"];
  decimalPlaces: number;
  /** The anchor month's own cell: value, achievement, symbol and colour. */
  cell: SheetCell;
  /** Achievement in the previous month, or null when there is none to compare. */
  previousAchievement: number | null;
  /** Achievement now minus achievement then, or null when there is no previous. */
  change: number | null;
  movement: Movement;
  /** Every month of the Ki in order, for the row's own history strip. */
  months: SheetCell[];
}

export interface MissingLine {
  id: string;
  code: string;
  name: string;
  dicCode: string;
  dicName: string;
  responsibleUserName: string | null;
}

/**
 * One person's outstanding measures.
 *
 * The chase list is grouped by who is being chased rather than by measure,
 * because that is the unit of the conversation: eighty-two measure names is a
 * wall, and "the Automotive Director owes twelve" is a sentence somebody can
 * act on. The division carries the group when nobody is named, which is itself
 * the finding - an unowned measure has no one to ask.
 */
export interface OwnerGroup {
  /** The person's name, or null when the measure names nobody. */
  owner: string | null;
  dicCode: string;
  dicName: string;
  lines: MissingLine[];
}

export interface ReviewReporting {
  /** Measures that could have reported an actual for this month. */
  expected: number;
  /** Those that did. */
  reported: number;
  /** Those that did not, worst-covered division first. */
  missing: MissingLine[];
  /** The same measures, grouped by who to ask, most outstanding first. */
  missingByOwner: OwnerGroup[];
  /**
   * Measures carrying no target for this month. A different failure from an
   * unreported actual - nobody planned it, rather than nobody reported it -
   * and the sheet hides both behind the same em dash.
   */
  untargeted: MissingLine[];
}

export interface Review {
  reporting: ReviewReporting;
  /** Below target this month, worsening first, capped at ATTENTION_LIMIT. */
  attention: ReviewLine[];
  /** What the cap left out, and how much of it is still falling. */
  attentionOverflow: { count: number; worsening: number };
  /** Every measure below target this month, before the cap. */
  attentionTotal: number;
  /** The largest gains and falls, whether or not they are below target. */
  movers: { up: ReviewLine[]; down: ReviewLine[] };
}

const MOVERS = 3;

/**
 * How long the attention list may get.
 *
 * A review has an hour and the list is read aloud, so a page that lists every
 * measure below target has quietly become the sheet again - and the sheet
 * shows them better, beside their numbers. The ranking puts what is falling at
 * the top, so a cap keeps exactly the rows worth the meeting's time; what it
 * cuts is counted and named underneath, with a link to the sheet's own Below
 * target preset for the full list.
 */
export const ATTENTION_LIMIT = 15;

export function isControlItem(row: SheetRowModel): row is ControlItemRow {
  return row.kind === "CONTROL_ITEM";
}

/**
 * The month a review opens on: the latest month carrying any actual at all.
 *
 * Deliberately not `openMonth` (lib/entries/query.ts), which is the month
 * still being keyed and is what /my-entries and the reminder chase. A review
 * looks at the last month there is something to review. The two are different
 * questions and the month selector moves between them - picking the open month
 * is how the chase list is read.
 */
export function latestReviewableMonth(
  rows: readonly SheetRowModel[],
  months: readonly string[],
): string | null {
  for (let i = months.length - 1; i >= 0; i--) {
    const period = months[i];
    for (const row of rows) {
      if (!isControlItem(row)) continue;
      const cell = monthCell(row.cells, period);
      if (cell?.actual !== null && cell?.actual !== undefined) return period;
    }
  }
  return null;
}

function movementOf(change: number | null): Movement {
  if (change === null) return "NEW";
  if (change <= -FLAT_BAND) return "WORSENING";
  if (change >= FLAT_BAND) return "RECOVERING";
  return "FLAT";
}

/** Worsening first, then flat and new, then recovering. */
const MOVEMENT_ORDER: Record<Movement, number> = {
  WORSENING: 0,
  FLAT: 1,
  NEW: 1,
  RECOVERING: 2,
};

export function buildReview(
  rows: readonly SheetRowModel[],
  period: string,
  previousPeriod: string | null,
  months: readonly string[],
): Review {
  const missing: MissingLine[] = [];
  const untargeted: MissingLine[] = [];
  const lines: ReviewLine[] = [];
  let expected = 0;

  for (const row of rows) {
    if (!isControlItem(row)) continue;
    const cell = monthCell(row.cells, period);
    if (!cell) continue;
    expected += 1;

    const identity: MissingLine = {
      id: row.id,
      code: row.code,
      // One line per Control Item and no grouping to lean on, so a measure
      // with several names which of them this line is about.
      name: controlItemLabel(row.name, row.measuredAsRaw, row.objectiveItemCount),
      dicCode: row.dicCode,
      dicName: row.dicName,
      responsibleUserName: row.responsibleUserName,
    };

    // A measure nobody set a target for is a planning gap, and it is counted
    // whether or not an actual arrived - the two are independent.
    if (cell.target === null || cell.target === undefined) untargeted.push(identity);

    if (cell.actual === null || cell.actual === undefined) {
      // Unreported and below target are mutually exclusive on purpose:
      // "nobody has told us" and "we are losing" must not share a list.
      missing.push(identity);
      continue;
    }

    const previousCell = previousPeriod ? monthCell(row.cells, previousPeriod) : null;
    const previousAchievement = previousCell?.achievement ?? null;
    const change =
      cell.achievement !== null && cell.achievement !== undefined && previousAchievement !== null
        ? cell.achievement - previousAchievement
        : null;

    lines.push({
      ...identity,
      unit: row.unit,
      decimalPlaces: row.decimalPlaces,
      cell,
      previousAchievement,
      change,
      movement: movementOf(change),
      months: months
        .map((month) => monthCell(row.cells, month))
        .filter((month): month is SheetCell => month !== null),
    });
  }

  const below = lines
    .filter((line) => belowTargetIn(line.cell))
    .sort((a, b) => {
      const byMovement = MOVEMENT_ORDER[a.movement] - MOVEMENT_ORDER[b.movement];
      if (byMovement !== 0) return byMovement;
      // Worst first inside a bucket.
      return (a.cell.achievement ?? 0) - (b.cell.achievement ?? 0);
    });
  const attention = below.slice(0, ATTENTION_LIMIT);
  const beyond = below.slice(ATTENTION_LIMIT);

  const moved = lines.filter((line) => line.change !== null);
  const byChange = [...moved].sort((a, b) => (b.change ?? 0) - (a.change ?? 0));
  const up = byChange.filter((line) => (line.change ?? 0) >= FLAT_BAND).slice(0, MOVERS);
  const down = byChange
    .filter((line) => (line.change ?? 0) <= -FLAT_BAND)
    .slice(-MOVERS)
    .reverse();

  return {
    reporting: {
      expected,
      reported: lines.length,
      missing: sortByOwner(missing),
      missingByOwner: groupByOwner(missing),
      untargeted: sortByOwner(untargeted),
    },
    attention,
    attentionOverflow: {
      count: beyond.length,
      worsening: beyond.filter((line) => line.movement === "WORSENING").length,
    },
    attentionTotal: below.length,
    movers: { up, down },
  };
}

/**
 * Grouped by who to ask, most outstanding first, so the chase starts with the
 * person holding the most of it. An unnamed measure groups under its own org
 * unit rather than being folded in with every other unnamed one - the question
 * "who owns this" is asked of a division, not of the company.
 */
function groupByOwner(lines: MissingLine[]): OwnerGroup[] {
  const groups = new Map<string, OwnerGroup>();
  for (const line of sortByOwner(lines)) {
    const key = line.responsibleUserName ?? `dic:${line.dicCode}`;
    const group = groups.get(key) ?? {
      owner: line.responsibleUserName,
      dicCode: line.dicCode,
      dicName: line.dicName,
      lines: [],
    };
    group.lines.push(line);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.lines.length - a.lines.length ||
      (a.owner ?? a.dicCode).localeCompare(b.owner ?? b.dicCode),
  );
}

/** Read-aloud order: division, then person, then code. */
function sortByOwner(lines: MissingLine[]): MissingLine[] {
  return [...lines].sort(
    (a, b) =>
      a.dicCode.localeCompare(b.dicCode) ||
      (a.responsibleUserName ?? "").localeCompare(b.responsibleUserName ?? "") ||
      a.code.localeCompare(b.code),
  );
}
