/**
 * Fiscal period helpers for the Ki (April 1 -> March 31).
 *
 * A period is always the first day of a month. Everywhere in the application a
 * period is passed around as a `PeriodKey` string, "YYYY-MM", so that it can be
 * used as an object key, compared lexicographically and serialised across the
 * server/client boundary without timezone drift. Conversion to and from `Date`
 * happens only at the database boundary, always in UTC.
 */

export type PeriodKey = string; // "YYYY-MM"

export type QuarterCode = "Q1" | "Q2" | "Q3" | "Q4";

export const QUARTERS: readonly QuarterCode[] = ["Q1", "Q2", "Q3", "Q4"] as const;

/** Calendar month numbers (1-12) belonging to each fiscal quarter. */
const QUARTER_CALENDAR_MONTHS: Record<QuarterCode, readonly number[]> = {
  Q1: [4, 5, 6],
  Q2: [7, 8, 9],
  Q3: [10, 11, 12],
  Q4: [1, 2, 3],
};

/** Short month labels in fiscal order. */
export const FISCAL_MONTH_LABELS = [
  "Apr", "May", "Jun", "Jul", "Aug", "Sep",
  "Oct", "Nov", "Dec", "Jan", "Feb", "Mar",
] as const;

export function periodKey(year: number, month: number): PeriodKey {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function parsePeriodKey(key: PeriodKey): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid period key: ${key}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid period key: ${key}`);
  return { year, month };
}

/** A period as a UTC Date at the first of the month, for the database. */
export function periodToDate(key: PeriodKey): Date {
  const { year, month } = parsePeriodKey(key);
  return new Date(Date.UTC(year, month - 1, 1));
}

/** A database Date back to a period key, read in UTC. */
export function dateToPeriod(date: Date): PeriodKey {
  return periodKey(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

/** The twelve periods of a Ki, in fiscal order: Apr .. Mar. */
export function kiMonths(kiStartYear: number): PeriodKey[] {
  const months: PeriodKey[] = [];
  for (let i = 0; i < 12; i++) {
    const calendarMonth = ((3 + i) % 12) + 1; // 4,5,..,12,1,2,3
    const year = calendarMonth >= 4 ? kiStartYear : kiStartYear + 1;
    months.push(periodKey(year, calendarMonth));
  }
  return months;
}

/** The three periods of one fiscal quarter, in fiscal order. */
export function quarterMonths(kiStartYear: number, quarter: QuarterCode): PeriodKey[] {
  return QUARTER_CALENDAR_MONTHS[quarter].map((calendarMonth) =>
    periodKey(calendarMonth >= 4 ? kiStartYear : kiStartYear + 1, calendarMonth),
  );
}

/** Which fiscal quarter a period falls in. */
export function quarterOf(key: PeriodKey): QuarterCode {
  const { month } = parsePeriodKey(key);
  if (month >= 4 && month <= 6) return "Q1";
  if (month >= 7 && month <= 9) return "Q2";
  if (month >= 10 && month <= 12) return "Q3";
  return "Q4";
}

/** Fiscal index of a period within its Ki: 0 for April .. 11 for March. */
export function fiscalMonthIndex(key: PeriodKey): number {
  const { month } = parsePeriodKey(key);
  return (month - 4 + 12) % 12;
}

/** Short label ("Apr") for a period. */
export function monthLabel(key: PeriodKey): string {
  return FISCAL_MONTH_LABELS[fiscalMonthIndex(key)];
}

/** The Ki start year that a period belongs to. */
export function kiStartYearOf(key: PeriodKey): number {
  const { year, month } = parsePeriodKey(key);
  return month >= 4 ? year : year - 1;
}

/**
 * The numbered Ki code for a Ki starting in the given calendar year.
 *
 * The company counts its fiscal years rather than naming them after a
 * calendar: 103KI runs April 2026 to March 2027, 104KI the year after, and so
 * on, one number per year without a break. That makes the code derivable from
 * the start year, so a new year does not depend on someone remembering which
 * number comes next.
 *
 * A Ki can still be given an explicit code when it needs one - the derivation
 * is the default, not a constraint - which is what keeps this usable for a
 * company that numbers its years differently.
 */
export const KI_EPOCH_NUMBER = 103;
export const KI_EPOCH_START_YEAR = 2026;

export function kiCode(kiStartYear: number): string {
  return `${KI_EPOCH_NUMBER + (kiStartYear - KI_EPOCH_START_YEAR)}KI`;
}

/** The calendar year a numbered Ki starts in - the inverse of `kiCode`. */
export function kiStartYearFor(kiNumber: number): number {
  return KI_EPOCH_START_YEAR + (kiNumber - KI_EPOCH_NUMBER);
}

/** Inclusive range of period keys, used by formula range shorthand. */
export function periodRange(from: PeriodKey, to: PeriodKey): PeriodKey[] {
  const start = parsePeriodKey(from);
  const end = parsePeriodKey(to);
  const startIndex = start.year * 12 + (start.month - 1);
  const endIndex = end.year * 12 + (end.month - 1);
  if (endIndex < startIndex) return [];
  const out: PeriodKey[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    out.push(periodKey(Math.floor(i / 12), (i % 12) + 1));
  }
  return out;
}
