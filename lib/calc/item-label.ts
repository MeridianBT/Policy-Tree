/**
 * What to call one Control Item away from the sheet.
 *
 * The sheet can print an Objective's statement once and let its Control Items
 * sit beneath it. Everywhere else - /my-entries, the month-end review, the
 * reminder mail, the measure's own page - shows one line per Control Item with
 * no grouping to lean on, and there the statement alone is ambiguous the moment
 * an Objective carries more than one: three lines all reading "Service
 * experience" tell nobody which figure they owe.
 *
 * So the label carries the control item only when there is a choice to make.
 * An Objective of one - which is almost all of them - reads as its statement
 * alone, exactly as it always has.
 */

const SEPARATOR = " — ";

export function controlItemLabel(
  objectiveStatement: string,
  measuredAs: string | null | undefined,
  itemCount: number,
): string {
  if (itemCount <= 1 || !measuredAs) return objectiveStatement;
  return `${objectiveStatement}${SEPARATOR}${measuredAs}`;
}
