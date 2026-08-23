/**
 * Which month a reminder run is chasing.
 *
 * This exists because "month end" is ambiguous and getting it wrong is
 * expensive in trust: chase people for a month they have already keyed and
 * they start ignoring the mail.
 *
 * Actuals for a month are keyed *after* that month ends, so a run in the
 * first few days of May is chasing April, and a run late in May is
 * prompting for May, whose close is imminent. One `graceDays` boundary
 * separates the two, so the same scheduled job does the right thing whether
 * it fires on the 1st or the 28th.
 */

import { kiMonths, periodKey, type PeriodKey } from "@/lib/domain/period";

/** Days into a new calendar month during which the previous month is still the one being keyed. */
export const DEFAULT_GRACE_DAYS = 5;

/**
 * The month a run on `today` should chase, before any Ki clamping.
 *
 * Read in UTC throughout, like every other period in this application, so a
 * job running just after midnight in one timezone cannot silently target a
 * different month than the sheet shows.
 */
export function reminderPeriod(today: Date, graceDays = DEFAULT_GRACE_DAYS): PeriodKey {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1; // 1-12
  if (today.getUTCDate() > graceDays) return periodKey(year, month);
  // Still inside the grace window: last month is the one people owe.
  return month === 1 ? periodKey(year - 1, 12) : periodKey(year, month - 1);
}

/**
 * The same, clamped into the Ki actually being run. A reminder can never
 * name a month the sheet has no column for - before the Ki opens that is its
 * first month, after it closes its last.
 */
export function reminderPeriodForKi(
  kiStartYear: number,
  today: Date,
  graceDays = DEFAULT_GRACE_DAYS,
): PeriodKey {
  const months = kiMonths(kiStartYear);
  const wanted = reminderPeriod(today, graceDays);
  if (wanted < months[0]) return months[0];
  if (wanted > months[months.length - 1]) return months[months.length - 1];
  return wanted;
}
