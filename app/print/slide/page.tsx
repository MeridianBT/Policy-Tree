import { requireSession } from "@/lib/auth/session";
import { activeKiId } from "@/lib/ki/active";
import { loadSheet } from "@/lib/sheet/query";
import { paramsToView } from "@/components/sheet/filters";
import { SheetLandscape } from "@/components/sheet/SheetLandscape";
import type { LandscapeFigures, LandscapePeriod } from "@/components/sheet/landscape";
import { QUARTERS, type QuarterCode } from "@/lib/domain/period";
import { SlideChrome } from "./SlideChrome";
import "./slide.css";

export const dynamic = "force-dynamic";

/**
 * The Across view, on a page the size of a PowerPoint slide.
 *
 * This is what the "Download PowerPoint" ask turned into. A .pptx would have
 * meant a library whose dependency chain was worth a conversation with IT
 * before it landed; a 13.333in x 7.5in page prints to a PDF that drops into a
 * deck at exactly the right proportions, and the browser everybody already has
 * does the rendering. The menu item says "Slide view (16:9)" rather than
 * promising a file format it does not produce.
 *
 * It renders `SheetLandscape` itself rather than a print-only copy of it. The
 * alternative - a second component drawing the same bracket - is two things to
 * keep in step, and the one that is not looked at every day is the one that
 * quietly stops matching.
 */
export default async function SlidePrintPage({
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
    // Levels 1 to 3 whatever the caller asked for: `buildLandscape` drops
    // Level 4 anyway, and loading rows only to discard them would make the
    // page slower for nothing.
    levels: [1, 2, 3],
    targetVersionId: version,
    // The year being worked on, not whichever is marked current - the same
    // trap the sheet, the export and the A3 have already had closed.
    kiId: params.get("ki") ?? (await activeKiId()),
  });

  const quarter = params.get("quarter");
  const period: LandscapePeriod =
    quarter && (QUARTERS as readonly string[]).includes(quarter) ? (quarter as QuarterCode) : "KI";
  const figures: LandscapeFigures = params.get("columns") === "quarters" ? "QUARTERS" : "PERIOD";
  const pinned = version ? model.versions.find((candidate) => candidate.id === version)?.code : null;

  /*
   * What the slide is of, printed on the slide.
   *
   * A pasted image outlives the toolbar that made it, and a table of figures
   * with no period on it is the one that gets read as the full year three
   * months later. Same argument as the Across view's own title, which is why
   * the wording matches it.
   */
  const unit = model.businessUnits.find((candidate) => view.businessUnits.includes(candidate.code));
  const narrowed =
    view.businessUnits.length > 0 ||
    view.dics.length > 0 ||
    view.belowTarget ||
    view.search.trim().length > 0;
  const scope =
    view.businessUnits.length === 1 && unit
      ? unit.name
      : view.dics.length === 1
        ? view.dics[0]
        : narrowed
          ? "filtered"
          : "whole company";
  const periodLabel =
    figures === "QUARTERS" ? "four quarters" : period === "KI" ? "full year" : period;

  return (
    <>
      <SlideChrome />
      <div className="print-slide mx-auto px-4 py-3 text-ink">
        <header className="mb-2 flex items-baseline justify-between gap-3">
          <h1 className="text-[15px] font-semibold">
            {model.kiCode} · deployment across the page
          </h1>
          <p className="text-[11px] text-ink-muted">
            {scope} · {periodLabel} · {pinned ? `target ${pinned}` : "target: latest forecast"}
          </p>
        </header>

        <SheetLandscape model={model} filters={view} period={period} figures={figures} forPrint />
      </div>
    </>
  );
}
