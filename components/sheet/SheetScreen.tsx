"use client";

/**
 * The screen around the grid: version selector, compare mode, display density
 * and the three filters. Everything here is view state; nothing recalculates.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Printer } from "lucide-react";
import type { SheetModel } from "@/lib/sheet/types";
import { Button, MultiSelect, Segmented, Select } from "@/components/ui/primitives";
import { SheetGrid, EMPTY_FILTERS, type EditingHandlers, type SheetFilters } from "./SheetGrid";
import {
  DeleteConfirm,
  InlineAdd,
  InlineAddMeasure,
  useStructureAction,
} from "./StructureControls";
import {
  addControlItem,
  addNode,
  deleteControlItem,
  deleteNode,
  renameControlItem,
  renameNode,
  type DeletionImpact,
} from "@/lib/structure/actions";
import { DISPLAY_MODES, type DisplayMode } from "./SheetCellView";
import { EvaluationSymbol } from "./EvaluationSymbol";
import { ALL_QUARTERS } from "./columns";
import type { QuarterCode } from "@/lib/domain/period";

export const LATEST_FORECAST = "LATEST";

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
  canEditStructure,
  onStructureChanged,
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
  /** ADMIN only. The server re-checks the role on every structure call. */
  canEditStructure?: boolean;
  onStructureChanged?: () => void;
}) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("FULL");
  const [filters, setFilters] = useState<SheetFilters>(EMPTY_FILTERS);
  // Quarters whose month columns are folded away. Purely a view state: the
  // quarter figure is derived from the months either way.
  const [condensedQuarters, setCondensedQuarters] = useState<QuarterCode[]>([]);

  const allCondensed = condensedQuarters.length === ALL_QUARTERS.length;

  const [editMode, setEditMode] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [adding, setAdding] = useState<
    | { kind: "NODE"; parentId: string | null; label: string; under: string }
    | { kind: "MEASURE"; parentId: string; under: string }
    | null
  >(null);
  const [deleting, setDeleting] = useState<
    { kind: "NODE" | "MEASURE"; id: string; message: string; impact: DeletionImpact | null } | null
  >(null);
  const { pending: saving, result, setResult, run } = useStructureAction();

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
    canEditStructure && editMode
      ? {
          dics: model.dics,
          renamingId,
          onStartRename: setRenamingId,
          onCancelRename: () => setRenamingId(null),
          onRenameNode: (id, statement) => run(() => renameNode({ id, statement }), afterChange),
          onRenameControlItem: (id, statement) =>
            run(() => renameControlItem({ id, statement }), afterChange),
          onAddChild: (parentId, kind) =>
            setAdding({
              kind: "NODE",
              parentId,
              label: kind === "OBJECTIVE" ? "objective" : "theme",
              under: labelFor(parentId),
            }),
          onAddMeasure: (nodeId) => setAdding({ kind: "MEASURE", parentId: nodeId, under: labelFor(nodeId) }),
          onDeleteNode: (id) => requestDelete("NODE", id),
          onDeleteControlItem: (id) => requestDelete("MEASURE", id),
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
            href={allCondensed ? `${printHref}?columns=quarters` : printHref}
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

        <MultiSelect
          label="DIC"
          selected={filters.dics}
          options={model.dics.map((dic) => ({ value: dic.code, label: `${dic.code} — ${dic.name}` }))}
          onChange={(dics) => setFilters((previous) => ({ ...previous, dics }))}
        />
        <MultiSelect
          label="Theme"
          selected={filters.themeIds}
          options={model.themes.map((theme) => ({ value: theme.id, label: theme.statement }))}
          onChange={(themeIds) => setFilters((previous) => ({ ...previous, themeIds }))}
        />
        <MultiSelect
          label="Evaluation"
          selected={filters.symbols}
          options={model.bands.map((band) => ({ value: band.symbol, label: band.label }))}
          onChange={(symbols) => setFilters((previous) => ({ ...previous, symbols }))}
          renderOption={(value, label) => {
            const band = model.bands.find((candidate) => candidate.symbol === value);
            return (
              <span className="flex items-center gap-1.5">
                <EvaluationSymbol symbol={value} label={label} color={band?.colorHex} size={13} />
                {label}
              </span>
            );
          }}
        />

        {canEditStructure && (
          <>
            <span className="mx-1 h-4 w-px bg-rule" aria-hidden />
            <Button
              variant={editMode ? "primary" : "default"}
              onClick={() => {
                setEditMode((previous) => !previous);
                setAdding(null);
                setDeleting(null);
                setRenamingId(null);
                setResult(null);
              }}
              title="Add, rename and remove rows directly on the sheet"
            >
              {editMode ? "Done editing" : "Edit structure"}
            </Button>
            {editMode && (
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

        {(filters.dics.length || filters.themeIds.length || filters.symbols.length) > 0 && (
          <Button variant="quiet" onClick={() => setFilters(EMPTY_FILTERS)}>
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

      {adding?.kind === "MEASURE" && (
        <div className="border border-rule bg-paper">
          <p className="border-b border-rule px-3 py-1 text-[11px] text-ink-muted">
            Adding a measure under <strong>{adding.under}</strong>
          </p>
          <InlineAddMeasure
            indent={12}
            dics={model.dics}
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
                  }),
                afterChange,
              )
            }
            onCancel={() => setAdding(null)}
          />
        </div>
      )}

      <SheetGrid
        model={model}
        displayMode={displayMode}
        filters={filters}
        compareModel={compareModel}
        compareVersionId={compareVersionId || null}
        condensedQuarters={condensedQuarters}
        onToggleQuarter={toggleQuarter}
        editing={editing}
      />
    </div>
  );
}
