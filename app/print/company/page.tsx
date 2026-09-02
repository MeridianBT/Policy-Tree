import { requireSession } from "@/lib/auth/session";
import { activeKiId } from "@/lib/ki/active";
import { loadSheet } from "@/lib/sheet/query";
import { matchRows, paramsToView } from "@/components/sheet/filters";
import { PrintSheet } from "../PrintSheet";
import { PrintChrome } from "../PrintChrome";

export const dynamic = "force-dynamic";

export default async function CompanyPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const raw = await searchParams;
  const params = new URLSearchParams(
    Object.entries(raw).flatMap(([key, value]) =>
      value === undefined
        ? []
        : [[key, Array.isArray(value) ? value.join(",") : value] as [string, string]],
    ),
  );

  const view = paramsToView(params);
  const version = params.get("version");
  const model = await loadSheet({
    levels: view.levels ?? [1, 2, 3],
    targetVersionId: version,
    // The year being worked on, not whichever is marked current. Printing the
    // live year from a screen reading DRAFT YEAR is the same trap the sheet
    // and the export have already had closed.
    kiId: params.get("ki") ?? (await activeKiId()),
  });
  const pinned = version ? model.versions.find((candidate) => candidate.id === version)?.code : null;

  /*
   * What is printed is what was on screen.
   *
   * A per-business-unit A3 was already possible - one code travelled in the URL
   * - but every other filter was dropped, so a reader who had narrowed to a
   * division printed all ninety measures anyway. The whole toolbar state
   * travels now, and `matchRows` applies it: the same function the sheet uses,
   * so the page cannot quietly disagree with the view it was opened from.
   */
  const rows = matchRows(model.rows, view);
  const deepest = view.levels?.includes(4) ? 4 : 3;
  const narrowed = rows.length !== model.rows.length;

  /*
   * What the filter was, for the printed title. A sheet that leaves the screen
   * has to say what it is: an A3 on a wall showing three quarters of the plan
   * with nothing admitting to it is worse than no A3.
   */
  const unit = model.businessUnits.find((candidate) => view.businessUnits.includes(candidate.code));
  const named =
    view.businessUnits.length === 1 && unit
      ? unit.name
      : view.dics.length === 1
        ? view.dics[0]
        : narrowed
          ? "filtered"
          : null;

  return (
    <>
      <PrintChrome />
      <PrintSheet
        model={{ ...model, rows }}
        title={
          named
            ? `Company sheet — Levels 1 to ${deepest} — ${named}`
            : `Company sheet — Levels 1 to ${deepest}`
        }
        versionLabel={pinned ? `Target: ${pinned}` : "Target: latest forecast"}
        quartersOnly={params.get("columns") === "quarters"}
      />
    </>
  );
}
