import { requireSession } from "@/lib/auth/session";
import { loadControlItem } from "@/lib/control-item/query";
import { ControlItemDetailView } from "./ControlItemDetail";

export const dynamic = "force-dynamic";

export default async function ControlItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const detail = await loadControlItem(id);
  return <ControlItemDetailView detail={detail} />;
}
