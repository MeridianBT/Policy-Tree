/**
 * Plain types the calculation module works on. Deliberately decoupled from
 * Prisma so the calc module is a pure function library that can be unit tested
 * without a database, and so a React component can never accidentally depend on
 * a Prisma model shape.
 */

import type { PeriodKey } from "@/lib/domain/period";

export type Aggregation = "SUM" | "AVERAGE" | "LATEST";
export type Direction = "HIGHER_BETTER" | "LOWER_BETTER";
export type AchievementMethod = "RATIO" | "INVERSE";
export type Unit = "PERCENT" | "CURRENCY" | "COUNT" | "RATIO" | "DAYS" | "INDEX";

/** The measurement settings that drive every calculation for a row. */
export interface ControlItemSpec {
  id: string;
  aggregation: Aggregation;
  direction: Direction;
  achievementMethod: AchievementMethod;
  unit: Unit;
  decimalPlaces: number;
}

/** One stored cell, already resolved to a number (raw or computed). */
export interface CellValue {
  value: number | null;
  /** Present when a formula cell failed to evaluate. */
  error?: string | null;
  /**
   * The formula as its author typed it, when this cell holds one rather than a
   * literal. Carried so an editor can put the formula back in front of the
   * person editing it - seeding the box with the computed number instead would
   * quietly turn "=SUM(...)" into a frozen literal the moment anyone tabbed
   * through the cell.
   */
  formula?: string | null;
}

/** Values for one Control Item on one version, keyed by period. */
export type PeriodValues = Record<PeriodKey, CellValue>;

/** Versions ordered as configured: OB, PRB, 1QFC, 2QFC, 3QFC, ACT. */
export interface VersionSpec {
  id: string;
  code: string;
  label: string;
  sequence: number;
  isActual: boolean;
  lockedAt: Date | string | null;
}

/** A control item's values across every version, keyed by version id. */
export type ValuesByVersion = Record<string, PeriodValues>;

export interface EvaluationBandSpec {
  symbol: string;
  label: string;
  /** Inclusive lower bound as a ratio (1.05 = 105%). null = unbounded below. */
  minPct: number | null;
  /** Exclusive upper bound as a ratio. null = unbounded above. */
  maxPct: number | null;
  colorHex: string;
  sortOrder: number;
}
