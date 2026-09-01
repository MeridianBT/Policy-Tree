"use client";

/**
 * The company sheet. A dense grid of Control Items grouped by the Objectives
 * and Goals above them, with a frozen row-label block on the left and sticky
 * column headers above.
 *
 * Rows are virtualised: a Ki with 200 Control Items plus its group headers is
 * around 260 rows of 17 columns, and rendering all of it makes scrolling
 * stutter. Because virtualised rows are absolutely positioned, a
 * `position: sticky` group header inside the scroller cannot work - so instead
 * a single sticky context bar under the column header names the Goal and
 * Objectives the topmost visible row belongs to. See DESIGN.md.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { rowKey, type SheetModel, type ControlItemRow, type GroupRow, type SheetRowModel } from "@/lib/sheet/types";
import { matchRows, EMPTY_FILTERS, type SheetFilters } from "./filters";

// Re-exported so callers keep importing their filter types from the grid they
// belong to; the implementation lives apart only so it can be tested.
export { EMPTY_FILTERS, type SheetFilters };
import { columnClass, columnWidth, sheetColumns } from "./columns";
import type { QuarterCode } from "@/lib/domain/period";
import type { SheetCell } from "@/lib/calc/row";
import { groupOrdinalPrefix, indentPx } from "./outline";
import { RichText } from "@/components/ui/RichText";
import { plainText } from "@/lib/text/emphasis";
import { DragHandle, InlineRename, RowActions, type DicOption } from "./StructureControls";
import { canAddDepartmentBranch, canEditStructureAt, type EditingUser } from "./permissions";
import { SheetCellView, rowHeightFor, type DisplayMode } from "./SheetCellView";
import { SheetCellInput, SheetCellReadOnly } from "./SheetCellInput";
import { cellKey, displayFor, isDirty, seedInput, type CellEditState } from "./entry-state";
import { isSingleCell, parseClipboardGrid, planPaste, type PasteCell } from "./paste";
import { EvaluationSymbol } from "./EvaluationSymbol";

const GROUP_ROW_HEIGHT = 28;

/*
 * The Measures column is the one column whose content nobody can shorten.
 *
 * A statement is a sentence a director wrote, and the ones that matter most
 * tend to be the longest; at a fixed width the useful half is behind an
 * ellipsis exactly when somebody is trying to read it. Every other column
 * holds a figure of known size, so this is the only one worth making
 * adjustable - and it is adjusted by dragging its edge, which is where anyone
 * who has used a spreadsheet already reaches.
 *
 * The width is a view preference, kept per browser rather than per account:
 * it depends on the screen in front of the reader, not on who they are.
 */
const LABEL_WIDTH_DEFAULT = 300;
const LABEL_WIDTH_MIN = 180;
const LABEL_WIDTH_MAX = 640;
const LABEL_WIDTH_KEY = "sheet:label-width";

function clampLabelWidth(width: number): number {
  return Math.round(Math.min(LABEL_WIDTH_MAX, Math.max(LABEL_WIDTH_MIN, width)));
}

/**
 * A row picked up by its grip: enough to decide, for every other row on the
 * sheet, whether it is a place this one may be dropped.
 *
 * Reordering is offered "within their level", which here means three things at
 * once must match: the same parent, the same level, and the same sort of row.
 * A Level 2 Objective can carry Level 3 Objectives and Level 4 department
 * branches as siblings, and a company row dragged past a branch would otherwise
 * reshuffle work belonging to a department its author may not touch. The server
 * enforces all three again; this is what stops the drop line from ever
 * appearing somewhere the drop would be refused.
 */
interface DraggedRow {
  id: string;
  parentId: string | null;
  level: number;
  isControlItem: boolean;
}

interface DropTarget {
  rowId: string;
  edge: "TOP" | "BOTTOM";
  /** Pixel offset inside the virtualised body, for the insertion line. */
  top: number;
}

/** A row's parent is simply the last id in the ancestor chain it already carries. */
function parentOf(row: SheetRowModel): string | null {
  return row.path.length ? row.path[row.path.length - 1] : null;
}

function isDropTarget(dragged: DraggedRow, row: SheetRowModel): boolean {
  if (row.id === dragged.id) return false;
  return (
    parentOf(row) === dragged.parentId &&
    row.level === dragged.level &&
    (row.kind === "CONTROL_ITEM") === dragged.isControlItem
  );
}

/**
 * The sibling the dragged row should land in front of, or null for last.
 *
 * Read off the full row list rather than the filtered one on purpose: a
 * neighbour hidden by a business unit filter is still a neighbour, and
 * resolving the drop against what happens to be on screen would quietly move
 * the row past rows the reader cannot see.
 */
function dropBeforeId(
  rows: readonly SheetRowModel[],
  dragged: DraggedRow,
  target: DropTarget,
): string | null {
  const siblings = rows.filter(
    (row) => row.id === dragged.id || isDropTarget(dragged, row),
  );
  const without = siblings.filter((row) => row.id !== dragged.id);
  const index = without.findIndex((row) => row.id === target.rowId);
  if (index === -1) return null;
  const insertAt = target.edge === "TOP" ? index : index + 1;
  return insertAt < without.length ? without[insertAt].id : null;
}

export interface ReorderRequest {
  kind: "NODE" | "MEASURE";
  id: string;
  beforeId: string | null;
}

/**
 * Keying figures into the grid.
 *
 * Present only when the reader has pinned one specific, unlocked forecast
 * version as the Target, because that is the only state in which "the target"
 * names a single stored cell. Unpinned, the target column is a resolution
 * across several versions and belongs to none of them, so there is nothing a
 * keystroke could land in - see `targetEditable` on SheetCell.
 *
 * Actuals are not keyed here. They belong to /my-entries, which is scoped to
 * the month being closed and is where a division lead already goes; mixing the
 * two would put "what we promised" and "what happened" one keystroke apart.
 */
export interface EntryHandlers {
  /** The pinned version being keyed. */
  versionId: string;
  versionCode: string;
  /** Client mirror of canEditControlItem; the server re-checks every save. */
  canEdit: (row: ControlItemRow) => boolean;
  /** Cells this session has touched, by `cellKey`. */
  edited: Map<string, CellEditState>;
  onCommit: (row: ControlItemRow, period: string, raw: string) => void;
  /**
   * A block pasted from a spreadsheet, already laid over the grid. The grid
   * works out which cells the block covers, because only it knows what is on
   * screen; the screen writes them, because only it talks to the server.
   */
  onPaste: (cells: PasteCell[], dropped: number) => void;
}

export interface EditingHandlers {
  user: EditingUser;
  dics: DicOption[];
  renamingId: string | null;
  onStartRename: (id: string) => void;
  onCancelRename: () => void;
  onRenameNode: (id: string, statement: string) => void;
  /**
   * Opens the measure form. A measure has eight settings and only one of them
   * is its name, so the pencil opens the lot rather than an inline rename that
   * could reach just the one - the other seven were unreachable for the life
   * of the Ki before this.
   */
  onEditControlItem: (row: ControlItemRow) => void;
  onAddDepartment: (parentObjectiveId: string) => void;
  onAddMeasure: (nodeId: string) => void;
  /** Another Control Item under a Measure that already exists. */
  /**
   * Another Control Item on an Objective, opened either from a blank Objective
   * row - where it is that Objective's first, and there is no sibling to copy
   * from - or from the row carrying the statement, where there is.
   */
  onAddControlItem: (target: {
    objectiveId: string;
    statement: string;
    level: number;
    sibling: ControlItemRow | null;
  }) => void;
  onDeleteNode: (id: string) => void;
  onDeleteControlItem: (id: string) => void;
  onReorder: (request: ReorderRequest) => void;
}

/** What a row view needs to offer its grip; absent when editing is off. */
export interface RowDragHandlers {
  onStart: (row: SheetRowModel, event: React.DragEvent) => void;
  onEnd: () => void;
}

export function SheetGrid({
  model,
  displayMode,
  filters,
  compareVersionId,
  compareModel,
  condensedQuarters,
  onlyQuarter,
  onToggleQuarter,
  editing,
  entry,
}: {
  model: SheetModel;
  displayMode: DisplayMode;
  filters: SheetFilters;
  compareVersionId?: string | null;
  compareModel?: SheetModel | null;
  /** Quarters whose month columns are folded away. */
  condensedQuarters: QuarterCode[];
  /** One quarter to show on its own, or null for the whole year. */
  onlyQuarter: QuarterCode | null;
  onToggleQuarter: (quarter: QuarterCode) => void;
  /** Structure-editing hooks, absent when not in edit mode. */
  editing?: EditingHandlers;
  /** Figure-entry hooks, absent unless an unlocked version is pinned. */
  entry?: EntryHandlers;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [topRowIndex, setTopRowIndex] = useState(0);
  const [dragged, setDragged] = useState<DraggedRow | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const columns = useMemo(
    () => sheetColumns(model.kiStartYear, { condensedQuarters, onlyQuarter }),
    [model.kiStartYear, condensedQuarters, onlyQuarter],
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

  /*
   * Which levels the loaded sheet covers - "1,2,3" on the company view,
   * "1,2,3,4" once Departments are folded in.
   *
   * Switching that scope forgets what was collapsed, because the whole point
   * of asking for the department branches is to see them: a Level 2 Objective
   * somebody had collapsed earlier would otherwise swallow every Level 4 row
   * the toggle just loaded, and the button would look like it had done
   * nothing. Derived from what actually arrived rather than passed down, so it
   * cannot disagree with the rows on screen.
   */
  const levelScope = useMemo(
    () => [...new Set(model.rows.map((row) => row.level))].sort().join(","),
    [model.rows],
  );
  useEffect(() => {
    setCollapsed(new Set());
  }, [levelScope]);

  /** Filtering removes Control Items, then any group left with nothing under it. */
  const filtered = useMemo(() => matchRows(model.rows, filters), [model.rows, filters]);

  const visible = useMemo(
    () => filtered.filter((row) => !row.path.some((ancestor) => collapsed.has(ancestor))),
    [filtered, collapsed],
  );

  const controlItemHeight =
    rowHeightFor(displayMode, Boolean(entry)) * (compareById ? 2 : 1);

  // React Compiler cannot memoize a component using this hook: TanStack
  // Virtual returns functions whose identity changes, and memoizing them would
  // serve stale offsets. Skipping memoization here is the correct trade — the
  // grid is virtualized precisely so React only ever sees the visible rows.
  // eslint-disable-next-line react-hooks/incompatible-library
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

  /*
   * Enter drops to the same month on the next measure, matching /my-entries.
   * The grid is virtualised, so that row may not be mounted: scroll it into
   * view first, then focus once React has actually put it there. A few frames
   * of retry is all it takes, and giving up quietly is better than focusing
   * the wrong cell.
   */
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const focusNextMeasure = useCallback(
    (fromRowId: string, columnKey: string) => {
      const from = visible.findIndex((row) => row.id === fromRowId);
      if (from === -1) return;
      const nextIndex = visible.findIndex(
        (row, index) => index > from && row.kind === "CONTROL_ITEM",
      );
      if (nextIndex === -1) return;
      const target = `${visible[nextIndex].id}|${columnKey}`;
      virtualizer.scrollToIndex(nextIndex, { align: "auto" });

      let attempts = 0;
      const tryFocus = () => {
        const element = inputs.current.get(target);
        if (element) {
          element.focus();
          element.select();
          return;
        }
        if (attempts++ < 10) requestAnimationFrame(tryFocus);
      };
      requestAnimationFrame(tryFocus);
    },
    [visible, virtualizer],
  );

  /**
   * Lay a pasted block over the grid from the focused cell.
   *
   * Both axes come from what is actually rendered: the visible Control Item
   * rows in their current order, and the month columns still on screen. So a
   * paste made while a filter is on, or while quarters are condensed, fills
   * the cells the reader can see rather than ones they cannot.
   */
  const pasteFrom = useCallback(
    (anchorRowId: string, anchorPeriod: string, text: string): boolean => {
      if (!entry || isSingleCell(text)) return false;
      const block = parseClipboardGrid(text);
      if (block.length === 0) return false;

      const rowIds = visible.filter((row) => row.kind === "CONTROL_ITEM").map((row) => row.id);
      const periods = columns
        .filter((column) => column.kind === "MONTH")
        .map((column) => column.key);

      const plan = planPaste(block, { rowId: anchorRowId, period: anchorPeriod }, rowIds, periods);
      if (plan.cells.length === 0 && plan.dropped === 0) return false;
      entry.onPaste(plan.cells, plan.dropped);
      return true;
    },
    [entry, visible, columns],
  );

  const registerInput = useCallback((key: string, element: HTMLInputElement | null) => {
    if (element) inputs.current.set(key, element);
    else inputs.current.delete(key);
  }, []);

  const beginDrag = useCallback((row: SheetRowModel, event: React.DragEvent) => {
    // Firefox refuses to start a drag at all unless the payload is set, even
    // though the row being dragged is tracked in state rather than read back
    // out of the transfer.
    event.dataTransfer.setData("text/plain", row.id);
    event.dataTransfer.effectAllowed = "move";
    setDragged({
      id: row.id,
      parentId: parentOf(row),
      level: row.level,
      isControlItem: row.kind === "CONTROL_ITEM",
    });
    setDropTarget(null);
  }, []);

  const endDrag = useCallback(() => {
    setDragged(null);
    setDropTarget(null);
  }, []);

  const rowDrag = useMemo<RowDragHandlers | undefined>(
    () => (editing ? { onStart: beginDrag, onEnd: endDrag } : undefined),
    [editing, beginDrag, endDrag],
  );

  const [labelWidth, setLabelWidth] = useState(LABEL_WIDTH_DEFAULT);

  /*
   * Read the stored width after mount, never while rendering: the server has
   * no localStorage, so seeding state from it would render one width on the
   * server and another on the client - a hydration mismatch. A browser that
   * refuses site data (private mode, blocked storage) throws on access rather
   * than returning null, so both directions are guarded and the default
   * simply stands.
   */
  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(LABEL_WIDTH_KEY));
      if (Number.isFinite(stored) && stored > 0) setLabelWidth(clampLabelWidth(stored));
    } catch {
      // No stored preference to be had; the default is a fine answer.
    }
  }, []);

  const resizeLabel = useCallback((width: number) => {
    const next = clampLabelWidth(width);
    setLabelWidth(next);
    try {
      window.localStorage.setItem(LABEL_WIDTH_KEY, String(next));
    } catch {
      // The column still resizes for this session; it just will not be
      // remembered, which is not worth interrupting anybody over.
    }
  }, []);

  const resetLabel = useCallback(() => resizeLabel(LABEL_WIDTH_DEFAULT), [resizeLabel]);

  const context = useMemo(() => contextFor(visible, topRowIndex), [visible, topRowIndex]);
  const itemCount = visible.filter((row) => row.kind === "CONTROL_ITEM").length;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col border border-rule-strong bg-paper"
      // Overrides the :root default for this grid and everything inside it -
      // the header, the frozen cells, the group rows and the total width all
      // read the same variable.
      style={{ "--label-width": `${labelWidth}px` } as React.CSSProperties}
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" tabIndex={0}>
        <div
          style={{
            width: `calc(var(--label-width) + var(--measure-width) + ${gridWidth}px)`,
          }}
        >
          <ColumnHeader
            columns={columns}
            onToggleQuarter={onToggleQuarter}
            labelWidth={labelWidth}
            onResizeLabel={resizeLabel}
            onResetLabel={resetLabel}
          />
          <ContextBar context={context} />

          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {dropTarget && (
              <div
                aria-hidden
                className="pointer-events-none absolute left-0 z-50 h-0.5 w-full bg-ink"
                style={{ top: dropTarget.top }}
              />
            )}
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = visible[virtualRow.index];
              const droppable = dragged !== null && isDropTarget(dragged, row);
              return (
                <div
                  key={rowKey(row)}
                  className="absolute left-0 flex w-full"
                  style={{ top: 0, height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                  onDragOver={
                    dragged
                      ? (event) => {
                          if (!droppable) {
                            setDropTarget(null);
                            return;
                          }
                          // preventDefault is what marks this a valid drop
                          // zone; without it the browser refuses the drop.
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          const bounds = event.currentTarget.getBoundingClientRect();
                          const edge =
                            event.clientY - bounds.top < bounds.height / 2 ? "TOP" : "BOTTOM";
                          const top =
                            edge === "TOP" ? virtualRow.start : virtualRow.start + virtualRow.size;
                          setDropTarget((previous) =>
                            previous && previous.rowId === row.id && previous.edge === edge
                              ? previous
                              : { rowId: row.id, edge, top },
                          );
                        }
                      : undefined
                  }
                  onDrop={
                    dragged
                      ? (event) => {
                          event.preventDefault();
                          const target = dropTarget;
                          const moved = dragged;
                          endDrag();
                          if (!target || !editing) return;
                          const beforeId = dropBeforeId(model.rows, moved, target);
                          if (beforeId === moved.id) return;
                          editing.onReorder({
                            kind: moved.isControlItem ? "MEASURE" : "NODE",
                            id: moved.id,
                            beforeId,
                          });
                        }
                      : undefined
                  }
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
                      editing={editing}
                      drag={rowDrag}
                      entry={entry}
                      registerInput={registerInput}
                      onEnterKey={focusNextMeasure}
                      onPasteFrom={pasteFrom}
                    />
                  ) : (
                    <GroupRowView
                      row={row as GroupRow}
                      collapsed={collapsed.has(row.id)}
                      onToggle={() => toggle(row.id)}
                      width={gridWidth}
                      editing={editing}
                      drag={rowDrag}
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

/** The Goal › Objective chain the topmost visible row sits under. */
function contextFor(rows: SheetRowModel[], topIndex: number): string[] {
  const row = rows[topIndex];
  if (!row) return [];
  // Group rows only: a path names a Node, and a Control Item row sharing that
  // id is a figure kept against it, never the heading the breadcrumb wants.
  const byId = new Map<string, GroupRow>();
  for (const candidate of rows) {
    if (candidate.kind !== "CONTROL_ITEM") byId.set(candidate.id, candidate as GroupRow);
  }
  const chain = row.kind === "CONTROL_ITEM" ? row.path : [...row.path, row.id];
  return chain
    .map((id) => byId.get(id))
    .filter((node): node is GroupRow => Boolean(node))
    // The breadcrumb is one compressed line of context, so emphasis inside it
    // would be noise rather than signal - the markers come off and the words
    // stay.
    .map((node) => plainText(node.statement));
}

/**
 * The grip on the Measures column's right edge.
 *
 * Only that column is resizable: every other one holds a figure whose width is
 * known, and a sheet where any column can move is a sheet whose columns no
 * longer line up between two people reading the same plan.
 *
 * Pointer events rather than mouse events, so it works under a finger on the
 * iPad the sheet gets read on, and the pointer is captured so a fast drag that
 * leaves the 6px strip keeps resizing instead of stopping dead. Arrow keys do
 * the same job for anyone not using a pointer, and a double-click puts it back.
 */
function LabelWidthHandle({
  width,
  onResize,
  onReset,
}: {
  width: number;
  onResize: (width: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Measures column width"
      aria-valuenow={width}
      aria-valuemin={LABEL_WIDTH_MIN}
      aria-valuemax={LABEL_WIDTH_MAX}
      tabIndex={0}
      title="Drag to resize the Measures column · double-click to reset"
      className="absolute right-0 top-0 z-50 h-full w-1.5 cursor-col-resize touch-none hover:bg-ink-faint focus:bg-ink-faint focus:outline-none"
      onPointerDown={(event) => {
        drag.current = { startX: event.clientX, startWidth: width };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        onResize(drag.current.startWidth + (event.clientX - drag.current.startX));
      }}
      onPointerUp={(event) => {
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 32 : 8;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onResize(width - step);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onResize(width + step);
        }
      }}
    />
  );
}

function ColumnHeader({
  columns,
  onToggleQuarter,
  labelWidth,
  onResizeLabel,
  onResetLabel,
}: {
  columns: ReturnType<typeof sheetColumns>;
  onToggleQuarter: (quarter: QuarterCode) => void;
  labelWidth: number;
  onResizeLabel: (width: number) => void;
  onResetLabel: () => void;
}) {
  return (
    <div className="sticky top-0 z-30 flex border-b border-rule-strong bg-paper-band-strong">
      <div
        className="sticky left-0 z-40 flex shrink-0 items-end bg-paper-band-strong px-2 py-1 text-[11px] font-medium text-ink-muted"
        style={{ width: "var(--label-width)" }}
      >
        Measures
        <LabelWidthHandle width={labelWidth} onResize={onResizeLabel} onReset={onResetLabel} />
      </div>
      <div
        className="sticky z-40 flex shrink-0 items-end border-r border-rule-strong bg-paper-band-strong px-2 py-1 text-[11px] font-medium text-ink-muted"
        style={{ left: "var(--label-width)", width: "var(--measure-width)" }}
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
        style={{ width: "calc(var(--label-width) + var(--measure-width))" }}
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
  editing,
  drag,
}: {
  row: GroupRow;
  collapsed: boolean;
  onToggle: () => void;
  width: number;
  editing?: EditingHandlers;
  drag?: RowDragHandlers;
}) {
  // Every group row below Level 1 is an Objective now, so the weight steps by
  // level rather than by kind: Goal boldest, a Level 2 Objective carrying some
  // weight, Level 3 and 4 quietest.
  const tone =
    row.kind === "GOAL"
      ? "bg-paper-band-strong text-ink font-semibold text-[13px]"
      : row.level === 2
        ? "bg-paper-band text-ink font-medium text-[12px]"
        : "bg-paper-sunken text-ink-muted text-[12px]";

  return (
    <div className={`flex w-full items-center border-b border-rule ${tone}`} style={{ height: GROUP_ROW_HEIGHT }}>
      <div
        className={`sticky left-0 z-10 flex h-full shrink-0 items-center gap-1 border-r border-rule-strong pr-2 ${tone}`}
        style={{
          width: "calc(var(--label-width) + var(--measure-width))",
          paddingLeft: indentPx(row),
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${plainText(row.statement)}`}
          className="flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-rule"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
        {editing?.renamingId === row.id ? (
          <InlineRename
            initial={row.statement}
            onCommit={(value) => editing.onRenameNode(row.id, value)}
            onCancel={editing.onCancelRename}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate" title={plainText(row.statement)}>
            {groupOrdinalPrefix(row.ordinal)}
            <RichText text={row.statement} />
          </span>
        )}
        {editing && editing.renamingId !== row.id && (() => {
          const owns = canEditStructureAt(editing.user, editing.dics, row.level, row.orgUnitId);
          const companyWide =
            editing.user.role === "SUPER_ADMIN" || editing.user.role === "EXECUTIVE";
          // A Goal continues into a Level 2 Objective and a Level 2 Objective
          // into a Level 3; everything deeper is a department branch, added
          // separately below because it carries an org unit. Continuation of
          // the company-wide tree belongs to a SUPER_ADMIN or an EXECUTIVE.
          const childContinues = row.kind === "GOAL" || row.level === 2;
          // Moving a row is the same authority as renaming it: it changes how
          // the plan reads, not what it records.
          const canReorder = row.level < 4 ? companyWide : owns;
          return (
            <>
            {drag && canReorder && (
              <DragHandle
                label={`Reorder "${plainText(row.statement)}" among its siblings`}
                onDragStart={(event) => drag.onStart(row as SheetRowModel, event)}
                onDragEnd={drag.onEnd}
              />
            )}
            <RowActions
              canAddDepartment={canAddDepartmentBranch(editing.user, row)}
              // M+ adds a child Objective already carrying one Control Item,
              // which is what "add a measure here" has always meant.
              canAddMeasure={childContinues && companyWide}
              // CI+ measures THIS Objective. A group row is by definition one
              // with nothing under it yet, so this is how a blank row stops
              // being blank.
              canAddControlItem={row.kind === "OBJECTIVE" && (row.level < 4 ? companyWide : owns)}
              canRename={row.level < 4 ? companyWide : owns}
              canDelete={row.level < 4 ? companyWide : owns}
              onAddDepartment={() => editing.onAddDepartment(row.id)}
              onAddMeasure={() => editing.onAddMeasure(row.id)}
              onAddControlItem={() =>
                editing.onAddControlItem({
                  objectiveId: row.id,
                  statement: row.statement,
                  level: row.level,
                  sibling: null,
                })
              }
              onRename={() => editing.onStartRename(row.id)}
              onDelete={() => editing.onDeleteNode(row.id)}
            />
            </>
          );
        })()}
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
  editing,
  drag,
  entry,
  registerInput,
  onEnterKey,
  onPasteFrom,
}: {
  row: ControlItemRow;
  compare: ControlItemRow | null;
  compareVersionCode: string | null;
  columns: ReturnType<typeof sheetColumns>;
  displayMode: DisplayMode;
  editing?: EditingHandlers;
  drag?: RowDragHandlers;
  entry?: EntryHandlers;
  registerInput: (key: string, element: HTMLInputElement | null) => void;
  onEnterKey: (fromRowId: string, columnKey: string) => void;
  onPasteFrom: (rowId: string, period: string, text: string) => boolean;
}) {
  const cellByKey = useMemo(() => new Map(row.cells.map((cell) => [cell.key, cell])), [row.cells]);
  const compareByKey = useMemo(
    () => (compare ? new Map(compare.cells.map((cell) => [cell.key, cell])) : null),
    [compare],
  );

  return (
    <div className="group flex w-full border-b border-rule hover:bg-paper-sunken">
      <div
        className="sticky left-0 z-10 flex h-full shrink-0 items-center gap-2 bg-paper px-2 group-hover:bg-paper-sunken"
        style={{ width: "var(--label-width)", paddingLeft: indentPx(row) }}
      >
        {/* Stands in for the group rows' disclosure caret, so a Control Item
            lands on the same vertical as a group at the same step. */}
        <span className="size-4 shrink-0" aria-hidden />
        {/*
          A Measure is named once. Its first Control Item carries the name; the
          rest of its rows leave the column empty, because repeating "Service
          experience" down three rows says nothing the reader did not already
          know and costs the width their own Control Items need.
        */}
        {row.firstOfObjective ? (
          <Link
            href={`/control-item/${row.id}`}
            // A link is a drag source by default, so dragging a measure by its
            // name would start dragging its URL instead of reordering the row.
            draggable={false}
            className="min-w-0 flex-1 truncate text-[12px] hover:underline"
            title={
              row.objectiveItemCount > 1
                ? `${plainText(row.name)} — ${row.objectiveItemCount} Control Items`
                : `${plainText(row.name)} (${row.code})`
            }
          >
            <RichText text={row.name} />
          </Link>
        ) : (
          // A Control Item whose statement is printed above it - the second of
          // several, or any of them under an Objective that carries a header.
          // Still a link: the detail screen is where its own figures, formula
          // and history live, and reaching it should not depend on which row
          // of the Objective happened to get the name.
          <Link
            href={`/control-item/${row.id}`}
            draggable={false}
            className="min-w-0 flex-1 truncate text-[12px] text-ink-faint hover:underline"
            title={`${plainText(row.name)} — ${row.measuredAs} (${row.code})`}
          >
            └
          </Link>
        )}
        {editing &&
        (row.level < 4
          ? editing.user.role === "SUPER_ADMIN" || editing.user.role === "EXECUTIVE"
          : canEditStructureAt(editing.user, editing.dics, row.level, row.dicOrgUnitId)) ? (
          <>
            {drag && (
              <DragHandle
                label={`Reorder "${plainText(row.name)}" among the measures beside it`}
                onDragStart={(event) => drag.onStart(row as SheetRowModel, event)}
                onDragEnd={drag.onEnd}
              />
            )}
            <RowActions
              /*
               * This row IS its Objective when it carries the statement: an
               * Objective with Control Items prints no group row of its own,
               * so everything that used to sit on that header lives here.
               * Without it a Level 2 Objective that already had one figure
               * against it could never be deployed any further, which is the
               * whole of the cascade.
               */
              // The enclosing guard has already established that a row below
              // Level 4 is only editable here by a SUPER_ADMIN or an EXECUTIVE,
              // which is exactly the authority the company tree needs.
              canAddMeasure={row.firstOfObjective && row.level === 2}
              canAddDepartment={
                row.firstOfObjective &&
                canAddDepartmentBranch(editing.user, { kind: "OBJECTIVE", level: row.level })
              }
              // Offered on the row that carries the statement, because that is
              // the row that reads as the Objective.
              canAddControlItem={row.firstOfObjective}
              canRename
              renameLabel={row.objectiveItemCount > 1 ? "Edit Control Item" : "Edit measure"}
              canDelete
              onAddMeasure={() => editing.onAddMeasure(row.objectiveId)}
              onAddDepartment={() => editing.onAddDepartment(row.objectiveId)}
              onAddControlItem={() =>
                editing.onAddControlItem({
                  objectiveId: row.objectiveId,
                  statement: row.name,
                  level: row.level,
                  sibling: row,
                })
              }
              onRename={() => editing.onEditControlItem(row)}
              onDelete={() => editing.onDeleteControlItem(row.id)}
            />
          </>
        ) : (
          <span
            className="shrink-0 rounded-sm border border-rule px-1 text-[10px] text-ink-muted"
            title={`In charge: ${row.dicName}`}
          >
            {row.dicCode}
          </span>
        )}
      </div>
      <div
        className="sticky z-10 flex h-full shrink-0 items-center border-r border-rule-strong bg-paper px-2 text-[11px] text-ink-muted group-hover:bg-paper-sunken"
        style={{ left: "var(--label-width)", width: "var(--measure-width)" }}
        title={`${row.measuredAs} · rolled up by ${row.aggregation.toLowerCase()}`}
      >
        {row.objectiveItemCount > 1 ? (
          // One of several under one name, so this column is what tells them
          // apart - and on rows that no longer carry the name, it is also the
          // way to reach the measure's own page.
          <Link
            href={`/control-item/${row.id}`}
            draggable={false}
            className="truncate hover:underline"
          >
            {row.measuredAs}
          </Link>
        ) : (
          <span className="truncate">{row.measuredAs}</span>
        )}
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
            {cell && entry && column.kind === "MONTH" && cell.period ? (
              <MonthEntryCell
                row={row}
                cell={cell}
                period={cell.period}
                columnKey={column.key}
                displayMode={displayMode}
                entry={entry}
                registerInput={registerInput}
                onEnterKey={onEnterKey}
                onPasteFrom={onPasteFrom}
              />
            ) : (
              cell && (
                <SheetCellView
                  cell={cell}
                  mode={displayMode}
                  decimalPlaces={row.decimalPlaces}
                />
              )
            )}
            {compareCell && (
              <div className="mt-0.5 border-t border-dashed border-rule pt-0.5" title={compareVersionCode ?? undefined}>
                <SheetCellView
                  cell={compareCell}
                  mode={displayMode}
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

/**
 * A keyable month: the box where the target goes, with the rest of the display
 * mode underneath it.
 *
 * Three states, and each is a different answer to "why can I not type here?".
 * A cell the reader may key gets a box. A cell on a measure that is not theirs
 * shows the figure greyed with the reason in its tooltip - drawing nothing at
 * all would read as "there is no target" rather than "this one is not yours".
 * A cell whose version is locked says so the same way, which is how a closed
 * forecast stays visibly quotable rather than merely inert.
 */
function MonthEntryCell({
  row,
  cell,
  period,
  columnKey,
  displayMode,
  entry,
  registerInput,
  onEnterKey,
  onPasteFrom,
}: {
  row: ControlItemRow;
  cell: SheetCell;
  period: string;
  columnKey: string;
  displayMode: DisplayMode;
  entry: EntryHandlers;
  registerInput: (key: string, element: HTMLInputElement | null) => void;
  onEnterKey: (fromRowId: string, columnKey: string) => void;
  onPasteFrom: (rowId: string, period: string, text: string) => boolean;
}) {
  const key = cellKey(row.id, period);
  const edited = entry.edited.get(key);
  const mayKey = cell.targetEditable && entry.canEdit(row);

  const commit = (raw: string) => {
    if (!isDirty(cell, row.decimalPlaces, edited, raw)) return;
    entry.onCommit(row, period, raw);
  };

  return (
    <span className="flex w-full flex-col items-end gap-0.5">
      {mayKey ? (
        <SheetCellInput
          value={displayFor(cell, row.decimalPlaces, edited)}
          edited={edited}
          ariaLabel={`${plainText(row.name)} ${entry.versionCode} target for ${cell.label}`}
          onCommit={commit}
          onEnter={(raw) => {
            commit(raw);
            onEnterKey(row.id, columnKey);
          }}
          onPasteBlock={(text) => onPasteFrom(row.id, period, text)}
          registerRef={(element) => registerInput(`${row.id}|${columnKey}`, element)}
        />
      ) : (
        <SheetCellReadOnly
          value={seedInput(cell, row.decimalPlaces)}
          title={
            cell.targetEditable
              ? `${plainText(row.name)} is keyed by ${row.responsibleUserName ?? row.dicName}`
              : `${entry.versionCode} is locked, so its figures are read-only`
          }
        />
      )}
      <SheetCellView cell={cell} mode={displayMode} decimalPlaces={row.decimalPlaces} hideTarget />
    </span>
  );
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
