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
import { Download, Printer } from "lucide-react";
import type { SheetModel } from "@/lib/sheet/types";
import { Button, MultiSelect, Segmented, Select } from "@/components/ui/primitives";
import {
  SheetGrid,
  EMPTY_FILTERS,
  type EditingHandlers,
  type EntryHandlers,
  type SheetFilters,
} from "./SheetGrid";
import { cellKey, retireSaved, type CellEditState } from "./entry-state";
import { canEnterFigures, type EditingUser } from "./permissions";
import { saveEntryAction } from "@/lib/entries/actions";
import type { ControlItemRow } from "@/lib/sheet/types";
import {
  DeleteConfirm,
  InlineAdd,
  InlineAddDepartment,
  InlineAddMeasure,
  useStructureAction,
  type DicOption,
} from "./StructureControls";
import {
  addControlItem,
  addDepartmentBranch,
  addDepartmentObjective,
  addNode,
  assignableDics,
  deleteControlItem,
  deleteNode,
  renameControlItem,
  renameNode,
  reorderRow,
  type DeletionImpact,
} from "@/lib/structure/actions";
import { DISPLAY_MODES, type DisplayMode } from "./SheetCellView";
import { ALL_QUARTERS } from "./columns";
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

  const entry: EntryHandlers | undefined =
    entryMode && currentUser && pinnedVersion
      ? {
          versionId: pinnedVersion.id,
          versionCode: pinnedVersion.code,
          canEdit: (row) => canEnterFigures(currentUser, model.dics, row),
          edited,
          onCommit: commitFigure,
        }
      : undefined;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [adding, setAdding] = useState<
    | { kind: "NODE"; parentId: string | null; label: string; under: string }
    | { kind: "DEPARTMENT_BRANCH"; parentObjectiveId: string; under: string }
    | { kind: "DEPARTMENT_OBJECTIVE"; parentThemeId: string; under: string }
    | { kind: "MEASURE"; parentId: string; under: string }
    | null
  >(null);
  const [deleting, setDeleting] = useState<
    { kind: "NODE" | "MEASURE"; id: string; message: string; impact: DeletionImpact | null } | null
  >(null);
  const { pending: saving, result, setResult, run } = useStructureAction();

  // The full division/department list is only appropriate for someone who
  // works company-wide. An OWNER may only file a new Level 4 branch or Control
  // Item under their own org unit, so both the "add department" and "add
  // measure" pickers use a narrower list, fetched once - scoped server-side,
  // not merely hidden - the moment edit mode turns on for them.
  const [scopedDics, setScopedDics] = useState<DicOption[] | null>(null);
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
  }, [currentUser, companyWide, scopedDics, setResult]);

  const labelFor = (id: string) => {
    const row = model.rows.find((candidate) => candidate.id === id);
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
          onRenameControlItem: (id, statement) =>
            run(() => renameControlItem({ id, statement }), afterChange),
          onAddChild: (parentId, kind) => {
            // A Level 4 Theme's continuation is its own Objective, scoped to
            // whoever owns that branch; everything above Level 4 is a plain
            // continuation of the company-wide tree, for a SUPER_ADMIN or an
            // EXECUTIVE.
            const parentRow = model.rows.find((row) => row.id === parentId);
            if (parentRow && parentRow.level === 4 && parentRow.kind !== "CONTROL_ITEM") {
              setAdding({ kind: "DEPARTMENT_OBJECTIVE", parentThemeId: parentId, under: labelFor(parentId) });
              return;
            }
            setAdding({
              kind: "NODE",
              parentId,
              label: kind === "OBJECTIVE" ? "objective" : "theme",
              under: labelFor(parentId),
            });
          },
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
        <div className="flex items-center gap-2">
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
              ...divisionOptions.map((dic) => ({ value: dic.code, label: `${dic.code} — ${dic.name}` })),
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
            label: dic.type === "DEPARTMENT" ? `${dic.parentCode} / ${dic.code} — ${dic.name}` : `${dic.code} — ${dic.name}`,
          }))}
          onChange={(dics) => setFilters((previous) => ({ ...previous, dics }))}
        />

        {canEnterFiguresHere && (
          <>
            <span className="mx-1 h-4 w-px bg-rule" aria-hidden />
            <Button
              variant={entryMode ? "primary" : "default"}
              onClick={() => setEntryModeWanted((previous) => !previous)}
              title={`Key ${pinnedVersion?.code} targets directly into the month columns`}
            >
              {entryMode ? "Done entering" : "Enter figures"}
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
              {editMode ? "Done editing" : "Edit structure"}
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
          beginning with <code className="num">=</code> is a formula. Quarters and the Ki total are
          derived from the months, so they are not keyed. Actuals are entered in{" "}
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

      {adding?.kind === "DEPARTMENT_OBJECTIVE" && (
        <div className="border border-rule bg-paper">
          <p className="border-b border-rule px-3 py-1 text-[11px] text-ink-muted">
            Adding an objective under <strong>{adding.under}</strong>
          </p>
          <InlineAdd
            label="objective"
            indent={12}
            onCommit={(statement) =>
              run(
                () => addDepartmentObjective({ kiId: model.kiId, parentThemeId: adding.parentThemeId, statement }),
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
          <InlineAddMeasure
            indent={12}
            dics={formDics}
            businessUnits={model.businessUnits}
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
                  }),
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
        onToggleQuarter={toggleQuarter}
        editing={editing}
        entry={entry}
      />
    </div>
  );
}
