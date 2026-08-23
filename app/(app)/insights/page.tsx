import { loadSheet } from "@/lib/sheet/query";
import { requireSession } from "@/lib/auth/session";
import { InsightsView } from "./InsightsView";

export const dynamic = "force-dynamic";

/**
 * Read-only, company-wide. Levels 1-4 together so a Department's own Control
 * Items count toward their Division's cell - same reasoning as the sheet's
 * "+ Departments" view.
 */
export default async function InsightsPage() {
  await requireSession();
  const model = await loadSheet({ levels: [1, 2, 3, 4] });
  return <InsightsView model={model} />;
}
