"use client";

/**
 * The company sheet. A dense grid of Control Items grouped by Objective, Theme
 * and Goal, with a frozen row-label block on the left and sticky column
 * headers above.
 *
 * Rows are virtualised: a Ki with 200 Control Items plus its group headers is
 * around 260 rows of 17 columns, and rendering all of it makes scrolling
 * stutter. Because virtualised rows are absolutely positioned, a
 * `position: sticky` group header inside the scroller cannot work - so instead
 * a single sticky context bar under the column header names the Goal › Theme ›
 * Objective that the topmost visible row belongs to. See DESIGN.md.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { SheetModel, ControlItemRow, GroupRow, SheetRowModel } from "@/lib/sheet/types";
import { columnClass, columnWidth, sheetColumns } from "./columns";
import type { QuarterCode } from "@/lib/domain/period";
import { SheetCellView, rowHeightFor, type DisplayMode } from "./SheetCellView";
import { EvaluationSymbol } from "./EvaluationSymbol";

const GROUP_ROW_HEIGHT = 28;

export interface SheetFilters {
  dics: string[];
  themeIds: string[];
  symbols: string[];
}

export const EMPTY_FILTERS: SheetFilters = { dics: [], themeIds: [], symbols: [] };

export function SheetGrid({
  model,
  displayMode,
  filters,
  compareVersionId,
  compareModel,
  condensedQuarters,
  onToggleQuarter,
}: {
  model: SheetModel;
  displayMode: DisplayMode;
  filters: SheetFilters;
  compareVersionId?: string | null;
  compareModel?: SheetModel | null;
  /** Quarters whose month columns are folded away. */
  condensedQuarters: QuarterCode[];
  onToggleQuarter: (quarter: QuarterCode) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [topRowIndex, setTopRowIndex] = useState(0);

  const columns = useMemo(
    () => sheetColumns(model.kiStartYear, { condensedQuarters }),
    [model.kiStartYear, condensedQuarters],
  );
  const gridWidth = useMemo(
    () => columns.reduce((total, column) => total + columnWidth(column.kind), 0),
    [columns],
  );

  const compareById = useMemo(() => {
    if (!compareModel) return null;
    const map = new Map<string, ControlItemRow>();
    for (const row of compareModel.rows) {
      if (row.kind === "CONTROL_ITEM") map.set(row.id, row as ControlItemRow);
    }
    return map;
  }, [compareModel]);

  /** Filtering removes Control Items, then any group left with nothing under it. */
  const filtered = useMemo(() => matchRows(model.rows, filters), [model.rows, filters]);

  const visible = useMemo(
    () => filtered.filter((row) => !row.path.some((ancestor) => collapsed.has(ancestor))),
    [filtered, collapsed],
  );

  const controlItemHeight = rowHeightFor(displayMode) * (compareById ? 2 : 1);

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      visible[index].kind === "CONTROL_ITEM" ? controlItemHeight : GROUP_ROW_HEIGHT,
    overscan: 12,
    onChange: (instance) => {
      const first = instance.getVirtualItems()[0];
      if (first) setTopRowIndex(first.index);
    },
  });

  const toggle = useCallback((id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const context = useMemo(() => contextFor(visible, topRowIndex), [visible, topRowIndex]);
  const itemCount = visible.filter((row) => row.kind === "CONTROL_ITEM").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col border border-rule-strong bg-paper">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" tabIndex={0}>
        <div style={{ width: `calc(var(--label-width) + ${gridWidth}px)` }}>
          <ColumnHeader columns={columns} onToggleQuarter={onToggleQuarter} />
          <ContextBar context={context} />

          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = visible[virtualRow.index];
              return (
                <div
                  key={row.id}
                  className="absolute left-0 flex w-full"
                  style={{ top: 0, height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                >
                  {row.kind === "CONTROL_ITEM" ? (
                    <ControlItemRowView
                      row={row as ControlItemRow}
                      compare={compareById?.get(row.id) ?? null}
                      compareVersionCode={
                        compareVersionId
                          ? model.versions.find((v) => v.id === compareVersionId)?.code ?? null
                          : null
                      }
                      columns={columns}
                      displayMode={displayMode}
                    />
                  ) : (
                    <GroupRowView
                      row={row as GroupRow}
                      collapsed={collapsed.has(row.id)}
                      onToggle={() => toggle(row.id)}
                      width={gridWidth}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-rule bg-paper-sunken px-3 py-1 text-[11px] text-ink-muted">
        <span>
          {itemCount} control {itemCount === 1 ? "item" : "items"}
          {itemCount !== countControlItems(model.rows) && ` of ${countControlItems(model.rows)}`}
        </span>
        <BandLegend model={model} />
      </div>
    </div>
  );
}

function countControlItems(rows: SheetRowModel[]): number {
  return rows.filter((row) => row.kind === "CONTROL_ITEM").length;
}

function matchRows(rows: SheetRowModel[], filters: SheetFilters): SheetRowModel[] {
  const noFilter =
    filters.dics.length === 0 && filters.themeIds.length === 0 && filters.symbols.length === 0;
  if (noFilter) return rows;

  const kept = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "CONTROL_ITEM") continue;
    const item = row as ControlItemRow;
    if (filters.dics.length && !filters.dics.includes(item.dicCode)) continue;
    if (filters.themeIds.length && !item.path.some((id) => filters.themeIds.includes(id))) continue;
    if (filters.symbols.length && !(item.kiSymbol && filters.symbols.includes(item.kiSymbol))) continue;
    kept.add(item.id);
    for (const ancestor of item.path) kept.add(ancestor);
  }
  return rows.filter((row) => kept.has(row.id));
}

/** The Goal › Theme › Objective the topmost visible row sits under. */
function contextFor(rows: SheetRowModel[], topIndex: number): string[] {
  const row = rows[topIndex];
  if (!row) return [];
  const byId = new Map(rows.map((candidate) => [candidate.id, candidate]));
  const chain = row.kind === "CONTROL_ITEM" ? row.path : [...row.path, row.id];
  return chain
    .map((id) => byId.get(id))
    .filter((node): node is SheetRowModel => Boolean(node))
    .map((node) => (node as GroupRow).statement);
}

function ColumnHeader({
  columns,
  onToggleQuarter,
}: {
  columns: ReturnType<typeof sheetColumns>;
  onToggleQuarter: (quarter: QuarterCode) => void;
}) {
  return (
    <div className="sticky top-0 z-30 flex border-b border-rule-strong bg-paper-band-strong">
      <div
        className="sticky left-0 z-40 flex shrink-0 items-end border-r border-rule-strong bg-paper-band-strong px-2 py-1 text-[11px] font-medium text-ink-muted"
        style={{ width: "var(--label-width)" }}
      >
        Control Item
      </div>
      {columns.map((column) =>
        column.kind === "QUARTER" ? (
          <button
            key={column.key}
            type="button"
            onClick={() => onToggleQuarter(column.quarter!)}
            aria-expanded={!column.condensed}
            title={
              column.condensed
                ? `Show the months of ${column.label}`
                : `Condense ${column.label} to the quarter figure`
            }
            className={`flex shrink-0 items-end justify-end gap-1 px-1.5 py-1 text-[11px] font-medium text-ink hover:brightness-95 ${columnClass(
              column.kind,
              column.condensed,
            )}`}
            style={{ width: columnWidth(column.kind) }}
          >
            <span aria-hidden className="text-[9px] text-ink-muted">
              {column.condensed ? "»" : "«"}
            </span>
            {column.label}
          </button>
        ) : (
          <div
            key={column.key}
            className={`flex shrink-0 items-end justify-end px-1.5 py-1 text-[11px] font-medium ${
              column.kind === "MONTH" ? "text-ink-muted" : "text-ink"
            } ${columnClass(column.kind, column.condensed)}`}
            style={{ width: columnWidth(column.kind) }}
          >
            {column.label}
          </div>
        ),
      )}
    </div>
  );
}

function ContextBar({ context }: { context: string[] }) {
  return (
    <div className="sticky top-[26px] z-20 flex border-b border-rule bg-paper-sunken">
      <div
        className="sticky left-0 z-20 shrink-0 truncate border-r border-rule-strong bg-paper-sunken px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint"
        style={{ width: "var(--label-width)" }}
      >
        Position
      </div>
      <div className="truncate px-2 py-0.5 text-[11px] text-ink-muted">
        {context.length ? context.join("  ›  ") : "—"}
      </div>
    </div>
  );
}

function GroupRowView({
  row,
  collapsed,
  onToggle,
  width,
}: {
  row: GroupRow;
  collapsed: boolean;
  onToggle: () => void;
  width: number;
}) {
  const tone =
    row.kind === "GOAL"
      ? "bg-paper-band-strong text-ink font-semibold text-[13px]"
      : row.kind === "THEME"
        ? "bg-paper-band text-ink font-medium text-[12px]"
        : "bg-paper-sunken text-ink-muted text-[12px]";

  return (
    <div className={`flex w-full items-center border-b border-rule ${tone}`} style={{ height: GROUP_ROW_HEIGHT }}>
      <div
        className={`sticky left-0 z-10 flex h-full shrink-0 items-center gap-1 border-r border-rule-strong pr-2 ${tone}`}
        style={{ width: "var(--label-width)", paddingLeft: 4 + (row.path.length * 12) }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${row.statement}`}
          className="flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-rule"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
        <span className="truncate" title={row.statement}>
          {row.kind === "GOAL" ? `L${row.level} · ${row.statement}` : row.statement}
        </span>
      </div>
      {row.laddersTo ? (
        <div
          className="flex h-full items-center truncate px-2 text-[11px] font-normal text-ink-faint"
          style={{ width }}
          title={`Ladders into: ${row.laddersTo}`}
        >
          ↳ {row.laddersTo}
        </div>
      ) : (
        <div className="h-full" style={{ width }} aria-hidden />
      )}
    </div>
  );
}

function ControlItemRowView({
  row,
  compare,
  compareVersionCode,
  columns,
  displayMode,
}: {
  row: ControlItemRow;
  compare: ControlItemRow | null;
  compareVersionCode: string | null;
  columns: ReturnType<typeof sheetColumns>;
  displayMode: DisplayMode;
}) {
  const cellByKey = useMemo(() => new Map(row.cells.map((cell) => [cell.key, cell])), [row.cells]);
  const compareByKey = useMemo(
    () => (compare ? new Map(compare.cells.map((cell) => [cell.key, cell])) : null),
    [compare],
  );

  return (
    <div className="group flex w-full border-b border-rule hover:bg-paper-sunken">
      <div
        className="sticky left-0 z-10 flex h-full shrink-0 items-center gap-2 border-r border-rule-strong bg-paper px-2 group-hover:bg-paper-sunken"
        style={{ width: "var(--label-width)", paddingLeft: 8 + row.path.length * 12 }}
      >
        <Link
          href={`/control-item/${row.id}`}
          className="min-w-0 flex-1 truncate text-[12px] hover:underline"
          title={`${row.name} (${row.code})`}
        >
          {row.name}
        </Link>
        <span className="shrink-0 text-[10px] text-ink-faint" title={`Aggregation: ${row.aggregation}`}>
          {unitTag(row.unit)}
        </span>
        <span
          className="shrink-0 rounded-sm border border-rule px-1 text-[10px] text-ink-muted"
          title={`Division in charge: ${row.dicName}`}
        >
          {row.dicCode}
        </span>
      </div>

      {columns.map((column) => {
        const cell = cellByKey.get(column.key);
        const compareCell = compareByKey?.get(column.key);
        return (
          <div
            key={column.key}
            className={`flex shrink-0 flex-col justify-center px-1.5 ${columnClass(
              column.kind,
              column.condensed,
            )} group-hover:bg-paper-sunken`}
            style={{ width: columnWidth(column.kind) }}
          >
            {cell && (
              <SheetCellView
                cell={cell}
                mode={displayMode}
                unit={row.unit}
                decimalPlaces={row.decimalPlaces}
              />
            )}
            {compareCell && (
              <div className="mt-0.5 border-t border-dashed border-rule pt-0.5" title={compareVersionCode ?? undefined}>
                <SheetCellView
                  cell={compareCell}
                  mode={displayMode}
                  unit={row.unit}
                  decimalPlaces={row.decimalPlaces}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function unitTag(unit: ControlItemRow["unit"]): string {
  switch (unit) {
    case "PERCENT": return "%";
    case "CURRENCY": return "$";
    case "COUNT": return "no.";
    case "RATIO": return "×";
    case "DAYS": return "d";
    case "INDEX": return "idx";
  }
}

function BandLegend({ model }: { model: SheetModel }) {
  return (
    <div className="flex items-center gap-3">
      {model.bands.map((band) => (
        <span key={band.symbol} className="flex items-center gap-1">
          <EvaluationSymbol symbol={band.symbol} label={band.label} color={band.colorHex} size={13} />
          <span className="text-[10px] text-ink-faint">{bandRange(band)}</span>
        </span>
      ))}
    </div>
  );
}

function bandRange(band: SheetModel["bands"][number]): string {
  if (band.minPct === null) return `< ${pct(band.maxPct!)}`;
  if (band.maxPct === null) return `≥ ${pct(band.minPct)}`;
  return `${pct(band.minPct)}–${pct(band.maxPct)}`;
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
