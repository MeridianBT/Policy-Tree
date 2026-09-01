"use client";

/**
 * The screen around the grid: version selector, compare mode, display density
 * and the filters. Everything here is view state; nothing recalculates.
 *
 * The filters read outside-in - Business unit, then Division, then Department
 * - because that is the order a reviewer narrows in: which product line, whose
 * division, whose desk.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, Pencil, Printer } from "lucide-react";
import type { SheetModel } from "@/lib/sheet/types";
import { Button, MultiSelect, SearchBox, Segmented, Select } from "@/components/ui/primitives";
import {
  SheetGrid,
  EMPTY_FILTERS,
  type EditingHandlers,
  type EntryHandlers,
  type SheetFilters,
} from "./SheetGrid";
import { cellKey, retireSaved, type CellEditState } from "./entry-state";
import { canEnterFigures, type EditingUser } from "./permissions";
import { saveEntriesAction, saveEntryAction } from "@/lib/entries/actions";
import { MAX_PASTE_CELLS, type PasteCell } from "./paste";
import type { ControlItemRow } from "@/lib/sheet/types";
import {
  DeleteConfirm,
  InlineAdd,
  InlineAddDepartment,
  InlineMeasureForm,
  type MeasureValues,
  type UserOption,
  useStructureAction,
  type DicOption,
} from "./StructureControls";
import {
  addControlItem,
  addControlItemToObjective,
  addDepartmentBranch,
  addNode,
  assignableDics,
  assignableUsers,
  deleteControlItem,
  deleteNode,
  renameNode,
  updateControlItem,
  reorderRow,
  type DeletionImpact,
} from "@/lib/structure/actions";
import { DISPLAY_MODES, type DisplayMode } from "./SheetCellView";
import { ALL_QUARTERS } from "./columns";
import { dicOptionLabel } from "./dic-label";
import { plainText } from "@/lib/text/emphasis";
import type { QuarterCode } from "@/lib/domain/period";

export const LATEST_FORECAST = "LATEST";

/**
 * The print view carries whatever the reader is looking at: condensed columns,
 * and one business unit when exactly one is selected. Several selected is not
 * a state a single printed sheet can honestly title, so it prints everything
 * rather than implying a filter it cannot name.
 */
function printUrl(base: string, condensed: boolean, businessUnits: string[]): string {
  const params = new URLSearchParams();
  if (condensed) params.set("columns", "quarters");
  if (businessUnits.length === 1) params.set("bu", businessUnits[0]);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function SheetScreen({
  model,
  title,
  subtitle,
  printHref,
  exportHref,
  /** Loader used when the target version or compare version changes. */
  onReload,
  loading,
  compareModel,
  compareVersionId,
  targetVersionId,
  onTargetVersionChange,
  onCompareVersionChange,
  currentUser,
  onStructureChanged,
  viewToggle,
}: {
  model: SheetModel;
  title: string;
  subtitle?: string;
  printHref?: string;
  /** Base path for the Excel download; the target version is appended. */
  exportHref?: string;
  onReload?: () => void;
  loading?: boolean;
  compareModel?: SheetModel | null;
  compareVersionId: string;
  targetVersionId: string;
  onTargetVersionChange: (value: string) => void;
  onCompareVersionChange: (value: string) => void;
  /**
   * Signed-in user, for deciding which structure-edit affordances to draw.
   * SUPER_ADMIN sees everything; EXECUTIVE sees Levels 1-3; OWNER sees only
   * what their own org unit covers at Level 4; VIEWER sees none of it. The
   * server re-checks every call regardless of what this shows.
   */
  currentUser?: EditingUser;
  onStructureChanged?: () => void;
  /** An optional Company/+Departments toggle, rendered in the toolbar. */
  viewToggle?: React.ReactNode;
}) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("FULL");
  const [filters, setFilters] = useState<SheetFilters>(EMPTY_FILTERS);
  // Narrows the Department picker to one Division and its Departments, so choosing
  // "Departments in a Division" or "just the Department" is two clicks
  // instead of hand-picking every department code. Only meaningful once
  // Level 4 rows are on the sheet at all - a plain Level 1-3 view has no
  // departments to narrow to.
  const [divisionScope, setDivisionScope] = useState("");
  const hasDepartments = useMemo(() => model.dics.some((dic) => dic.type === "DEPARTMENT"), [model.dics]);
  const divisionOptions = useMemo(
    () => model.dics.filter((dic) => dic.type === "DIVISION"),
    [model.dics],
  );
  const scopedDicOptions = useMemo(
    () =>
      divisionScope
        ? model.dics.filter((dic) => dic.code === divisionScope || dic.parentCode === divisionScope)
        : model.dics,
    [model.dics, divisionScope],
  );
  // Picking a Division and leaving every department chip unselected reads as
  // "this division, in full" - itself plus every department beneath it -
  // rather than as an empty, no-op filter.
  const effectiveFilters = useMemo<SheetFilters>(() => {
    if (filters.dics.length || !divisionScope) return filters;
    return { ...filters, dics: scopedDicOptions.map((dic) => dic.code) };
  }, [filters, divisionScope, scopedDicOptions]);
  // Quarters whose month columns are folded away. Purely a view state: the
  // quarter figure is derived from the months either way.
  const [condensedQuarters, setCondensedQuarters] = useState<QuarterCode[]>([]);
  /**
   * One quarter on its own, or the whole year. Narrowing hides the other three
   * quarters' columns and nothing else: no figure is recomputed, and the Ki
   * total stays beside the quarter, because a quarter read without the year it
   * belongs to is the number people misjudge.
   */
  const [onlyQuarter, setOnlyQuarter] = useState<QuarterCode | null>(null);

  const allCondensed = condensedQuarters.length === ALL_QUARTERS.length;

  const canEditStructure = Boolean(currentUser && currentUser.role !== "VIEWER");
  const [editMode, setEditMode] = useState(false);

  /*
   * Keying figures.
   *
   * The offer only exists while one specific, unlocked forecast is pinned as
   * the Target: that is the single condition under which "the target" names a
   * stored cell rather than a resolution across versions. So the mode is
   * *derived* from the version selector rather than remembered alongside it -
   * changing the Target to Latest forecast, or to a locked version, drops the
   * boxes rather than leaving a mode switched on that no longer means
   * anything.
   */
  const [entryModeWanted, setEntryModeWanted] = useState(false);
  const [edited, setEdited] = useState<Map<string, CellEditState>>(() => new Map());
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pinnedVersion = useMemo(
    () => model.versions.find((version) => version.id === targetVersionId) ?? null,
    [model.versions, targetVersionId],
  );
  const canEnterFiguresHere = Boolean(
    currentUser &&
      currentUser.role !== "VIEWER" &&
      pinnedVersion &&
      !pinnedVersion.isActual &&
      !pinnedVersion.lockedAt,
  );
  const entryMode = entryModeWanted && canEnterFiguresHere;

  /*
   * A saved figure changes its quarter, its Ki total, its achievement and its
   * symbol, and every one of those is derived server-side - the month is the
   * only stored grain. So the sheet has to be re-read. Doing that per
   * keystroke would refetch twelve times across one row, so it is debounced:
   * the typed number stands in its box immediately, and the derived columns
   * catch up once the typing pauses.
   */
  const scheduleReload = useCallback(() => {
    if (!onStructureChanged) return;
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      onStructureChanged();
    }, 900);
  }, [onStructureChanged]);

  useEffect(() => () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
  }, []);

  /*
   * A fresh model already carries everything that landed, so the local
   * stand-ins for saved cells retire the moment one arrives.
   *
   * This is React's "adjust state when a prop changes" pattern - done during
   * render against the last model seen, rather than in an effect, so the boxes
   * never render once showing stale stand-ins and then again without them.
   */
  const [lastModel, setLastModel] = useState(model);
  if (lastModel !== model) {
    setLastModel(model);
    setEdited(retireSaved(edited));
  }

  const commitFigure = useCallback(
    (row: ControlItemRow, period: string, raw: string) => {
      const key = cellKey(row.id, period);
      const input = raw.trim();
      setEdited((previous) =>
        new Map(previous).set(key, { input, status: "SAVING", value: null, error: null }),
      );

      void (async () => {
        const outcome = await saveEntryAction({
          controlItemId: row.id,
          period,
          planVersionId: targetVersionId,
          // An emptied box clears the cell rather than storing a zero.
          input: input === "" ? null : input,
        });
        setEdited((previous) =>
          new Map(previous).set(
            key,
            outcome.ok
              ? {
                  input,
                  // A formula that saved but could not evaluate is stored and
                  // still wrong; #ERR in the cell is not the same as a refusal.
                  status: outcome.error ? "ERROR" : "SAVED",
                  value: outcome.value,
                  error: outcome.error,
                }
              : { input, status: "ERROR", value: null, error: outcome.message },
          ),
        );
        if (outcome.ok) scheduleReload();
      })();
    },
    [targetVersionId, scheduleReload],
  );

  const { pending: saving, result, setResult, run } = useStructureAction();

  /**
   * A pasted block.
   *
   * Every cell is marked in flight straight away so the grid shows the shape
   * of what is landing, then the whole block goes in one request that runs
   * each cell through `saveEntry` in order. Cells the reader may not key are
   * dropped before the request rather than sent to be refused - the server
   * would say no, but making it say no eighty times to prove a point the
   * client already knows is not worth the round trip.
   */
  const pasteFigures = useCallback(
    (cells: PasteCell[], dropped: number) => {
      if (!currentUser) return;
      const byId = new Map(
        model.rows
          .filter((row): row is ControlItemRow => row.kind === "CONTROL_ITEM")
          .map((row) => [row.id, row]),
      );

      const writable: Array<{ cell: PasteCell; row: ControlItemRow }> = [];
      let refusedByScope = 0;
      for (const cell of cells) {
        const row = byId.get(cell.rowId);
        if (!row) continue;
        if (!canEnterFigures(currentUser, model.dics, row)) {
          refusedByScope += 1;
          continue;
        }
        writable.push({ cell, row });
      }

      if (writable.length === 0) {
        setResult({
          ok: false,
          message: refusedByScope
            ? `Nothing pasted — none of those ${refusedByScope} cells belong to you.`
            : "Nothing to paste there.",
        });
        return;
      }
      if (writable.length > MAX_PASTE_CELLS) {
        setResult({
          ok: false,
          message: `That block is ${writable.length} cells. Paste up to ${MAX_PASTE_CELLS} at a time.`,
        });
        return;
      }

      setEdited((previous) => {
        const next = new Map(previous);
        for (const { cell } of writable) {
          next.set(cellKey(cell.rowId, cell.period), {
            input: cell.raw,
            status: "SAVING",
            value: null,
            error: null,
          });
        }
        return next;
      });

      void (async () => {
        const outcomes = await saveEntriesAction(
          writable.map(({ cell }) => ({
            controlItemId: cell.rowId,
            period: cell.period,
            planVersionId: targetVersionId,
            input: cell.raw === "" ? null : cell.raw,
          })),
        );

        let failed = 0;
        setEdited((previous) => {
          const next = new Map(previous);
          for (const outcome of outcomes) {
            const entry = writable[outcome.index];
            if (!entry) continue;
            const key = cellKey(entry.cell.rowId, entry.cell.period);
            if (outcome.ok) {
              if (outcome.error) failed += 1;
              next.set(key, {
                input: entry.cell.raw,
                status: outcome.error ? "ERROR" : "SAVED",
                value: outcome.value,
                error: outcome.error,
              });
            } else {
              failed += 1;
              next.set(key, {
                input: entry.cell.raw,
                status: "ERROR",
                value: null,
                error: outcome.message,
              });
            }
          }
          return next;
        });

        const notes: string[] = [];
        if (failed) notes.push(`${failed} refused`);
        if (refusedByScope) notes.push(`${refusedByScope} outside your scope`);
        if (dropped) notes.push(`${dropped} past the edge of the sheet`);
        setResult({
          // The banner's type is a union, so the arm is chosen rather than
          // computed - a paste with a refusal in it is not an "ok" result.
          ...(failed === 0 ? { ok: true as const } : { ok: false as const }),
          message:
            `Pasted ${writable.length - failed} of ${writable.length + refusedByScope + dropped} cells` +
            (notes.length ? ` — ${notes.join(", ")}.` : "."),
        });
        scheduleReload();
      })();
    },
    [currentUser, model.rows, model.dics, targetVersionId, scheduleReload, setResult],
  );

  const entry: EntryHandlers | undefined =
    entryMode && currentUser && pinnedVersion
      ? {
          versionId: pinnedVersion.id,
          versionCode: pinnedVersion.code,
          canEdit: (row) => canEnterFigures(currentUser, model.dics, row),
          edited,
          onCommit: commitFigure,
          onPaste: pasteFigures,
        }
      : undefined;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [adding, setAdding] = useState<
    | { kind: "NODE"; parentId: string | null; label: string; under: string }
    | { kind: "DEPARTMENT_BRANCH"; parentObjectiveId: string; under: string }
    | { kind: "MEASURE"; parentId: string; under: string }
    | {
        kind: "CONTROL_ITEM";
        objectiveId: string;
        statement: string;
        level: number;
        sibling: ControlItemRow | null;
      }
    | { kind: "EDIT_MEASURE"; row: ControlItemRow; initial: MeasureValues }
    | null
  >(null);
  const [deleting, setDeleting] = useState<
    { kind: "NODE" | "MEASURE"; id: string; message: string; impact: DeletionImpact | null } | null
  >(null);

  // The full division/department list is only appropriate for someone who
  // works company-wide. An OWNER may only file a new Level 4 branch or Control
  // Item under their own org unit, so both the "add department" and "add
  // measure" pickers use a narrower list, fetched once - scoped server-side,
  // not merely hidden - the moment edit mode turns on for them.
  const [scopedDics, setScopedDics] = useState<DicOption[] | null>(null);
  // Who this user may hand a measure to. Scoped server-side like the DIC
  // list, and fetched once when edit mode turns on rather than with the sheet.
  const [users, setUsers] = useState<UserOption[] | null>(null);
  const companyWide =
    currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "EXECUTIVE";
  const formDics = companyWide ? model.dics : scopedDics;

  const enterEditMode = useCallback(async () => {
    setEditMode(true);
    setAdding(null);
    setDeleting(null);
    setRenamingId(null);
    setResult(null);
    if (currentUser && !companyWide && scopedDics === null) {
      setScopedDics(await assignableDics());
    }
    if (currentUser && users === null) setUsers(await assignableUsers());
  }, [currentUser, companyWide, scopedDics, users, setResult]);

  const labelFor = (id: string) => {
    // A Node id, so the heading for it wins over a Control Item sharing the id
    // (see `rowKey`); an Objective rendering inline has only the item row.
    const rows = model.rows.filter((candidate) => candidate.id === id);
    const row = rows.find((candidate) => candidate.kind !== "CONTROL_ITEM") ?? rows[0];
    if (!row) return "";
    return row.kind === "CONTROL_ITEM" ? row.name : row.statement;
  };

  function afterChange() {
    setAdding(null);
    setDeleting(null);
    setRenamingId(null);
    onStructureChanged?.();
  }

  /** Delete runs in two steps: the first reports the impact, the second acts. */
  function requestDelete(kind: "NODE" | "MEASURE", id: string) {
    const action = kind === "NODE" ? deleteNode : deleteControlItem;
    run(
      () => action({ id, confirm: false }),
      () => afterChange(),
    );
    // A refusal carrying an impact is the confirmation prompt, not an error.
    setDeleting({ kind, id, message: "", impact: null });
  }

  const editing: EditingHandlers | undefined =
    canEditStructure && editMode && currentUser
      ? {
          user: currentUser,
          dics: model.dics,
          renamingId,
          onStartRename: setRenamingId,
          onCancelRename: () => setRenamingId(null),
          onRenameNode: (id, statement) => run(() => renameNode({ id, statement }), afterChange),
          onEditControlItem: (row) =>
            setAdding({
              kind: "EDIT_MEASURE",
              row,
              initial: {
                name: row.name,
                // The raw value, so opening and saving a measure nobody filled
                // this in for does not store the sheet's readable fallback.
                measuredAs: row.measuredAsRaw ?? "",
                unit: row.unit,
                direction: row.direction,
                aggregation: row.aggregation,
                decimalPlaces: row.decimalPlaces,
                dicOrgUnitId: row.dicOrgUnitId,
                businessUnitId: row.businessUnitId,
                responsibleUserId: row.responsibleUserId,
              },
            }),
          onAddControlItem: (target) => setAdding({ kind: "CONTROL_ITEM", ...target }),
          onAddDepartment: (parentObjectiveId) =>
            setAdding({
              kind: "DEPARTMENT_BRANCH",
              parentObjectiveId,
              under: labelFor(parentObjectiveId),
            }),
          onAddMeasure: (nodeId) => setAdding({ kind: "MEASURE", parentId: nodeId, under: labelFor(nodeId) }),
          onDeleteNode: (id) => requestDelete("NODE", id),
          onDeleteControlItem: (id) => requestDelete("MEASURE", id),
          onReorder: (request) => run(() => reorderRow(request), afterChange),
        }
      : undefined;
  // Folding quarters one at a time is a third state, and the toggle says so by
  // showing neither option selected rather than claiming one of them.
  const columnsMode: string =
    condensedQuarters.length === 0 ? "MONTHS" : allCondensed ? "QUARTERS" : "MIXED";

  const toggleQuarter = useCallback((quarter: QuarterCode) => {
    setCondensedQuarters((previous) =>
      previous.includes(quarter)
        ? previous.filter((candidate) => candidate !== quarter)
        : [...previous, quarter],
    );
  }, []);

  const forecastVersions = useMemo(
    () => model.versions.filter((version) => !version.isActual),
    [model.versions],
  );

  const versionOptions = useMemo(
    () => [
      { value: LATEST_FORECAST, label: "Latest forecast" },
      ...forecastVersions.map((version) => ({
        value: version.id,
        label: `${version.code}${version.lockedAt ? " · locked" : ""}`,
      })),
    ],
    [forecastVersions],
  );

  const compareOptions = useMemo(
    () => [
      { value: "", label: "Off" },
      ...forecastVersions.map((version) => ({ value: version.id, label: version.code })),
    ],
    [forecastVersions],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[15px] font-semibold">{title}</h1>
          <p className="text-[11px] text-ink-muted">
            {model.kiCode}
            {subtitle ? ` · ${subtitle}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {/* Which version the sheet reads against belongs with the title rather
            than in the filter row: it names what is on screen, and the filters
            below narrow what is on screen. Keeping it here also gives the
            filters back a whole row at a laptop width. */}
        <Select
          label="Target"
          value={targetVersionId}
          options={versionOptions}
          onChange={onTargetVersionChange}
        />
        <Select
          label="Compare with"
          value={compareVersionId}
          options={compareOptions}
          onChange={onCompareVersionChange}
        />
        <span className="mx-1 h-4 w-px bg-rule" aria-hidden />
        {exportHref && (
          <a
            href={
              targetVersionId === LATEST_FORECAST
                ? exportHref
                : `${exportHref}${exportHref.includes("?") ? "&" : "?"}version=${targetVersionId}`
            }
            className="flex items-center gap-1 rounded-sm border border-rule bg-paper px-2 py-1 text-[11px] text-ink hover:bg-paper-sunken"
          >
            <Download size={12} /> Export to Excel
          </a>
        )}
        {printHref && (
          <Link
            href={printUrl(printHref, allCondensed, filters.businessUnits)}
            target="_blank"
            className="flex items-center gap-1 rounded-sm border border-rule bg-paper px-2 py-1 text-[11px] text-ink hover:bg-paper-sunken"
          >
            <Printer size={12} /> Print view
          </Link>
        )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border border-rule bg-paper px-2 py-1.5">
        {viewToggle}
        {viewToggle && <span className="mx-1 h-4 w-px bg-rule" aria-hidden />}

        <Segmented
          label="Display mode"
          value={displayMode}
          onChange={setDisplayMode}
          options={DISPLAY_MODES}
        />

        <Segmented
          label="Columns"
          value={columnsMode}
          onChange={(value) =>
            setCondensedQuarters(value === "QUARTERS" ? [...ALL_QUARTERS] : [])
          }
          options={[
            { value: "MONTHS", label: "Months", hint: "Every month, with its quarter beside it" },
            { value: "QUARTERS", label: "Quarters", hint: "Condense every quarter to its total" },
          ]}
        />

        <Select
          label="Quarter"
          value={onlyQuarter ?? "ALL"}
          onChange={(value) => setOnlyQuarter(value === "ALL" ? null : (value as QuarterCode))}
          options={[
            { value: "ALL", label: "Full year" },
            ...ALL_QUARTERS.map((quarter) => ({ value: quarter, label: quarter })),
          ]}
        />

        <span className="mx-1 h-4 w-px bg-rule" aria-hidden />

        {model.businessUnits.length > 1 && (
          <MultiSelect
            label="Business unit"
            selected={filters.businessUnits}
            options={model.businessUnits.map((unit) => ({
              value: unit.code,
              label: `${unit.code} — ${unit.name}`,
            }))}
            onChange={(businessUnits) => setFilters((previous) => ({ ...previous, businessUnits }))}
          />
        )}
        {hasDepartments && (
          <Select
            label="Division"
            value={divisionScope}
            options={[
              { value: "", label: "All divisions" },
              ...divisionOptions.map((dic) => ({ value: dic.code, label: dicOptionLabel(dic, null) })),
            ]}
            onChange={(value) => {
              setDivisionScope(value);
              // A stale department pick from a different division would sit
              // there silently narrowing the sheet to nothing.
              setFilters((previous) => ({ ...previous, dics: [] }));
            }}
          />
        )}
        <MultiSelect
          label="Department"
          selected={filters.dics}
          options={scopedDicOptions.map((dic) => ({
            value: dic.code,
            // Once a Division is chosen beside it, a department drops the
            // division from its code: the selector next door is already
            // saying it. See components/sheet/dic-label.ts.
            label: dicOptionLabel(dic, divisionScope || null),
          }))}
          onChange={(dics) => setFilters((previous) => ({ ...previous, dics }))}
        />

        {/* Last of the filters, because it is the one reached for when the
            other four have not narrowed things enough - and the one that
            answers "where is that row" rather than "which rows are these". */}
        <SearchBox
          label="Find"
          value={filters.search}
          placeholder="statement, measure, code"
          title="Matches a statement, a measure's name, what it measures, its code or its department. A matched statement brings its whole branch."
          onChange={(search) => setFilters((previous) => ({ ...previous, search }))}
        />

        {/* A preset, not a fourth picker: one click for the question people
            actually arrive with. It filters through matchRows with the rest,
            so "Clear filters" clears it too. */}
        <Button
          variant={filters.belowTarget ? "primary" : "default"}
          onClick={() =>
            setFilters((previous) => ({ ...previous, belowTarget: !previous.belowTarget }))
          }
          title="Only measures behind as of their own last reported month"
        >
          Below target
        </Button>

        {canEnterFiguresHere && (
          <>
            <span className="mx-1 h-4 w-px bg-rule" aria-hidden />
            <Button
              variant={entryMode ? "primary" : "default"}
              onClick={() => setEntryModeWanted((previous) => !previous)}
              title={`Key ${pinnedVersion?.code} targets directly into the month columns`}
            >
              {entryMode ? "Done editing targets" : "Edit targets"}
            </Button>
          </>
        )}

        {canEditStructure && (
          <>
            <span className="mx-1 h-4 w-px bg-rule" aria-hidden />
            <Button
              variant={editMode ? "primary" : "default"}
              onClick={() => {
                if (editMode) {
                  setEditMode(false);
                  setAdding(null);
                  setDeleting(null);
                  setRenamingId(null);
                  setResult(null);
                } else {
                  void enterEditMode();
                }
              }}
              title="Add, rename and remove rows directly on the sheet"
            >
              {/* One word and a pencil. What the toggle actually does lives in
                  the tooltip now, which is where a name this short has to
                  put it. */}
              <span className="flex items-center gap-1">
                <Pencil size={11} />
                {editMode ? "Done" : "Edit"}
              </span>
            </Button>
            {editMode && companyWide && (
              <Button
                onClick={() =>
                  setAdding({ kind: "NODE", parentId: null, label: "goal", under: model.kiCode })
                }
              >
                Add goal
              </Button>
            )}
          </>
        )}

        {(filters.businessUnits.length > 0 ||
          filters.dics.length > 0 ||
          filters.belowTarget ||
          filters.search.trim() !== "" ||
          divisionScope !== "") && (
          <Button
            variant="quiet"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setDivisionScope("");
            }}
          >
            Clear filters
          </Button>
        )}

        {loading && <span className="text-[11px] text-ink-faint">Loading…</span>}
        {onReload && (
          <Button variant="quiet" onClick={onReload}>
            Refresh
          </Button>
        )}
      </div>

      {entryMode && pinnedVersion && (
        <p className="border border-rule bg-paper-sunken px-3 py-1.5 text-[12px] text-ink-muted" role="status">
          Keying <strong className="text-ink">{pinnedVersion.code}</strong> targets. Tab saves and
          moves across; Enter saves and drops to the next measure; Escape reverts. A value
          beginning with <code className="num">=</code> is a formula. Paste a block from a
          spreadsheet to fill many cells at once — it lands from the cell you are in, across the
          months on screen and down the rows. Quarters and the Ki total are derived from the
          months, so they are not keyed. Actuals are entered in{" "}
          <Link href="/my-entries" className="underline hover:text-ink">
            My entries
          </Link>
          .
        </p>
      )}

      {result && !("needsConfirmation" in result) && (
        <p
          className="border px-3 py-1.5 text-[12px]"
          role="status"
          style={{
            borderColor: result.ok ? "#2F8F5B" : "#B3261E",
            color: result.ok ? "#2F8F5B" : "#B3261E",
          }}
        >
          {result.message}
        </p>
      )}

      {deleting && result && "needsConfirmation" in result && (
        <DeleteConfirm
          message={result.message}
          impact={result.impact}
          pending={saving}
          onConfirm={() =>
            run(
              () =>
                (deleting.kind === "NODE" ? deleteNode : deleteControlItem)({
                  id: deleting.id,
                  confirm: true,
                }),
              afterChange,
            )
          }
          onCancel={() => {
            setDeleting(null);
            setResult(null);
          }}
        />
      )}

      {adding?.kind === "NODE" && (
        <div className="border border-rule bg-paper">
          <p className="border-b border-rule px-3 py-1 text-[11px] text-ink-muted">
            Adding a {adding.label} under <strong>{adding.under}</strong>
          </p>
          <InlineAdd
            key={adding.parentId ?? "root"}
            label={adding.label}
            indent={12}
            onCommit={(statement) =>
              run(
                () => addNode({ kiId: model.kiId, parentId: adding.parentId, statement }),
                afterChange,
              )
            }
            onCancel={() => setAdding(null)}
          />
        </div>
      )}

      {adding?.kind === "DEPARTMENT_BRANCH" && (
        <div className="border border-rule bg-paper">
          <p className="border-b border-rule px-3 py-1 text-[11px] text-ink-muted">
            Adding a Level 4 department branch under <strong>{adding.under}</strong>
          </p>
          {formDics === null ? (
            <p className="px-3 py-2 text-[11px] text-ink-faint">Loading divisions…</p>
          ) : formDics.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-ink-faint">
              You are not assigned to a division or department, so there is nothing to file this
              under. Ask an admin to set your org unit.
            </p>
          ) : (
            <InlineAddDepartment
              key={adding.parentObjectiveId}
              indent={12}
              dics={formDics}
              pending={saving}
              onCommit={(values) =>
                run(
                  () =>
                    addDepartmentBranch({
                      kiId: model.kiId,
                      parentObjectiveId: adding.parentObjectiveId,
                      orgUnitId: values.orgUnitId,
                      statement: values.statement,
                    }),
                  afterChange,
                )
              }
              onCancel={() => setAdding(null)}
            />
          )}
        </div>
      )}

      {adding?.kind === "EDIT_MEASURE" && (
        <div className="border border-rule bg-paper">
          <p className="border-b border-rule px-3 py-1 text-[11px] text-ink-muted">
            Editing <strong>{adding.row.name}</strong>{" "}
            <span className="text-ink-faint">({adding.row.code})</span> — the code stays as it is,
            because formulas address the measure by it.
          </p>
          {/* Same scoping as the add form: a division lead is offered only the
              org units they may file to, fetched server-side rather than
              filtered on screen. The measure's current department is listed
              regardless, so an edit cannot silently re-file it.

              The form is keyed by what is being edited. Every field in it is
              seeded from `initial` in a useState initialiser, which runs once
              per mount - so without a key, clicking the pencil on a second
              measure while the first is open reuses the instance and leaves
              the first measure's values in the boxes, under a heading naming
              the second. */}
          {formDics === null ? (
            <p className="px-3 py-2 text-[11px] text-ink-faint">Loading divisions…</p>
          ) : (
          <InlineMeasureForm
            key={adding.row.id}
            indent={12}
            level={adding.row.level}
            fixedMeasureName={adding.row.firstOfObjective ? undefined : adding.row.name}
            dics={formDics}
            businessUnits={model.businessUnits}
            users={users ?? []}
            initial={adding.initial}
            submitLabel="Save measure"
            pendingLabel="Saving…"
            pending={saving}
            onCommit={(values) =>
              run(
                () =>
                  updateControlItem({
                    id: adding.row.id,
                    // Omitted from a row that does not carry the name, which
                    // the server reads as "the measure keeps the name it has".
                    name: adding.row.firstOfObjective ? values.name : undefined,
                    measuredAs: values.measuredAs || null,
                    unit: values.unit,
                    direction: values.direction,
                    aggregation: values.aggregation,
                    decimalPlaces: values.decimalPlaces,
                    dicOrgUnitId: values.dicOrgUnitId,
                    businessUnitId: values.businessUnitId,
                    responsibleUserId: values.responsibleUserId,
                  }),
                afterChange,
              )
            }
            onCancel={() => setAdding(null)}
          />
          )}
        </div>
      )}

      {adding?.kind === "CONTROL_ITEM" && (
        <div className="border border-rule bg-paper">
          <p className="border-b border-rule px-3 py-1 text-[11px] text-ink-muted">
            Adding a Control Item to <strong>{plainText(adding.statement)}</strong> — it shares the
            Objective&apos;s statement and nothing else: its own unit, direction, roll-up,
            department and targets, keyed and evaluated separately.
          </p>
          {formDics === null ? (
            <p className="px-3 py-2 text-[11px] text-ink-faint">Loading divisions…</p>
          ) : (
            <InlineMeasureForm
              key={adding.objectiveId}
              indent={12}
              level={adding.level}
              fixedMeasureName={adding.statement}
              dics={formDics}
              businessUnits={model.businessUnits}
              users={users ?? []}
              submitLabel="Add Control Item"
              pendingLabel="Adding…"
              pending={saving}
              /* Seeded from the Control Item beside it when there is one,
                 because a second one usually differs in what it measures
                 rather than in where it is filed - and the department and
                 business unit are the two fields somebody would otherwise have
                 to look up. An Objective's first has nothing to copy, so the
                 form opens on its own defaults. */
              initial={
                adding.sibling
                  ? {
                      name: adding.statement,
                      measuredAs: "",
                      unit: adding.sibling.unit,
                      direction: adding.sibling.direction,
                      aggregation: adding.sibling.aggregation,
                      decimalPlaces: adding.sibling.decimalPlaces,
                      dicOrgUnitId: adding.sibling.dicOrgUnitId,
                      businessUnitId: adding.sibling.businessUnitId,
                      responsibleUserId: adding.sibling.responsibleUserId,
                    }
                  : undefined
              }
              onCommit={(values) =>
                run(
                  () =>
                    addControlItemToObjective({
                      objectiveId: adding.objectiveId,
                      measuredAs: values.measuredAs || null,
                      unit: values.unit,
                      direction: values.direction,
                      aggregation: values.aggregation,
                      decimalPlaces: values.decimalPlaces,
                      dicOrgUnitId: values.dicOrgUnitId,
                      businessUnitId: values.businessUnitId,
                      responsibleUserId: values.responsibleUserId,
                    }),
                  afterChange,
                )
              }
              onCancel={() => setAdding(null)}
            />
          )}
        </div>
      )}

      {adding?.kind === "MEASURE" && (
        <div className="border border-rule bg-paper">
          <p className="border-b border-rule px-3 py-1 text-[11px] text-ink-muted">
            Adding a measure under <strong>{adding.under}</strong>
          </p>
          {formDics === null ? (
            <p className="px-3 py-2 text-[11px] text-ink-faint">Loading divisions…</p>
          ) : formDics.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-ink-faint">
              You are not assigned to a division or department, so there is nothing to file this
              under. Ask an admin to set your org unit.
            </p>
          ) : (
          <InlineMeasureForm
            key={adding.parentId}
            indent={12}
            /* A Control Item takes the level of the Objective it hangs
               under, which is the same number the server checks when it
               decides whose authority the filing needs. */
            level={model.rows.find((row) => row.id === adding.parentId)?.level ?? 4}
            dics={formDics}
            businessUnits={model.businessUnits}
            users={users ?? []}
            pending={saving}
            onCommit={(values) =>
              run(
                () =>
                  addControlItem({
                    nodeId: adding.parentId,
                    name: values.name,
                    measuredAs: values.measuredAs || null,
                    unit: values.unit,
                    direction: values.direction,
                    aggregation: values.aggregation,
                    decimalPlaces: values.decimalPlaces,
                    dicOrgUnitId: values.dicOrgUnitId,
                    businessUnitId: values.businessUnitId,
                    responsibleUserId: values.responsibleUserId,
                  }),
                afterChange,
              )
            }
            /* The same button, without the measure. addNode takes the level
               from the parent exactly as addControlItem does, so the row
               lands in the same place - it simply has nothing against it
               yet, and CI+ is how it stops being blank. */
            onCommitStatementOnly={(statement) =>
              run(
                () => addNode({ kiId: model.kiId, parentId: adding.parentId, statement }),
                afterChange,
              )
            }
            onCancel={() => setAdding(null)}
          />
          )}
        </div>
      )}

      <SheetGrid
        model={model}
        displayMode={displayMode}
        filters={effectiveFilters}
        compareModel={compareModel}
        compareVersionId={compareVersionId || null}
        condensedQuarters={condensedQuarters}
        onlyQuarter={onlyQuarter}
        onToggleQuarter={toggleQuarter}
        editing={editing}
        entry={entry}
      />
    </div>
  );
}
