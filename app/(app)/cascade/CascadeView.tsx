"use client";

/**
 * The alignment map: every Company Goal down to the Department work laddering
 * into it, on one page, with a continuous line the eye can follow.
 *
 * This is deliberately not the sheet. There is no editing surface and no
 * target version picker - it is meant to be read, the way a wall chart is
 * read. A gap in the cascade (an Objective with nothing yet laddering in
 * under it) is shown exactly as plainly as a filled one; that gap is the
 * thing this page exists to surface.
 *
 * What it does share with the sheet is the scope controls, because a wall
 * chart of eighty rows is only readable one division at a time. They are the
 * sheet's own: the same Company / + Departments toggle, the same business unit
 * and division pickers, and - importantly - the same `matchRows`, so a
 * selection means here exactly what it means there rather than nearly.
 *
 * One consequence worth knowing. `matchRows` keeps a heading only when
 * something under it survived, so filtering to a division hides the Objectives
 * that division has not deployed into. Unfiltered, this page still shows every
 * gap; narrowed, it answers the narrower question - what this division is
 * doing - and not "where has this division not shown up".
 *
 * Each measure carries its four quarters on the right. One figure per quarter,
 * chosen by the calendar rather than by the reader: the actual once the quarter
 * has closed, the standing target while it is still open. See
 * components/sheet/quarter-figures.ts for that rule. Indentation is applied as
 * left margin only, so however deep a branch runs every row still ends on the
 * same right edge and the quarter columns line up down the page.
 */
import { useCallback, useMemo, useState, useTransition } from "react";
import { EvaluationSymbol } from "@/components/sheet/EvaluationSymbol";
import { Segmented, Select, MultiSelect } from "@/components/ui/primitives";
import { dicOptionLabel } from "@/components/sheet/dic-label";
import { matchRows, EMPTY_FILTERS, type SheetFilters } from "@/components/sheet/filters";
import { fetchSheet } from "@/lib/sheet/actions";
import { buildCascadeTree, groupOrdinalPrefix, hasDepartmentWork, indentPx, type CascadeNode } from "@/components/sheet/outline";
import { RichText } from "@/components/ui/RichText";
import { quarterFigures, type QuarterFigure } from "@/components/sheet/quarter-figures";
import { rowKey, type ControlItemRow, type SheetModel, type SheetRowModel } from "@/lib/sheet/types";
import { formatAchievement, formatValue } from "@/lib/calc/format";
import { QUARTERS } from "@/lib/domain/period";

/** Fixed widths, shared by the header strip and every measure line. */
const QUARTER_COL_PX = 76;
const KI_COL_PX = 56;

const COMPANY_LEVELS = [1, 2, 3];
const EXPANDED_LEVELS = [1, 2, 3, 4];

export function CascadeView({ model: initialModel }: { model: SheetModel }) {
  const [model, setModel] = useState(initialModel);
  const [filters, setFilters] = useState<SheetFilters>(EMPTY_FILTERS);
  const [divisionCode, setDivisionCode] = useState("");
  // The page opens on the whole cascade, departments and all, because that is
  // what it is for. "Company" narrows to the Levels 1-3 spine.
  const [expanded, setExpanded] = useState(true);
  const [pending, startTransition] = useTransition();

  /*
   * The org chart, not the rows: `loadSheet` returns every Division and
   * Department whatever levels were asked for, so these options do not shift
   * under the reader when the View toggle reloads the page.
   */
  const divisionOptions = useMemo(
    () => initialModel.dics.filter((dic) => dic.type === "DIVISION"),
    [initialModel.dics],
  );

  const toggleExpanded = useCallback(
    (next: boolean) => {
      if (next === expanded) return;
      setExpanded(next);
      startTransition(async () => {
        setModel(
          await fetchSheet({ levels: next ? EXPANDED_LEVELS : COMPANY_LEVELS, kiId: model.kiId }),
        );
      });
    },
    [expanded, model.kiId],
  );

  /*
   * A division here filters, rather than merely narrowing a department list
   * the way it does on the sheet - this page has no department picker beside
   * it to narrow. Choosing AUTO means AUTO's work, so the division expands to
   * itself plus every department beneath it and goes through `matchRows`
   * unchanged. One filtering rule, not two that can drift.
   */
  const chooseDivision = useCallback(
    (code: string) => {
      setDivisionCode(code);
      const dics = code
        ? initialModel.dics
            .filter((dic) => dic.code === code || dic.parentCode === code)
            .map((dic) => dic.code)
        : [];
      setFilters((previous) => ({ ...previous, dics }));
    },
    [initialModel.dics],
  );

  const rows = useMemo(() => matchRows(model.rows, filters), [model.rows, filters]);
  const roots = buildCascadeTree(rows);
  const dicsById = new Map(model.dics.map((dic) => [dic.id, dic]));
  // One clock for the whole page, so two measures cannot disagree about which
  // quarter has closed because the render crossed a month boundary.
  const today = new Date();

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-paper">
      <div className="mx-auto max-w-6xl px-8 py-6">
        <header className="mb-2">
          <h1 className="text-[15px] font-semibold">Cascade</h1>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Every Company Goal, down through the Departments laddering their work into it.
          </p>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            Quarters show the <span className="text-ink">actual</span> once the quarter has closed
            and the <span className="italic">target</span> while it is still open.
          </p>
        </header>

        <div className="mb-3 flex flex-wrap items-center gap-2 border border-rule bg-paper px-2 py-1.5">
          <Segmented
            label="View"
            value={expanded ? "L4" : "L3"}
            onChange={(value) => toggleExpanded(value === "L4")}
            options={[
              { value: "L3", label: "Company", hint: "Levels 1 to 3, the company spine on its own" },
              {
                value: "L4",
                label: "+ Departments",
                hint: "Every Level 4 branch, under the Objective it ladders into",
              },
            ]}
          />

          <span className="mx-1 h-4 w-px bg-rule" aria-hidden />

          {initialModel.businessUnits.length > 1 && (
            <MultiSelect
              label="Business unit"
              selected={filters.businessUnits}
              options={initialModel.businessUnits.map((unit) => ({
                value: unit.code,
                label: `${unit.code} — ${unit.name}`,
              }))}
              onChange={(businessUnits) =>
                setFilters((previous) => ({ ...previous, businessUnits }))
              }
            />
          )}
          {divisionOptions.length > 1 && (
            <Select
              label="Division"
              value={divisionCode}
              options={[
                { value: "", label: "All divisions" },
                ...divisionOptions.map((dic) => ({
                  value: dic.code,
                  label: dicOptionLabel(dic, null),
                })),
              ]}
              onChange={chooseDivision}
            />
          )}

          {(filters.businessUnits.length > 0 || divisionCode) && (
            <button
              type="button"
              onClick={() => {
                setDivisionCode("");
                setFilters(EMPTY_FILTERS);
              }}
              className="rounded-sm border border-rule px-2 py-1 text-[11px] text-ink-muted hover:bg-paper-sunken"
            >
              Clear filters
            </button>
          )}
          {pending && <span className="text-[11px] text-ink-faint">Loading…</span>}
        </div>

        <div className="flex items-baseline border-b border-rule-strong pb-1 text-[10px] uppercase tracking-wide text-ink-faint">
          <span className="min-w-0 flex-1">Measure</span>
          {QUARTERS.map((quarter) => (
            <span key={quarter} className="shrink-0 text-right" style={{ width: QUARTER_COL_PX }}>
              {quarter}
            </span>
          ))}
          <span className="shrink-0 text-right" style={{ width: KI_COL_PX }}>
            Ki
          </span>
        </div>

        {roots.length === 0 && (
          <p className="py-6 text-[12px] text-ink-faint">
            Nothing matches these filters. Nobody is deploying work here yet — or the pickers
            above have narrowed the page past what the plan holds.
          </p>
        )}

        <div className="divide-y divide-rule">
          {roots.map((root) => (
            <div key={rowKey(root.row)} className="py-4">
              <Branch
                node={root}
                parentRow={null}
                dicsById={dicsById}
                kiStartYear={model.kiStartYear}
                today={today}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Branch({
  node,
  parentRow,
  dicsById,
  kiStartYear,
  today,
}: {
  node: CascadeNode;
  parentRow: SheetRowModel | null;
  dicsById: Map<string, SheetModel["dics"][number]>;
  kiStartYear: number;
  today: Date;
}) {
  const delta = parentRow ? indentPx(node.row) - indentPx(parentRow) : 0;
  const nested = delta > 0;
  const showGap = node.row.kind === "OBJECTIVE" && !hasDepartmentWork(node);

  return (
    <div
      style={nested ? { marginLeft: delta } : undefined}
      className={nested ? "border-l border-rule pl-3" : undefined}
    >
      <Row row={node.row} dicsById={dicsById} kiStartYear={kiStartYear} today={today} />
      {showGap && <GapLine />}
      {node.children.map((child) => (
        <Branch
          key={rowKey(child.row)}
          node={child}
          parentRow={node.row}
          dicsById={dicsById}
          kiStartYear={kiStartYear}
          today={today}
        />
      ))}
    </div>
  );
}

function Row({
  row,
  dicsById,
  kiStartYear,
  today,
}: {
  row: SheetRowModel;
  dicsById: Map<string, SheetModel["dics"][number]>;
  kiStartYear: number;
  today: Date;
}) {
  if (row.kind === "CONTROL_ITEM") {
    return (
      <ControlItemLine
        row={row as ControlItemRow}
        dicsById={dicsById}
        kiStartYear={kiStartYear}
        today={today}
      />
    );
  }

  const isGoal = row.kind === "GOAL";
  const isDepartmentBranch = row.level === 4;
  const dic = isDepartmentBranch && row.orgUnitId ? dicsById.get(row.orgUnitId) : undefined;
  // Same weight convention as the sheet grid, and by level rather than kind
  // since every row below Level 1 is an Objective: the Goal is boldest, a
  // Level 2 Objective carries some weight, and the deployment beneath it sits
  // quietest - the one visual cue telling apart rows that share an indent step.
  const tone =
    row.kind === "GOAL"
      ? "text-[14px] font-semibold"
      : row.level === 2
        ? "text-[13px] font-medium"
        : "text-[13px] text-ink-muted";

  return (
    <div className={`flex items-baseline gap-2 py-1 ${tone}`}>
      <span>
        {isGoal && groupOrdinalPrefix(row.ordinal)}
        <RichText text={row.statement} />
      </span>
      {dic && (
        <span
          className="shrink-0 rounded-sm border border-rule px-1 text-[10px] font-normal text-ink-muted"
          title={`In charge: ${dic.name}`}
        >
          {dic.code}
        </span>
      )}
    </div>
  );
}

function ControlItemLine({
  row,
  dicsById,
  kiStartYear,
  today,
}: {
  row: ControlItemRow;
  dicsById: Map<string, SheetModel["dics"][number]>;
  kiStartYear: number;
  today: Date;
}) {
  const kiCell = row.cells.find((cell) => cell.kind === "KI") ?? null;
  const dic = dicsById.get(row.dicOrgUnitId);
  const figures = quarterFigures(row.cells, kiStartYear, today);

  return (
    <div className="flex items-baseline gap-2 py-0.5 text-[12px] text-ink-muted">
      <EvaluationSymbol symbol={kiCell?.symbol ?? null} label={kiCell?.symbolLabel} color={kiCell?.symbolColor} size={12} />
      {/* The statement is on the row that carries it - the Objective's header
          when it has one, or this row when it does not. A row underneath a
          header names what it measures instead, rather than repeating the
          statement immediately below itself. */}
      {row.firstOfObjective ? (
        <>
          <span className="min-w-0 flex-1 truncate text-ink">
            <RichText text={row.name} />
          </span>
          <span className="min-w-0 shrink truncate text-[11px] text-ink-faint">
            ({row.measuredAs})
          </span>
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate text-ink">{row.measuredAs}</span>
      )}
      {dic && (
        <span
          className="shrink-0 rounded-sm border border-rule px-1 text-[10px] text-ink-muted"
          title={`In charge: ${dic.name}`}
        >
          {dic.code}
        </span>
      )}
      {/*
        The business unit sits beside the DIC as a second, equally quiet badge.
        It is a tag on the measure rather than a level in the tree, so it never
        becomes a grouping here: a Level 4 branch renders where it structurally
        attaches, and nesting by business unit would contradict the sheet.
      */}
      <span
        className="shrink-0 rounded-sm border border-rule px-1 text-[10px] text-ink-faint"
        title={`Business unit: ${row.businessUnitName}`}
      >
        {row.businessUnitCode}
      </span>

      <span className="ml-auto flex shrink-0 items-baseline">
        {figures.map((figure) => (
          <QuarterCell key={figure.quarter} figure={figure} row={row} />
        ))}
        <span
          className="num shrink-0 text-right text-[11px] text-ink-faint"
          style={{ width: KI_COL_PX }}
          title="Achievement against the Ki target"
        >
          {formatAchievement(kiCell?.achievement)}
        </span>
      </span>
    </div>
  );
}

/**
 * One quarter, one figure. An actual is set in ink and carries its evaluation
 * symbol; a target is quieter and italic, because the difference between "this
 * is what happened" and "this is what we said we would do" has to survive
 * being read at arm's length off a wall.
 */
function QuarterCell({ figure, row }: { figure: QuarterFigure; row: ControlItemRow }) {
  const text = formatValue(figure.value, row.decimalPlaces, row.unit, { withUnit: true });
  const isActual = figure.basis === "ACTUAL";

  return (
    <span
      className={`num flex shrink-0 items-baseline justify-end gap-1 text-[11px] ${
        isActual ? "text-ink" : "italic text-ink-faint"
      }`}
      style={{ width: QUARTER_COL_PX }}
      title={quarterTitle(figure, text)}
    >
      {isActual && (
        <EvaluationSymbol
          symbol={figure.symbol}
          label={figure.symbolLabel}
          color={figure.symbolColor}
          size={10}
        />
      )}
      <span className="truncate">{text}</span>
    </span>
  );
}

function quarterTitle(figure: QuarterFigure, text: string): string {
  if (figure.basis === "ACTUAL") {
    return `${figure.quarter} actual ${text} · ${formatAchievement(figure.achievement)} of target`;
  }
  if (figure.progress === "COMPLETE") {
    return `${figure.quarter} target ${text} · the quarter has closed but no actual has been entered`;
  }
  return `${figure.quarter} target ${text} · the quarter has not closed yet`;
}

/** The quiet, always-visible marker for an Objective nothing has deployed against yet. */
function GapLine() {
  return (
    <div className="border-l border-dashed border-rule py-1 pl-3 text-[12px] italic text-ink-faint">
      — nothing yet ladders in here —
    </div>
  );
}
