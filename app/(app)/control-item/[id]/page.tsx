import { canEditControlItem, requireSession } from "@/lib/auth/session";
import { loadControlItem } from "@/lib/control-item/query";
import { loadNotes } from "@/lib/rationale/query";
import { ControlItemDetailView } from "./ControlItemDetail";

export const dynamic = "force-dynamic";

export default async function ControlItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession();
  const { id } = await params;
  const detail = await loadControlItem(id);

  /*
   * One measure, so the real permission check rather than the client mirror
   * the register uses: there is no N+1 to avoid here, and this is the same
   * answer `addNote` will re-derive when the write arrives.
   */
  const notes = await loadNotes([id]);
  const canEdit = await canEditControlItem(user, id);

  return (
    <ControlItemDetailView
      detail={detail}
      notes={notes.get(id) ?? []}
      canEdit={canEdit}
      currentUserId={user.id}
      isSuperAdmin={user.role === "SUPER_ADMIN"}
    />
  );
}
