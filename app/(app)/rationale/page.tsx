import { requireSession } from "@/lib/auth/session";
import { activeKiId } from "@/lib/ki/active";
import { loadSheet } from "@/lib/sheet/query";
import { loadNotes } from "@/lib/rationale/query";
import { RationaleRegister } from "./RationaleRegister";

export const dynamic = "force-dynamic";

export default async function RationalePage() {
  const user = await requireSession();
  const model = await loadSheet({ levels: [1, 2, 3, 4], kiId: await activeKiId() });

  /*
   * Two queries for the whole page: the plan, and every note against it. Which
   * measures this person may write against is decided in the browser by
   * `canEnterFigures`, the same mirror the sheet draws its entry cells from -
   * asking the database per measure would be ninety round trips to render a
   * page whose whole point is working down a list of ninety in one sitting.
   *
   * That mirror decides which buttons appear and nothing else. `addNote`
   * re-derives the answer from stored data on every write, so a stale client
   * can show a control it cannot use.
   */
  const controlItemIds = model.rows
    .filter((row) => row.kind === "CONTROL_ITEM")
    .map((row) => row.id);
  const notes = await loadNotes(controlItemIds);

  return (
    <RationaleRegister
      model={model}
      notes={Object.fromEntries(notes)}
      currentUser={{ id: user.id, role: user.role, orgUnitId: user.orgUnitId }}
    />
  );
}
