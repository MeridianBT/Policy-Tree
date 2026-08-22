/**
 * The comparison baseline.
 *
 * Achievement compares ACT against the latest forecast, defined precisely as:
 *
 *   for a given month, the value from the highest-sequence version that is not
 *   ACT and that actually has a non-null value for that month.
 *
 * So mid-way through 2QFC, April-September actuals compare against whatever
 * forecast was live for those months, while October-March sits against the
 * 2QFC numbers. This resolver is used on nearly every screen; nothing else may
 * re-derive the baseline itself.
 */

import type { PeriodKey } from "@/lib/domain/period";
import type { CellValue, PeriodValues, ValuesByVersion, VersionSpec } from "./types";

export interface ResolvedTarget extends CellValue {
  /** The version the value came from, or null when no version has a value. */
  versionId: string | null;
  versionCode: string | null;
}

export type ResolvedTargets = Record<PeriodKey, ResolvedTarget>;

const EMPTY: ResolvedTarget = { value: null, versionId: null, versionCode: null };

/** Forecast versions, highest sequence first, actuals excluded. */
export function forecastVersionsDescending(versions: readonly VersionSpec[]): VersionSpec[] {
  return versions.filter((version) => !version.isActual).sort((a, b) => b.sequence - a.sequence);
}

/**
 * Resolve the latest-forecast target for each period.
 *
 * `upToSequence` optionally caps which forecasts are considered, which is what
 * lets an earlier review be reproduced exactly as it was seen at the time.
 */
export function resolveLatestForecast(
  valuesByVersion: ValuesByVersion,
  versions: readonly VersionSpec[],
  periods: readonly PeriodKey[],
  upToSequence?: number,
): ResolvedTargets {
  const candidates = forecastVersionsDescending(versions).filter(
    (version) => upToSequence === undefined || version.sequence <= upToSequence,
  );

  const resolved: ResolvedTargets = {};
  for (const period of periods) {
    resolved[period] = EMPTY;
    for (const version of candidates) {
      const cell = valuesByVersion[version.id]?.[period];
      if (cell && cell.value !== null && cell.value !== undefined) {
        resolved[period] = {
          value: cell.value,
          error: cell.error ?? null,
          versionId: version.id,
          versionCode: version.code,
        };
        break;
      }
    }
  }
  return resolved;
}

/** Flatten resolved targets back to plain period values for roll-up. */
export function targetsAsPeriodValues(resolved: ResolvedTargets): PeriodValues {
  const values: PeriodValues = {};
  for (const [period, target] of Object.entries(resolved)) {
    values[period] = { value: target.value, error: target.error ?? null };
  }
  return values;
}

/** The ACT version of a version set, if one is configured. */
export function actualVersion(versions: readonly VersionSpec[]): VersionSpec | null {
  return versions.find((version) => version.isActual) ?? null;
}
