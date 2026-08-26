import { activeKiId } from "@/lib/ki/active";
import { loadSheet } from "@/lib/sheet/query";
import { requireSession } from "@/lib/auth/session";
import { InsightsView } from "./InsightsView";

export const dynamic = "force-dynamic";

/**
 * Read-only, company-wide. Levels 1-4 together so a Department's own Control
 * Items count toward their Division's cell - same reasoning as the sheet's
 * "+ Departments" view.
 *
 * The business unit is a filter rather than a second axis of the grid. A cell
 * counts how many measures landed in each band, which is a count of measures
 * and not a sum of incommensurable quantities, so mixing units in one cell
 * breaks no rule - but it does hide which unit the trouble is in, and that is
 * the question the page exists to answer. Filtering is the honest way to ask
 * it: one unit at a time, or all of them together.
 *
 * It lives in the URL rather than component state so a filtered view can be
 * linked to and printed, the same way the sheet carries its column state.
 */
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string }>;
}) {
  await requireSession();
  const { bu } = await searchParams;
  const model = await loadSheet({ levels: [1, 2, 3, 4], kiId: await activeKiId() });

  // An unknown code filters to nothing, which reads as a broken page. Fall
  // back to showing everything and let the control say nothing is selected.
  const selected = model.businessUnits.some((unit) => unit.code === bu) ? bu! : null;
  const rows = selected
    ? model.rows.filter(
        (row) => row.kind !== "CONTROL_ITEM" || row.businessUnitCode === selected,
      )
    : model.rows;

  return <InsightsView model={{ ...model, rows }} businessUnit={selected} />;
}
