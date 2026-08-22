"use client";

/**
 * The screen around the grid: version selector, compare mode, display density
 * and the three filters. Everything here is view state; nothing recalculates.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import type { SheetModel } from "@/lib/sheet/types";
import { Button, MultiSelect, Segmented, Select } from "@/components/ui/primitives";
import { SheetGrid, EMPTY_FILTERS, type SheetFilters } from "./SheetGrid";
import { DISPLAY_MODES, type DisplayMode } from "./SheetCellView";
import { EvaluationSymbol } from "./EvaluationSymbol";

export const LATEST_FORECAST = "LATEST";

export function SheetScreen({
  model,
  title,
  subtitle,
  printHref,
  /** Loader used when the target version or compare version changes. */
  onReload,
  loading,
  compareModel,
  compareVersionId,
  targetVersionId,
  onTargetVersionChange,
  onCompareVersionChange,
}: {
  model: SheetModel;
  title: string;
  subtitle?: string;
  printHref?: string;
  onReload?: () => void;
  loading?: boolean;
  compareModel?: SheetModel | null;
  compareVersionId: string;
  targetVersionId: string;
  onTargetVersionChange: (value: string) => void;
  onCompareVersionChange: (value: string) => void;
}) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("FULL");
  const [filters, setFilters] = useState<SheetFilters>(EMPTY_FILTERS);

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
        {printHref && (
          <Link
            href={printHref}
            target="_blank"
            className="flex items-center gap-1 rounded-sm border border-rule bg-paper px-2 py-1 text-[11px] text-ink hover:bg-paper-sunken"
          >
            <Printer size={12} /> Print view
          </Link>
        )}
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

      <SheetGrid
        model={model}
        displayMode={displayMode}
        filters={filters}
        compareModel={compareModel}
        compareVersionId={compareVersionId || null}
      />
    </div>
  );
}
