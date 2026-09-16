"use client";

/**
 * The company read across the page: Goals and their Level 2 Objectives on the
 * left, whatever each one deploys into at Level 3 on the right.
 *
 * This is the same plan the sheet holds, turned ninety degrees. The sheet runs
 * time across the page, which is what keying and reading a year need. This
 * runs *deployment* across the page, which is the direction a review reads in
 * - "this Goal is held to these Objectives, and this Objective deploys into
 * these" - and it fits a slide, which seventeen month columns never will.
 *
 * An HTML table rather than a grid of divs, deliberately. A Goal is a heading
 * row over its Objectives - a column was tried first and spent about an eighth
 * of the page on one phrase per five rows, which horizontal space here cannot
 * afford - and the row spans that remain draw the relationship: a Level 2 cell
 * four rows tall says those four deployments belong to it, with no connector
 * lines to maintain and no absolute positioning to drift. It also means the
 * browser does the height arithmetic, and `thead` repeats on a second printed
 * page for free.
 *
 * Stops at Level 3. A department branch belongs to the division that owns it,
 * not to a company slide, and `buildLandscape` drops Level 4 outright so a
 * reader who left "+ Departments" on still gets the company.
 */

import { useMemo } from "react";
import { RichText } from "@/components/ui/RichText";
import { EvaluationSymbol } from "./EvaluationSymbol";
import { BandLegend } from "./BandLegend";
import { buildLandscape, landscapeFit, type LandscapeMeasure } from "./landscape";
import { matchRows, type SheetFilters } from "./filters";
import { groupOrdinalPrefix, INDENT_STEP_PX, OUTLINE_BASE_PX } from "./outline";
import { formatValue } from "@/lib/calc/format";
import { EM_DASH } from "@/lib/calc/format";
import type { SheetModel } from "@/lib/sheet/types";

/**
 * Five columns a side. Named so the Goal heading's colSpan and the two
 * spanning header cells cannot drift from the colgroup - a heading one column
 * short leaves a stray gap at the end of every Goal band.
 */
const COLUMNS_PER_SIDE = 5;
const COLUMN_COUNT = COLUMNS_PER_SIDE * 2;

export function SheetLandscape({
  model,
  filters,
}: {
  model: SheetModel;
  filters: SheetFilters;
}) {
  /*
   * `matchRows` unchanged, so a business unit or a division means here exactly
   * what it means on the sheet. It keeps a heading only when something under
   * it survived, which is what makes a filtered slide a coherent page rather
   * than a list of orphaned Goals.
   */
  const goals = useMemo(() => buildLandscape(matchRows(model.rows, filters)), [model.rows, filters]);
  const fit = useMemo(() => landscapeFit(goals), [goals]);

  if (goals.length === 0) {
    return (
      <p className="border border-rule bg-paper px-3 py-2 text-[12px] text-ink-muted">
        No Goal has anything under it in this view. Clear a filter, or check the year has a plan.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col border border-rule-strong bg-paper">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[11px]">
          {/*
            Ten columns, summing to 100 - which the eleven did not. They came
            to 114, so the browser normalised every one of them down by about
            a eighth and the numbers written here were never the widths on
            screen. Losing the Goal column gives its share to the two
            statement columns, which are the ones that run out of room.
          */}
          <colgroup>
            <col style={{ width: "25%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "4%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "4%" }} />
          </colgroup>

          {/*
            Two header rows, the way the sheet's own column header works: the
            span names which half of the page you are in, the row beneath it
            names the columns. Sticky, because a wall chart is read by
            scrolling down it on screen even though it prints in one piece.
          */}
          <thead className="sticky top-0 z-10 bg-paper-band-strong">
            <tr>
              <Th colSpan={COLUMNS_PER_SIDE} className="border-b-0 text-ink">
                Company · Level 2
              </Th>
              <Th colSpan={COLUMNS_PER_SIDE} className="border-b-0 border-l border-l-rule-strong text-ink">
                Deployed · Level 3
              </Th>
            </tr>
            <tr>
              <Th>Objective</Th>
              <Th>Control Item</Th>
              <Th className="text-right">Target</Th>
              <Th className="text-right">Actual</Th>
              <Th className="text-center">Eval</Th>
              <Th className="border-l border-l-rule-strong">Objective</Th>
              <Th>Control Item</Th>
              <Th className="text-right">Target</Th>
              <Th className="text-right">Actual</Th>
              <Th className="text-center">Eval</Th>
            </tr>
          </thead>

          {/*
            One tbody per Goal, which is what lets a Goal's block stay together
            across a page break without the span having to know about pages.
          */}
          {goals.map((goal) => (
            <tbody key={goal.id} className="border-t border-t-rule-strong">
              {/*
                The Goal, as a heading over its rows rather than a column
                beside them.
                
                A column spent about an eighth of the page on one short phrase
                per five rows, and horizontal room is the whole constraint here
                - the page exists to fit a slide. As a heading it costs one row
                per Goal and hands that width to the statements, which is the
                trade worth making, and it is what the sheet itself does: a
                Goal sits inline in the row stream as a header, indented one
                step per level.

                `scope="rowgroup"` because that is what it is - a heading
                labelling the rows beneath it - and the tbody stays one per
                Goal, which is what holds the block together across a page
                break.
              */}
              <tr>
                <th
                  scope="rowgroup"
                  colSpan={COLUMN_COUNT}
                  style={{ paddingLeft: OUTLINE_BASE_PX }}
                  className="border-b border-rule-strong bg-paper-band-strong py-1 pr-2 text-left text-[13px] font-semibold"
                >
                  {groupOrdinalPrefix(goal.ordinal)}
                  <RichText text={goal.statement} />
                </th>
              </tr>
              {goal.objectives.flatMap((objective, objectiveIndex) =>
                Array.from({ length: objective.rows }, (_unused, rowIndex) => {
                  const left = objective.left[rowIndex];
                  const right = objective.right[rowIndex];

                  return (
                    <tr key={`${goal.id}-${objectiveIndex}-${rowIndex}`} className="align-top">
                      {/*
                        A side with one measure draws it once, spanning the
                        block; a side with several draws one per row. Anything
                        past the shorter side's last measure draws nothing -
                        which is the empty right-hand column, and is the plan
                        rather than a hole in the rendering.
                      */}
                      {(rowIndex === 0 || objective.leftSpan === 1) && (
                        <MeasureCells
                          measure={left}
                          span={rowIndex === 0 ? objective.leftSpan : 1}
                          indent={OUTLINE_BASE_PX + INDENT_STEP_PX}
                        />
                      )}
                      {(rowIndex === 0 || objective.rightSpan === 1) && (
                        <MeasureCells
                          measure={right}
                          span={rowIndex === 0 ? objective.rightSpan : 1}
                          leading
                        />
                      )}
                    </tr>
                  );
                }),
              )}
            </tbody>
          ))}
        </table>
      </div>

      {/*
        The two numbers this page exists to make visible.

        The slide count, because the reader is the one who decides whether to
        filter - shrinking the type until everything fits would produce a slide
        nobody at the back of the room can read, and do it silently. And the
        deployed count, because the right-hand column is empty far more often
        than not, and "7 of 61 deployed to Level 3" is the finding rather than
        an apology for the white space.
      */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule bg-paper-sunken px-3 py-1 text-[11px] text-ink-muted">
        <span className="num">
          {fit.measures} {fit.measures === 1 ? "measure" : "measures"} · {fit.rows}{" "}
          {fit.rows === 1 ? "row" : "rows"} ·{" "}
          <span className={fit.slides > 1 ? "text-ink" : undefined}>
            {fit.slides} {fit.slides === 1 ? "slide" : "slides"} at 16:9
          </span>
          {fit.deployed === 0
            ? " · nothing deployed to Level 3"
            : ` · ${fit.deployed} deployed to Level 3`}
        </span>
        <BandLegend model={model} />
      </div>
    </div>
  );
}

/**
 * One measure's five cells, or five empty ones.
 *
 * Empty is the common case on the right: measured on the current plan, nine of
 * fifty-nine Level 2 Objectives deploy to Level 3 at all. The cells are left
 * genuinely blank rather than labelled - a muted "nothing deployed" repeated
 * fifty times would be louder than the plan it is describing, and the footer
 * already carries the count.
 */
function MeasureCells({
  measure,
  span = 1,
  leading,
  indent,
}: {
  measure?: LandscapeMeasure;
  span?: number;
  leading?: boolean;
  /**
   * Left padding on the statement cell, so a Level 2 reads as sitting under
   * the Goal heading above it rather than flush against the page edge. The
   * step comes from outline.ts, which is the sheet's own indent scale - a
   * second one would drift.
   */
  indent?: number;
}) {
  const edge = leading ? "border-l border-l-rule-strong" : "";

  if (!measure) {
    return (
      <>
        <Td className={edge} span={span} indent={indent} />
        <Td span={span} />
        <Td span={span} />
        <Td span={span} />
        <Td span={span} />
      </>
    );
  }

  return (
    <>
      <Td span={span} indent={indent} className={`${edge} leading-snug`}>
        <RichText text={measure.statement} />
      </Td>
      <Td span={span} className="text-ink-muted">
        {measure.unmeasured ? (
          // The gap the cascade also prints: a policy written down before
          // anybody decided what would measure it.
          <span className="text-ink-faint italic">not measured yet</span>
        ) : (
          measure.measuredAs
        )}
      </Td>
      <Td span={span} className="num text-right">{figure(measure, measure.target)}</Td>
      <Td span={span} className="num text-right">{figure(measure, measure.actual)}</Td>
      <Td span={span} className="text-center">
        {measure.symbol ? (
          <EvaluationSymbol
            symbol={measure.symbol}
            label={measure.symbolLabel}
            color={measure.symbolColor}
            size={13}
          />
        ) : (
          <span className="text-ink-faint">{EM_DASH}</span>
        )}
      </Td>
    </>
  );
}

/**
 * A figure at the measure's own precision.
 *
 * `decimalPlaces` is respected exactly, the way it is everywhere else: a
 * percentage shown to the width of a count would break the decimal alignment
 * these two columns exist to give.
 */
function figure(measure: LandscapeMeasure, value: number | null) {
  if (value === null) return <span className="text-ink-faint">{EM_DASH}</span>;
  return formatValue(value, measure.decimalPlaces, measure.unit ?? undefined, { withUnit: true });
}

function Th({
  children,
  colSpan,
  className = "",
}: {
  children?: React.ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <th
      colSpan={colSpan}
      scope="col"
      className={`border-b border-rule-strong px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wide text-ink-muted ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  span = 1,
  indent,
}: {
  children?: React.ReactNode;
  className?: string;
  span?: number;
  indent?: number;
}) {
  return (
    <td
      rowSpan={span}
      style={indent === undefined ? undefined : { paddingLeft: indent }}
      className={`border-b border-rule py-1 pr-2 ${indent === undefined ? "pl-2" : ""} ${className}`}
    >
      {children}
    </td>
  );
}
