import { activeKiId } from "@/lib/ki/active";
import { loadSheet } from "@/lib/sheet/query";
import { requireSession } from "@/lib/auth/session";
import { buildReview, latestReviewableMonth } from "@/lib/calc/review";
import { InsightsView } from "./InsightsView";

export const dynamic = "force-dynamic";

/**
 * The month-end review. Read-only, company-wide, Levels 1-4 together so a
 * Department's own Control Items are reviewed beside the company's.
 *
 * One query. Everything on the page - who has not reported, what is below
 * target, what moved - is derived from that one sheet model by lib/calc/review,
 * which is pure and tested directly.
 *
 * Both the month and the business unit live in the URL rather than in component
 * state, so a review can be linked to, printed, and returned to exactly as it
 * was read - the same reasoning as the sheet's column state. The business unit
 * is a filter rather than a second axis: mixing units in one count breaks no
 * rule, but it does hide which unit the trouble is in.
 */
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string; month?: string }>;
}) {
  await requireSession();
  const { bu, month } = await searchParams;
  const model = await loadSheet({ levels: [1, 2, 3, 4], kiId: await activeKiId() });

  // An unknown code filters to nothing, which reads as a broken page. Fall
  // back to showing everything and let the control say nothing is selected.
  const selected = model.businessUnits.some((unit) => unit.code === bu) ? bu! : null;
  const rows = selected
    ? model.rows.filter(
        (row) => row.kind !== "CONTROL_ITEM" || row.businessUnitCode === selected,
      )
    : model.rows;

  // The month asked for, when this Ki has it; otherwise the last month there
  // is anything to review, and failing that the first month of the year, which
  // reports honestly that nothing has been keyed yet.
  const period =
    (month && model.months.includes(month) ? month : null) ??
    latestReviewableMonth(rows, model.months) ??
    model.months[0];
  const index = model.months.indexOf(period);
  const previousPeriod = index > 0 ? model.months[index - 1] : null;

  return (
    <InsightsView
      model={{ ...model, rows }}
      businessUnit={selected}
      period={period}
      previousPeriod={previousPeriod}
      review={buildReview(rows, period, previousPeriod, model.months)}
    />
  );
}
