/**
 * What to call one Control Item away from the sheet.
 *
 * The sheet can print a Measure's name once and let its Control Items sit
 * beneath it. Everywhere else - /my-entries, the month-end review, the reminder
 * mail, the measure's own page - shows one line per Control Item with no
 * grouping to lean on, and there the name alone is ambiguous the moment a
 * measure has more than one: three lines all reading "Service experience" tell
 * nobody which figure they owe.
 *
 * So the label carries the control item only when there is a choice to make.
 * A measure of one - which is almost all of them, and every measure that
 * existed before Measures did - reads exactly as it always has.
 */

const SEPARATOR = " — ";

export function controlItemLabel(
  measureName: string,
  measuredAs: string | null | undefined,
  itemCount: number,
): string {
  if (itemCount <= 1 || !measuredAs) return measureName;
  return `${measureName}${SEPARATOR}${measuredAs}`;
}
