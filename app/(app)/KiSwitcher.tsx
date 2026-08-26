import { activeKiId, selectableKis, setActiveKi } from "@/lib/ki/active";

/**
 * Lets a SUPER_ADMIN or an EXECUTIVE point themselves at a year that is not
 * live — next year, while it is being built — without moving anyone else off
 * the year the company is actually running.
 *
 * The list comes from `selectableKis` rather than a query of its own, so it
 * offers exactly the years the server will accept. An EXECUTIVE reaches
 * forward only: a prior year is the record of what happened and belongs to a
 * SUPER_ADMIN, and a control that offered it would appear to do nothing.
 *
 * When the live Ki is selected the control shows nothing but the year's name,
 * so the ordinary case carries no warning and no visual noise. Working on a
 * draft year is the case that gets marked, because forgetting which year you
 * are keying into is the mistake this whole control makes possible.
 */
export async function KiSwitcher() {
  const [selectable, chosen] = await Promise.all([selectableKis(), activeKiId()]);
  if (selectable.length === 0) return null;
  const all = [...selectable]
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
    .map((ki) => ({ id: ki.id, code: ki.code, isCurrent: ki.isCurrent }));

  const current = all.find((ki) => ki.isCurrent);
  const viewing = chosen ? all.find((ki) => ki.id === chosen) : current;
  const drafting = Boolean(chosen);

  async function choose(formData: FormData) {
    "use server";
    const id = String(formData.get("kiId") ?? "");
    await setActiveKi(id === "current" ? null : id);
  }

  return (
    <form action={choose} className="flex items-center gap-1.5">
      {drafting && (
        <span
          className="rounded-sm border px-1.5 py-0.5 text-[10px] font-medium"
          style={{ color: "#B3261E", borderColor: "#B3261E" }}
          title="You are not looking at the live year. Nobody else sees this."
        >
          DRAFT YEAR
        </span>
      )}
      <select
        name="kiId"
        defaultValue={chosen ?? "current"}
        aria-label="Which year to work on"
        className="rounded-sm border border-rule bg-paper px-1.5 py-0.5 text-[11px] text-ink"
      >
        <option value="current">{current ? `${current.code} · live` : "Current"}</option>
        {all
          .filter((ki) => !ki.isCurrent)
          .map((ki) => (
            <option key={ki.id} value={ki.id}>
              {ki.code}
            </option>
          ))}
      </select>
      <button
        type="submit"
        className="rounded-sm border border-rule px-1.5 py-0.5 text-[11px] text-ink-muted hover:bg-paper-sunken"
      >
        Go
      </button>
      <span className="sr-only">Currently working on {viewing?.code}</span>
    </form>
  );
}
