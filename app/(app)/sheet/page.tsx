import { loadSheet } from "@/lib/sheet/query";
import { requireSession } from "@/lib/auth/session";
import { CompanySheet } from "./CompanySheet";

export const dynamic = "force-dynamic";

export default async function SheetPage() {
  await requireSession();
  // Levels 1-3 together form the single company page. Level 4 is the drill-down.
  const model = await loadSheet({ levels: [1, 2, 3] });
  return <CompanySheet initialModel={model} />;
}
