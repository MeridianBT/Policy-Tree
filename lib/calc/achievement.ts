/**
 * Achievement and gap.
 *
 * Achievement is always expressed against 100% and is always direction aware,
 * so that profit (higher is better) and SG&A overspend (lower is better) can
 * sit in the same table without special casing at the call site.
 *
 *   HIGHER_BETTER  RATIO      actual / target
 *   LOWER_BETTER   RATIO      target / actual
 *   LOWER_BETTER   INVERSE    2 - (actual / target)
 *
 * Every division is guarded. A zero or null denominator yields null, which the
 * UI renders as an em dash. This module never returns Infinity or NaN and
 * never substitutes zero for missing data.
 */

import type { AchievementMethod, Direction } from "./types";

export type GapSense = "FAVOURABLE" | "UNFAVOURABLE" | "NEUTRAL";

export interface AchievementInput {
  actual: number | null;
  target: number | null;
  direction: Direction;
  achievementMethod: AchievementMethod;
}

export function achievement({
  actual,
  target,
  direction,
  achievementMethod,
}: AchievementInput): number | null {
  if (actual === null || target === null) return null;
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return null;

  let result: number;
  if (direction === "HIGHER_BETTER") {
    // INVERSE is a cost-item convention; for a higher-is-better item the plain
    // ratio is the only meaningful reading, so both methods agree here.
    if (target === 0) return null;
    result = actual / target;
  } else if (achievementMethod === "INVERSE") {
    if (target === 0) return null;
    result = 2 - actual / target;
  } else {
    if (actual === 0) return null;
    result = target / actual;
  }

  return Number.isFinite(result) ? result : null;
}

/** Raw signed difference. Display it signed; colour it with `gapSense`. */
export function gap(actual: number | null, target: number | null): number | null {
  if (actual === null || target === null) return null;
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return null;
  return actual - target;
}

/**
 * Whether a gap is good news, given the direction. An SG&A gap of -50 is
 * favourable and must not render red.
 */
export function gapSense(gapValue: number | null, direction: Direction): GapSense {
  if (gapValue === null || gapValue === 0) return "NEUTRAL";
  const favourable = direction === "HIGHER_BETTER" ? gapValue > 0 : gapValue < 0;
  return favourable ? "FAVOURABLE" : "UNFAVOURABLE";
}
