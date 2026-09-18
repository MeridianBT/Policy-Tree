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
import {
  buildLandscape,
  landscapeFit,
  quartersFor,
  type LandscapeFigures,
  type LandscapeMeasure,
  type LandscapePeriod,
} from "./landscape";
import { matchRows, type SheetFilters } from "./filters";
import { groupOrdinalPrefix, INDENT_STEP_PX, OUTLINE_BASE_PX } from "./outline";
import { formatValue } from "@/lib/calc/format";
import { EM_DASH } from "@/lib/calc/format";
import type { SheetModel } from "@/lib/sheet/types";
import { QUARTERS } from "@/lib/domain/period";
import type { QuarterFigure } from "./quarter-figures";

/*
 * Column geometry, per mode, in one place.
 *
 * Both modes sum to 100 - the first version of this file summed to 114 and the
 * browser normalised every width down by about an eighth, so the numbers
 * written here were never the widths on screen. Named together so the Goal
 * heading's colSpan and the two spanning header cells cannot drift from the
 * colgroup: a heading one column short leaves a stray gap at the end of every
 * Goal band and throws nothing.
 *
 * Four quarters cost width, and it comes out of the statements rather than out
 * of the figures - a measure whose name is cut off is useless, but 21% still
 * holds the measured 40-character maximum on one line.
 */
const GEOMETRY = {
  PERIOD: {
    left: [25, 12, 7, 7, 4],
    right: [19, 10, 6, 6, 4],
  },
  QUARTERS: {
    left: [21, 10, 6, 6, 6, 6],
    right: [15, 8, 5.5, 5.5, 5.5, 5.5],
  },
} as const;

export function SheetLandscape({
  model,
  filters,
  period = "KI",
  figures = "PERIOD",
}: {
  model: SheetModel;
  filters: SheetFilters;
  /** Which period the figures come from; the year total unless a quarter is picked. */
  period?: LandscapePeriod;
  /** One figure block for that period, or all four quarters at one number each. */
  figures?: LandscapeFigures;
}) {
  /*
   * `matchRows` unchanged, so a business unit or a division means here exactly
   * what it means on the sheet. It keeps a heading only when something under
   * it survived, which is what makes a filtered slide a coherent page rather
   * than a list of orphaned Goals.
   */
  const goals = useMemo(
    () => buildLandscape(matchRows(model.rows, filters), period),
    [model.rows, filters, period],
  );
  const fit = useMemo(() => landscapeFit(goals), [goals]);

  const geometry = GEOMETRY[figures];
  const columnsPerSide = geometry.left.length;
  const columnCount = columnsPerSide * 2;

  /*
   * One clock for the whole page, so two measures cannot disagree about which
   * quarter has closed because the render crossed a month boundary. The
   * cascade takes the same care for the same reason.
   */
  const today = useMemo(() => new Date(), []);
  const periodLabel = period === "KI" ? "Ki total" : period;

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
            {[...geometry.left, ...geometry.right].map((width, index) => (
              <col key={index} style={{ width: `${width}%` }} />
            ))}
          </colgroup>

          {/*
            Two header rows, the way the sheet's own column header works: the
            span names which half of the page you are in, the row beneath it
            names the columns. Sticky, because a wall chart is read by
            scrolling down it on screen even though it prints in one piece.
          */}
          <thead className="sticky top-0 z-10 bg-paper-band-strong">
            <tr>
              <Th colSpan={columnsPerSide} className="border-b-0 text-ink">
                Company · Level 2
              </Th>
              <Th
                colSpan={columnsPerSide}
                className="border-b-0 border-l border-l-rule-strong text-ink"
              >
                Deployed · Level 3
              </Th>
            </tr>
            <tr>
              {/*
                The figure headings name the period. On a slide pasted into a
                deck three months later, "Target" alone is the difference
                between a quarter and a year, and nothing else on the page
                would settle it.
              */}
              <Th>Objective</Th>
              <Th>Control Item</Th>
              <FigureHeadings figures={figures} periodLabel={periodLabel} />
              <Th className="border-l border-l-rule-strong">Objective</Th>
              <Th>Control Item</Th>
              <FigureHeadings figures={figures} periodLabel={periodLabel} />
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
                  colSpan={columnCount}
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
                          figures={figures}
                          kiStartYear={model.kiStartYear}
                          today={today}
                        />
                      )}
                      {(rowIndex === 0 || objective.rightSpan === 1) && (
                        <MeasureCells
                          measure={right}
                          span={rowIndex === 0 ? objective.rightSpan : 1}
                          leading
                          figures={figures}
                          kiStartYear={model.kiStartYear}
                          today={today}
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
  figures,
  kiStartYear,
  today,
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
  figures: LandscapeFigures;
  kiStartYear: number;
  today: Date;
}) {
  const edge = leading ? "border-l border-l-rule-strong" : "";
  const figureColumns = figures === "QUARTERS" ? QUARTERS.length : 3;

  if (!measure) {
    return (
      <>
        <Td className={edge} span={span} indent={indent} />
        <Td span={span} />
        {Array.from({ length: figureColumns }, (_unused, index) => (
          <Td key={index} span={span} />
        ))}
      </>
    );
  }

  /*
   * The statement is printed once for its Objective and spans the measures it
   * is held to; a row it does not start leaves the column alone.
   *
   * Which means the strong rule dividing the Company half from the Deployed
   * half cannot live on the statement cell - on a spanned-over row that cell is
   * not emitted and the rule would break. It goes on whichever cell opens the
   * side.
   */
  const named = measure.statementSpan > 0;

  return (
    <>
      {named && (
        <Td
          data-statement
          span={measure.statementSpan}
          indent={indent}
          className={`${edge} leading-snug`}
        >
          <RichText text={measure.statement} />
        </Td>
      )}
      <Td span={span} className={`${named ? "" : edge} text-ink-muted`}>
        <span className="flex items-baseline gap-1.5">
          <span className="min-w-0">
            {measure.unmeasured ? (
              // The gap the cascade also prints: a policy written down before
              // anybody decided what would measure it.
              <span className="text-ink-faint italic">not measured yet</span>
            ) : (
              measure.measuredAs
            )}
          </span>
          {/*
            Who is accountable, badged exactly as the sheet badges it - same
            border, same size, same "In charge:" title - and beside the measure
            rather than the statement, because that is whose it is: one spanned
            statement can cover three Control Items answering to three different
            org units. The sheet makes the same split, printing the name once
            and a badge on every row.
          */}
          {measure.dicCode && (
            <span
              className="shrink-0 rounded-sm border border-rule px-1 text-[10px] text-ink-muted"
              title={`In charge: ${measure.dicName ?? measure.dicCode}`}
            >
              {measure.dicCode}
            </span>
          )}
        </span>
      </Td>
      {figures === "QUARTERS" ? (
        quartersFor(measure, kiStartYear, today).map((quarter) => (
          <QuarterFigureCell key={quarter.quarter} figure={quarter} measure={measure} span={span} />
        ))
      ) : (
        <>
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
      )}
    </>
  );
}

/** The figure column headings, which name the period they hold. */
function FigureHeadings({
  figures,
  periodLabel,
}: {
  figures: LandscapeFigures;
  periodLabel: string;
}) {
  if (figures === "QUARTERS") {
    return (
      <>
        {QUARTERS.map((quarter) => (
          <Th key={quarter} className="text-right">
            {quarter}
          </Th>
        ))}
      </>
    );
  }
  return (
    <>
      <Th className="text-right">{periodLabel === "Ki total" ? "Target" : `${periodLabel} target`}</Th>
      <Th className="text-right">{periodLabel === "Ki total" ? "Actual" : `${periodLabel} actual`}</Th>
      <Th className="text-center">Eval</Th>
    </>
  );
}

/**
 * One quarter, one number, the cascade's rule and the cascade's typography.
 *
 * An actual is set in ink and carries its evaluation symbol; a target is
 * quieter and italic, because "this is what happened" and "this is what we
 * said we would do" have to stay distinguishable at arm's length off a wall -
 * and the whole point of this view is being read from a distance.
 */
function QuarterFigureCell({
  figure: quarter,
  measure,
  span,
}: {
  figure: QuarterFigure;
  measure: LandscapeMeasure;
  span: number;
}) {
  const isActual = quarter.basis === "ACTUAL";
  const text = formatValue(quarter.value, measure.decimalPlaces, measure.unit ?? undefined, {
    withUnit: true,
  });

  return (
    <Td
      span={span}
      className={`num text-right ${isActual ? "text-ink" : "italic text-ink-faint"}`}
    >
      <span className="flex items-baseline justify-end gap-1">
        {isActual && quarter.symbol && (
          <EvaluationSymbol
            symbol={quarter.symbol}
            label={quarter.symbolLabel}
            color={quarter.symbolColor}
            size={10}
          />
        )}
        {quarter.value === null ? <span className="text-ink-faint">{EM_DASH}</span> : text}
      </span>
    </Td>
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
  // Marks the cell that carries an Objective's statement, so `ui-check` can
  // count them against the rows rather than grep the page for text.
  "data-statement": dataStatement,
}: {
  children?: React.ReactNode;
  className?: string;
  span?: number;
  indent?: number;
  "data-statement"?: boolean;
}) {
  return (
    <td
      rowSpan={span}
      data-statement={dataStatement ? "" : undefined}
      style={indent === undefined ? undefined : { paddingLeft: indent }}
      className={`border-b border-rule py-1 pr-2 ${indent === undefined ? "pl-2" : ""} ${className}`}
    >
      {children}
    </td>
  );
}
