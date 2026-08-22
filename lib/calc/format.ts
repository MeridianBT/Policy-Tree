/**
 * Display formatting. Empty is not zero: a cell with no data is an em dash,
 * visually distinct from a real 0. Numbers are right aligned and rendered with
 * tabular figures, so `decimalPlaces` must be respected exactly - a value that
 * rounds to a different width breaks the decimal alignment of the column.
 */

import type { Unit } from "./types";

export const EM_DASH = "—";

const UNIT_SUFFIX: Record<Unit, string> = {
  PERCENT: "%",
  CURRENCY: "",
  COUNT: "",
  RATIO: "",
  DAYS: "d",
  INDEX: "",
};

const UNIT_PREFIX: Record<Unit, string> = {
  PERCENT: "",
  CURRENCY: "$",
  COUNT: "",
  RATIO: "",
  DAYS: "",
  INDEX: "",
};

export function formatValue(
  value: number | null | undefined,
  decimalPlaces: number,
  unit?: Unit,
  options?: { withUnit?: boolean; signed?: boolean },
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;

  const magnitude = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });
  const sign = value < 0 ? "-" : options?.signed ? "+" : "";
  const prefix = options?.withUnit && unit ? UNIT_PREFIX[unit] : "";
  const suffix = options?.withUnit && unit ? UNIT_SUFFIX[unit] : "";
  return `${sign}${prefix}${magnitude}${suffix}`;
}

/** Achievement is stored as a ratio and always displayed against 100%. */
export function formatAchievement(achievement: number | null | undefined): string {
  if (achievement === null || achievement === undefined || !Number.isFinite(achievement)) {
    return EM_DASH;
  }
  return `${(achievement * 100).toFixed(1)}%`;
}

export function formatUnitLabel(unit: Unit): string {
  switch (unit) {
    case "PERCENT": return "%";
    case "CURRENCY": return "$";
    case "COUNT": return "no.";
    case "RATIO": return "ratio";
    case "DAYS": return "days";
    case "INDEX": return "index";
  }
}
