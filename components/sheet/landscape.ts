/**
 * The company plan laid out across the page instead of down it.
 *
 * Portrait - the sheet proper - reads top to bottom: a Goal, its Objectives
 * indented beneath it, their figures running away to the right across twelve
 * months. That is the operating surface, and it is the right shape for keying
 * and for reading a year.
 *
 * Landscape reads left to right, which is the direction deployment actually
 * runs: this Goal is held to these Level 2 Objectives, and this Level 2
 * deploys into these Level 3 ones. It exists so the company fits a 16:9 slide,
 * so it carries one figure per measure rather than seventeen, and it stops at
 * Level 3 - a department branch belongs to the division that owns it, not to a
 * board slide.
 *
 * Pure, and in its own module for the reason components/sheet/filters.ts gives:
 * the row arithmetic is the part worth testing directly, and a .tsx file cannot
 * be imported by the test runner.
 *
 * **What this layout will show you about the plan, and should not hide.** The
 * right-hand column is empty far more often than not. Measured on the current
 * year: 59 Level 2 Objectives, of which 9 have anything at Level 3 at all, and
 * only 7 Level 3 measures exist in the whole company. So fifty rows will print
 * with nothing beside them. That is not a layout fault to design around - it is
 * what the plan says, and the cascade already makes the same argument for
 * printing a line under an Objective nothing ladders into. The gap is the
 * finding.
 */

import { buildCascadeTree, type CascadeNode } from "./outline";
import type { ControlItemRow, GroupRow, SheetRowModel } from "@/lib/sheet/types";
import type { Unit } from "@/lib/calc/types";
import type { SheetCell } from "@/lib/calc/row";
import { quarterFigures, type QuarterFigure } from "./quarter-figures";
import type { QuarterCode } from "@/lib/domain/period";

export type SheetOrientation = "PORTRAIT" | "LANDSCAPE";

/**
 * Which period the single figure column shows. "KI" is the year total.
 *
 * Landscape has one figure per measure where the sheet has seventeen, so the
 * question the sheet answers by scrolling - which month am I looking at - this
 * view has to answer by choosing. The quarter picker earns its place again:
 * "here is where Q2 landed" is a slide somebody actually wants.
 */
export type LandscapePeriod = "KI" | QuarterCode;

/** One figure block, or four quarters of them. */
export type LandscapeFigures = "PERIOD" | "QUARTERS";

/** One measure, reduced to what a slide has room for. */
export interface LandscapeMeasure {
  /** The Control Item's id, or the Objective's when it carries no measure. */
  id: string;
  /** The Objective's statement - what the sheet prints in Measures. */
  statement: string;
  /**
   * The Objective this measure is held against. Several measures share one,
   * which is the whole reason `statementSpan` exists.
   */
  objectiveId: string;
  /**
   * Rows this measure's statement covers, or 0 when the statement belongs to a
   * measure above it and this row leaves the column alone.
   *
   * A Control Item row carries *its Objective's* statement as its name - every
   * one of the Objective's rows does, see `lib/sheet/query.ts` - so printing
   * each row's statement writes the same sentence three times down the column
   * this view can least afford to waste. The sheet prints it once and hangs the
   * rest off a `└`; a table can do better and span the cell.
   */
  statementSpan: number;
  /** How it is measured. Empty on an Objective with nothing against it. */
  measuredAs: string;
  code: string | null;
  /** The org unit accountable, as the sheet badges it beside every measure. */
  dicCode: string | null;
  dicName: string | null;
  unit: Unit | null;
  decimalPlaces: number;
  /**
   * Every derived cell for this row, kept so a period can be chosen or the
   * four quarters read without rebuilding the tree. It is the same array the
   * sheet holds, not a copy.
   */
  cells: readonly SheetCell[];
  /** The chosen period's figures, from that period's own cell. Never recomputed here. */
  target: number | null;
  actual: number | null;
  symbol: string | null;
  symbolLabel: string | null;
  symbolColor: string | null;
  /**
   * True when the Objective has no Control Item yet. Printed rather than
   * skipped: a policy written down and not yet measured is a hole in the
   * deployment, and hiding it would defeat the page.
   */
  unmeasured: boolean;
}

/**
 * One Level 2 Objective and whatever deploys from it.
 *
 * `rows` is the printed height: an Objective held to one measure with nothing
 * beneath it is one row, and one carrying two measures beside three Level 3
 * measures is three. The renderer emits that many `<tr>`s and indexes into
 * both sides, so the taller side sets the height and the shorter one runs out.
 */
export interface LandscapeL2 {
  left: LandscapeMeasure[];
  right: LandscapeMeasure[];
  rows: number;
  /**
   * Row span for a side holding exactly one measure in a block taller than one
   * row - which is what happens whenever an Objective deploys into several.
   *
   * Without it the measure prints in the first row and the rows beneath it
   * come out blank, so four Level 3 Objectives under one Level 2 read as one
   * Objective and three empty ones. The span is the relationship: a cell four
   * rows tall says those four belong to it, with no connector lines to draw.
   *
   * A side holding more than one measure gets one cell per row and leaves the
   * remainder blank. Spreading two measures unevenly over four rows would be
   * inventing a grouping the plan does not state.
   */
  leftSpan: number;
  rightSpan: number;
}

export interface LandscapeGoal {
  id: string;
  statement: string;
  /** Its place in the company's priority list, when it has one. */
  ordinal: number | null;
  objectives: LandscapeL2[];
  /**
   * Measure rows this Goal owns - what its heading stands over.
   *
   * It is not the Goal's printed height: the heading itself is a row too, so
   * the block is `rows + 1` on the page. `landscapeFit` adds those back, which
   * is the only place the distinction matters.
   */
  rows: number;
}

/**
 * Rows that fit one 16:9 slide, at a size somebody can read from a chair.
 *
 * 13.333in x 7.5in is 338.7 x 190.5mm. Take 10mm of margin each way and about
 * 12mm for the title band and 158mm of height is left. A single-line row at
 * 9pt is about 4.5mm with its padding, so thirty-five rows fit.
 *
 * Single-line is a measured assumption, not a hopeful one: on the current year
 * no Objective statement exceeds 40 characters and the average is 25, so at
 * this column width nothing wraps. A plan written in sentences rather than
 * phrases would wrap and this number would be optimistic - which is why the
 * page count is shown on screen rather than promised in a document.
 */
export const ROWS_PER_SLIDE = 35;

export interface LandscapeFit {
  /**
   * Printed rows across every goal, its heading row included.
   *
   * The heading counts because it takes vertical space like anything else, and
   * this number is what the slide estimate divides. Counting only the measures
   * would under-report by one per Goal and quietly promise a slide that does
   * not fit.
   */
  rows: number;
  /** Measures on the page, both sides counted. */
  measures: number;
  /** Measures deployed at Level 3 - the right-hand column's whole content. */
  deployed: number;
  rowsPerSlide: number;
  slides: number;
}

/**
 * Turn sheet rows into the bracket, reusing the cascade's own tree.
 *
 * `buildCascadeTree` already resolves the awkward part: an Objective held to
 * exactly one Control Item has no heading row, so that Control Item row *is*
 * the Objective as far as a child's ancestry is concerned. Rebuilding that
 * here would be a second place for it to be got wrong.
 *
 * Levels are read off the rows rather than assumed. Anything at Level 4 is
 * dropped: this is the company page, and a caller that hands over a sheet with
 * departments folded in gets the company back rather than a surprise.
 */
export function buildLandscape(
  rows: readonly SheetRowModel[],
  /** Which period the figures come from. The year total unless a quarter is picked. */
  period: LandscapePeriod = "KI",
): LandscapeGoal[] {
  const goals: LandscapeGoal[] = [];

  for (const root of buildCascadeTree(rows)) {
    if (root.row.level !== 1) continue;
    const group = root.row as GroupRow;

    const objectives: LandscapeL2[] = [];
    for (const child of root.children) {
      if (child.row.level !== 2) continue;

      const ownLeft = ownMeasures(child, 2, period);
      const ownRight = child.children
        .filter((grandchild) => grandchild.row.level === 3)
        .flatMap((grandchild) => ownMeasures(grandchild, 3, period));

      const rows = Math.max(ownLeft.length, ownRight.length, 1);
      const left = spanStatements(ownLeft, rows);
      const right = spanStatements(ownRight, rows);
      objectives.push({
        left,
        right,
        rows,
        leftSpan: left.length === 1 ? rows : 1,
        rightSpan: right.length === 1 ? rows : 1,
      });
    }

    if (objectives.length === 0) continue;
    goals.push({
      id: group.id,
      statement: group.statement,
      ordinal: group.ordinal ?? null,
      objectives,
      rows: objectives.reduce((total, objective) => total + objective.rows, 0),
    });
  }

  return goals;
}

/**
 * The measures an Objective is held to, at its own level.
 *
 * Two shapes arrive here. An Objective with one Control Item is that row
 * itself; one with two or more - or with none - is a heading whose Control
 * Items are its children. Filtering the children by level matters: a heading's
 * children also include the Objectives deployed from it, and counting those as
 * its own measures would print a Level 3 statement in the Level 2 column.
 */
/**
 * One statement per Objective, spanning the measures it is held to.
 *
 * Consecutive runs rather than a lookup by id, because two Objectives are never
 * interleaved here: the left-hand side is one Objective's own measures and the
 * right is a `flatMap` over its Level 3s, so a run *is* an Objective. That is
 * the assumption which would break quietly if either side ever learned to
 * interleave, so it is stated rather than left to be discovered.
 *
 * Filtering does not disturb it - `matchRows` drops whole rows, so what is left
 * of an Objective is still contiguous.
 */
function spanStatements(measures: LandscapeMeasure[], rows: number): LandscapeMeasure[] {
  // One measure keeps the whole-block rule the side spans use, so the statement
  // cell and the cells beside it stay the same height.
  if (measures.length === 1) return [{ ...measures[0], statementSpan: rows }];

  return measures.map((measure, index) => {
    if (index > 0 && measures[index - 1].objectiveId === measure.objectiveId) {
      return { ...measure, statementSpan: 0 };
    }
    let span = 1;
    while (measures[index + span]?.objectiveId === measure.objectiveId) span++;
    return { ...measure, statementSpan: span };
  });
}

function ownMeasures(node: CascadeNode, level: number, period: LandscapePeriod): LandscapeMeasure[] {
  if (node.row.kind === "CONTROL_ITEM") {
    return [measureFrom(node.row as ControlItemRow, period)];
  }

  const own = node.children
    .filter((child) => child.row.kind === "CONTROL_ITEM" && child.row.level === level)
    .map((child) => measureFrom(child.row as ControlItemRow, period));

  if (own.length > 0) return own;

  // An Objective with nothing measured against it. It still occupies a row,
  // and says so.
  const group = node.row as GroupRow;
  return [
    {
      id: group.id,
      statement: group.statement,
      objectiveId: group.id,
      statementSpan: 1,
      measuredAs: "",
      code: null,
      dicCode: null,
      dicName: null,
      cells: [],
      unit: null,
      decimalPlaces: 0,
      target: null,
      actual: null,
      symbol: null,
      symbolLabel: null,
      symbolColor: null,
      unmeasured: true,
    },
  ];
}

function measureFrom(row: ControlItemRow, period: LandscapePeriod): LandscapeMeasure {
  /*
   * Found by kind and quarter rather than by position. The Ki total is the
   * last column today, but a reader narrowing to a single quarter changes what
   * is in the array - and an index would then read a quarter as the year,
   * which is the kind of wrong that looks right.
   */
  const cell =
    row.cells.find((candidate) =>
      period === "KI" ? candidate.kind === "KI" : candidate.kind === "QUARTER" && candidate.quarter === period,
    ) ?? null;
  return {
    id: row.id,
    statement: row.name,
    objectiveId: row.objectiveId,
    // Filled in by `spanStatements` once the side is assembled, which is the
    // only place that can see how many measures share this Objective.
    statementSpan: 1,
    measuredAs: row.measuredAs,
    code: row.code,
    dicCode: row.dicCode,
    dicName: row.dicName,
    cells: row.cells,
    unit: row.unit,
    decimalPlaces: row.decimalPlaces,
    target: cell?.target ?? null,
    actual: cell?.actual ?? null,
    symbol: cell?.symbol ?? null,
    symbolLabel: cell?.symbolLabel ?? null,
    symbolColor: cell?.symbolColor ?? null,
    unmeasured: false,
  };
}

/**
 * How many slides this would take, and how much is deployed.
 *
 * Reported on screen rather than enforced. The alternative - shrinking the
 * type until everything fits - produces a slide nobody at the back of the room
 * can read, and does it silently. Saying "59 objectives, 2 slides" lets the
 * reader filter until it says one, which is a decision they are better placed
 * to make than this function is.
 */
export function landscapeFit(goals: readonly LandscapeGoal[]): LandscapeFit {
  let rows = 0;
  let measures = 0;
  let deployed = 0;

  for (const goal of goals) {
    // Its measures, plus the heading row above them.
    rows += goal.rows + 1;
    for (const objective of goal.objectives) {
      measures += objective.left.filter((measure) => !measure.unmeasured).length;
      measures += objective.right.filter((measure) => !measure.unmeasured).length;
      deployed += objective.right.filter((measure) => !measure.unmeasured).length;
    }
  }

  return {
    rows,
    measures,
    deployed,
    rowsPerSlide: ROWS_PER_SLIDE,
    slides: rows === 0 ? 0 : Math.ceil(rows / ROWS_PER_SLIDE),
  };
}

/**
 * The four quarters for one measure, through the cascade's own rule.
 *
 * `quarterFigures` decides what a quarter shows when there is room for one
 * number: the actual once the quarter has closed, the standing target while it
 * is still open or still ahead. That rule is the calendar's rather than the
 * data's and it is already tested, so this reuses it rather than restating it -
 * two answers to "what does Q2 show" would be one too many.
 */
export function quartersFor(
  measure: LandscapeMeasure,
  kiStartYear: number,
  today?: Date,
): QuarterFigure[] {
  return quarterFigures(measure.cells, kiStartYear, today);
}
