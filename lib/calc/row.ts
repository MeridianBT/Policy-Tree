/**
 * Assembling one Control Item into the seventeen columns of the sheet:
 * Apr May Jun Q1 Jul Aug Sep Q2 Oct Nov Dec Q3 Jan Feb Mar Q4 Ki.
 *
 * This is the only place a sheet cell is produced. A React component receives
 * finished cells and renders them; it never divides, never sums and never
 * decides a symbol.
 *
 * Quarter and Ki columns roll target and actual up independently and then
 * compute achievement on the rolled values. Achievement is never the average
 * of the monthly achievements - that would weight a small month equally with a
 * large one.
 */

import {
  QUARTERS,
  kiMonths,
  monthLabel,
  quarterMonths,
  type PeriodKey,
  type QuarterCode,
} from "@/lib/domain/period";
import { rollUp } from "./aggregate";
import { achievement, gap, gapSense, type GapSense } from "./achievement";
import { bandFor } from "./bands";
import { resolveLatestForecast, targetsAsPeriodValues, type ResolvedTargets } from "./baseline";
import type {
  ControlItemSpec,
  EvaluationBandSpec,
  PeriodValues,
  ValuesByVersion,
  VersionSpec,
} from "./types";

export type ColumnKind = "MONTH" | "QUARTER" | "KI";

export interface SheetCell {
  key: string;
  kind: ColumnKind;
  label: string;
  /** Populated for month columns only. */
  period: PeriodKey | null;
  quarter: QuarterCode | null;
  target: number | null;
  /** Which forecast version supplied the target (month columns only). */
  targetVersionCode: string | null;
  /** The target's formula as typed, when the stored entry holds one. */
  targetFormula: string | null;
  /**
   * True when this cell's target is one stored entry, on one unlocked version,
   * and can therefore be keyed directly.
   *
   * False in three different situations, and the third is the interesting one:
   * a derived column has no entry behind it at all; a locked version is the
   * record of what was committed; and the latest-forecast *resolution* is an
   * answer assembled from several versions, so it belongs to none of them and
   * there is no single cell for a keystroke to land in. Pin a version and the
   * question has an answer again.
   */
  targetEditable: boolean;
  actual: number | null;
  achievement: number | null;
  gap: number | null;
  gapSense: GapSense;
  symbol: string | null;
  symbolLabel: string | null;
  symbolColor: string | null;
  /** A formula error on the underlying entry, surfaced in the cell. */
  error: string | null;
  /** True when the underlying version is locked and the cell is read-only. */
  locked: boolean;
}

export interface SheetRow {
  controlItemId: string;
  cells: SheetCell[];
  /** Ki-level summary, the same object as the final cell, for quick filtering. */
  kiCell: SheetCell;
  /** Latest-forecast target resolution, exposed for the detail screen. */
  resolvedTargets: ResolvedTargets;
}

export interface BuildRowInput {
  controlItem: ControlItemSpec;
  kiStartYear: number;
  versions: readonly VersionSpec[];
  valuesByVersion: ValuesByVersion;
  bands: readonly EvaluationBandSpec[];
  /**
   * Compare a specific version against actuals instead of the latest forecast.
   * Used by the version selector and by compare mode.
   */
  targetVersionId?: string | null;
  /** Cap the forecast sequence considered by the baseline resolver. */
  upToSequence?: number;
}

const EMPTY_VALUES: PeriodValues = {};

export function buildRow(input: BuildRowInput): SheetRow {
  const { controlItem, kiStartYear, versions, valuesByVersion, bands } = input;
  const months = kiMonths(kiStartYear);

  const actualSpec = versions.find((version) => version.isActual) ?? null;
  const actualValues = actualSpec ? valuesByVersion[actualSpec.id] ?? EMPTY_VALUES : EMPTY_VALUES;

  // Targets: either one pinned version, or the latest-forecast resolution.
  let resolvedTargets: ResolvedTargets;
  if (input.targetVersionId) {
    const pinned = versions.find((version) => version.id === input.targetVersionId);
    const pinnedValues = valuesByVersion[input.targetVersionId] ?? EMPTY_VALUES;
    resolvedTargets = {};
    for (const period of months) {
      const cell = pinnedValues[period];
      const hasValue = cell != null && cell.value !== null && cell.value !== undefined;
      resolvedTargets[period] = {
        value: hasValue ? cell!.value : null,
        error: cell?.error ?? null,
        formula: cell?.formula ?? null,
        versionId: hasValue ? input.targetVersionId : null,
        versionCode: hasValue ? pinned?.code ?? null : null,
      };
    }
  } else {
    resolvedTargets = resolveLatestForecast(valuesByVersion, versions, months, input.upToSequence);
  }

  const targetValues = targetsAsPeriodValues(resolvedTargets);
  const targetLocked = lockedLookup(versions);
  // A month's target is keyable only when the reader pinned the version they
  // are looking at. Unpinned, the column shows a resolution across versions,
  // and there is no one entry a keystroke could belong to.
  const pinnedTarget = input.targetVersionId
    ? versions.find((version) => version.id === input.targetVersionId) ?? null
    : null;
  const targetEditable = pinnedTarget !== null && pinnedTarget.lockedAt == null;

  const cells: SheetCell[] = [];
  for (const quarter of QUARTERS) {
    for (const period of quarterMonths(kiStartYear, quarter)) {
      const resolved = resolvedTargets[period];
      const actualCell = actualValues[period];
      cells.push(
        makeCell({
          key: period,
          kind: "MONTH",
          label: monthLabel(period),
          period,
          quarter,
          target: resolved?.value ?? null,
          targetVersionCode: resolved?.versionCode ?? null,
          targetFormula: resolved?.formula ?? null,
          targetEditable,
          actual: actualCell?.value ?? null,
          error: actualCell?.error ?? resolved?.error ?? null,
          locked: actualSpec ? targetLocked.get(actualSpec.id) === true : false,
          controlItem,
          bands,
        }),
      );
    }
    cells.push(
      summaryCell({
        key: quarter,
        kind: "QUARTER",
        label: quarter,
        quarter,
        periods: quarterMonths(kiStartYear, quarter),
        targetValues,
        actualValues,
        controlItem,
        bands,
      }),
    );
  }

  const kiCell = summaryCell({
    key: "KI",
    kind: "KI",
    label: "Ki Total",
    quarter: null,
    periods: months,
    targetValues,
    actualValues,
    controlItem,
    bands,
  });
  cells.push(kiCell);

  return { controlItemId: controlItem.id, cells, kiCell, resolvedTargets };
}

function lockedLookup(versions: readonly VersionSpec[]): Map<string, boolean> {
  return new Map(versions.map((version) => [version.id, version.lockedAt != null]));
}

interface MakeCellInput {
  key: string;
  kind: ColumnKind;
  label: string;
  period?: PeriodKey | null;
  quarter: QuarterCode | null;
  target: number | null;
  targetVersionCode: string | null;
  targetFormula: string | null;
  targetEditable: boolean;
  actual: number | null;
  error: string | null;
  locked: boolean;
  controlItem: ControlItemSpec;
  bands: readonly EvaluationBandSpec[];
}

function makeCell(input: MakeCellInput): SheetCell {
  const { controlItem, bands } = input;
  const achieved = achievement({
    actual: input.actual,
    target: input.target,
    direction: controlItem.direction,
    achievementMethod: controlItem.achievementMethod,
  });
  const gapValue = gap(input.actual, input.target);
  const band = bandFor(achieved, bands);

  return {
    key: input.key,
    kind: input.kind,
    label: input.label,
    period: input.period ?? null,
    quarter: input.quarter,
    target: input.target,
    targetVersionCode: input.targetVersionCode,
    targetFormula: input.targetFormula,
    targetEditable: input.targetEditable,
    actual: input.actual,
    achievement: achieved,
    gap: gapValue,
    gapSense: gapSense(gapValue, controlItem.direction),
    symbol: band?.symbol ?? null,
    symbolLabel: band?.label ?? null,
    symbolColor: band?.colorHex ?? null,
    error: input.error,
    locked: input.locked,
  };
}

interface SummaryCellInput {
  key: string;
  kind: ColumnKind;
  label: string;
  quarter: QuarterCode | null;
  periods: readonly PeriodKey[];
  targetValues: PeriodValues;
  actualValues: PeriodValues;
  controlItem: ControlItemSpec;
  bands: readonly EvaluationBandSpec[];
}

function summaryCell(input: SummaryCellInput): SheetCell {
  const aggregation = input.controlItem.aggregation;
  return makeCell({
    key: input.key,
    kind: input.kind,
    label: input.label,
    period: null,
    quarter: input.quarter,
    target: rollUp(input.targetValues, input.periods, aggregation),
    targetVersionCode: null,
    targetFormula: null,
    // A quarter and a Ki total are derived from the months beneath them. There
    // is no stored cell here to key, which is the whole reason the month is the
    // only grain anyone types into.
    targetEditable: false,
    actual: rollUp(input.actualValues, input.periods, aggregation),
    error: null,
    locked: true, // derived columns are never editable
    controlItem: input.controlItem,
    bands: input.bands,
  });
}
