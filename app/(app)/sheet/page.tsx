import { activeKiId } from "@/lib/ki/active";
import { loadSheet } from "@/lib/sheet/query";
import { requireSession } from "@/lib/auth/session";
import { CompanySheet } from "./CompanySheet";

export const dynamic = "force-dynamic";

export default async function SheetPage() {
  const user = await requireSession();
  // Levels 1-3 together form the single company page; the "+ Departments"
  // toggle folds Level 4 in on demand, so it starts on the company view.
  const model = await loadSheet({ levels: [1, 2, 3], kiId: await activeKiId() });
  return (
    <CompanySheet
      initialModel={model}
      currentUser={{ id: user.id, role: user.role, orgUnitId: user.orgUnitId }}
    />
  );
}
