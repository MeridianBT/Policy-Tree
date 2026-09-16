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
 * An HTML table with row spans rather than a grid of divs, deliberately. The
 * span *is* the relationship being drawn: a Goal cell three rows tall says
 * those three Objectives belong to it, with no connector lines to maintain and
 * no absolute positioning to drift. It also means the browser does the
 * height arithmetic, and `thead` repeats on a second printed page for free.
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
import { groupOrdinalPrefix } from "./outline";
import { formatValue } from "@/lib/calc/format";
import { EM_DASH } from "@/lib/calc/format";
import type { SheetModel } from "@/lib/sheet/types";

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
          <colgroup>
            <col style={{ width: "13%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "4%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "7%" }} />
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
              <Th className="border-b-0" />
              <Th colSpan={5} className="border-b-0 text-ink">
                Company · Level 2
              </Th>
              <Th colSpan={5} className="border-b-0 border-l border-l-rule-strong text-ink">
                Deployed · Level 3
              </Th>
            </tr>
            <tr>
              <Th>Goal</Th>
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
              {goal.objectives.flatMap((objective, objectiveIndex) =>
                Array.from({ length: objective.rows }, (_unused, rowIndex) => {
                  const left = objective.left[rowIndex];
                  const right = objective.right[rowIndex];
                  const firstOfGoal = objectiveIndex === 0 && rowIndex === 0;

                  return (
                    <tr key={`${goal.id}-${objectiveIndex}-${rowIndex}`} className="align-top">
                      {firstOfGoal && (
                        <td
                          rowSpan={goal.rows}
                          className="border-r border-rule-strong bg-paper-band-strong px-2 py-1 text-[12px] font-semibold leading-snug"
                        >
                          {groupOrdinalPrefix(goal.ordinal)}
                          <RichText text={goal.statement} />
                        </td>
                      )}
                      {/*
                        A side with one measure draws it once, spanning the
                        block; a side with several draws one per row. Anything
                        past the shorter side's last measure draws nothing -
                        which is the empty right-hand column, and is the plan
                        rather than a hole in the rendering.
                      */}
                      {(rowIndex === 0 || objective.leftSpan === 1) && (
                        <MeasureCells measure={left} span={rowIndex === 0 ? objective.leftSpan : 1} />
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
}: {
  measure?: LandscapeMeasure;
  span?: number;
  leading?: boolean;
}) {
  const edge = leading ? "border-l border-l-rule-strong" : "";

  if (!measure) {
    return (
      <>
        <Td className={edge} span={span} />
        <Td span={span} />
        <Td span={span} />
        <Td span={span} />
        <Td span={span} />
      </>
    );
  }

  return (
    <>
      <Td span={span} className={`${edge} leading-snug`}>
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
}: {
  children?: React.ReactNode;
  className?: string;
  span?: number;
}) {
  return (
    <td rowSpan={span} className={`border-b border-rule px-2 py-1 ${className}`}>
      {children}
    </td>
  );
}
