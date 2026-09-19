/**
 * The workbook for a view, from the querystring that describes it.
 *
 * Lifted out of `app/api/export/route.ts` when the Share menu grew a second
 * caller: emailing the current view attaches the same file the download
 * button produces, and two paths building "the workbook for these filters"
 * would be two chances to disagree about what the reader was looking at.
 *
 * The route keeps the HTTP part - status codes, headers, the filename on the
 * response - and this keeps the part that reads the plan.
 */

import { prisma } from "@/lib/db";
import { orgUnitSubtree } from "@/lib/auth/session";
import { activeKiId } from "@/lib/ki/active";
import { loadSheet } from "@/lib/sheet/query";
import { matchRows, paramsToView } from "@/components/sheet/filters";
import { buildWorkbook } from "./workbook";

/** A `division=` that names no org unit. The caller decides what that means. */
export class UnknownDivision extends Error {
  constructor(readonly code: string) {
    super(`No org unit with code ${code}.`);
    this.name = "UnknownDivision";
  }
}

export interface ViewWorkbook {
  buffer: ArrayBuffer;
  /** Without an extension; the callers add their own. */
  filename: string;
  /** What the workbook calls itself on its first tab. */
  title: string;
  kiCode: string;
  /** True when the filters left something out of the file. */
  narrowed: boolean;
}

export async function workbookForView(params: URLSearchParams): Promise<ViewWorkbook> {
  const division = params.get("division");
  const versionId = params.get("version");

  const view = paramsToView(params);
  let levels = view.levels ?? [1, 2, 3];
  let orgUnitIds: string[] | undefined;
  let title = "Company sheet — Levels 1 to 3";
  let filename = "company-sheet";

  if (division) {
    const orgUnit = await prisma.orgUnit.findUnique({ where: { code: division.toUpperCase() } });
    if (!orgUnit) throw new UnknownDivision(division);
    levels = [4];
    orgUnitIds = await orgUnitSubtree(orgUnit.id);
    title = `${orgUnit.code} — ${orgUnit.name} · Level 4`;
    filename = `${orgUnit.code.toLowerCase()}-sheet`;
  }

  /*
   * The year the caller is working on, not whichever is marked current.
   *
   * This had the same fault fetchSheet did: with no Ki named it fell through to
   * `isCurrent`, so somebody on next year's draft pressed Export and was handed
   * the live year's workbook - under a screen still reading DRAFT YEAR. It is
   * worse here than on the sheet, because a file leaves the building.
   */
  const model = await loadSheet({
    levels,
    orgUnitIds,
    targetVersionId: versionId,
    kiId: params.get("ki") ?? (await activeKiId()),
  });

  const pinned = versionId ? model.versions.find((version) => version.id === versionId) : null;
  const basisLabel = pinned ? `Target: ${pinned.code}` : "Target: latest forecast";

  /*
   * The file carries what the screen was showing.
   *
   * It used to carry everything regardless, so a reader who had narrowed the
   * sheet to one division exported all ninety measures and had to narrow it
   * again in Excel - or did not notice, and circulated the wrong thing. The
   * filters arrive in the query and are applied with `matchRows`, the same
   * function the sheet itself uses, so the file cannot disagree with the view
   * it was taken from.
   */
  const filtered = { ...model, rows: matchRows(model.rows, view) };
  const narrowed = filtered.rows.length !== model.rows.length;
  const named = narrowed ? `${title} · filtered` : title;

  return {
    buffer: await buildWorkbook({ model: filtered, title: named, basisLabel }),
    filename,
    title: named,
    kiCode: model.kiCode,
    narrowed,
  };
}

/** `company-sheet-103ki-2026-09-19.xlsx` - the name both callers put on it. */
export function workbookFilename(workbook: ViewWorkbook, today: Date = new Date()): string {
  const stamp = today.toISOString().slice(0, 10);
  const safeKi = workbook.kiCode.replace(/\s+/g, "-").toLowerCase();
  return `${workbook.filename}-${safeKi}-${stamp}.xlsx`;
}
