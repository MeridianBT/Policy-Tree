import { loadSheet } from "@/lib/sheet/query";
import { requireSession } from "@/lib/auth/session";
import { CascadeView } from "./CascadeView";

export const dynamic = "force-dynamic";

/**
 * One page, one continuous line from a Company Goal down to a department's
 * work and back up. Read-only for every role - unlike /sheet, there is no
 * editing surface here at all.
 */
export default async function CascadePage() {
  await requireSession();
  const model = await loadSheet({ levels: [1, 2, 3, 4] });
  return <CascadeView model={model} />;
}
