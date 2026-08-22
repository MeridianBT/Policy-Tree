/**
 * Excel download. Authenticated like every other read: any signed-in user may
 * export what they are allowed to see on screen.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, orgUnitSubtree } from "@/lib/auth/session";
import { loadSheet } from "@/lib/sheet/query";
import { buildWorkbook } from "@/lib/export/workbook";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sign in to export.", { status: 401 });

  const params = new URL(request.url).searchParams;
  const division = params.get("division");
  const versionId = params.get("version");

  let levels = [1, 2, 3];
  let orgUnitIds: string[] | undefined;
  let title = "Company sheet — Levels 1 to 3";
  let filename = "company-sheet";

  if (division) {
    const orgUnit = await prisma.orgUnit.findUnique({ where: { code: division.toUpperCase() } });
    if (!orgUnit) return new NextResponse("No such division.", { status: 404 });
    levels = [4];
    orgUnitIds = await orgUnitSubtree(orgUnit.id);
    title = `${orgUnit.code} — ${orgUnit.name} · Level 4`;
    filename = `${orgUnit.code.toLowerCase()}-sheet`;
  }

  const model = await loadSheet({ levels, orgUnitIds, targetVersionId: versionId });

  const pinned = versionId ? model.versions.find((version) => version.id === versionId) : null;
  const basisLabel = pinned ? `Target: ${pinned.code}` : "Target: latest forecast";

  const workbook = await buildWorkbook({ model, title, basisLabel });

  const stamp = new Date().toISOString().slice(0, 10);
  const safeKi = model.kiCode.replace(/\s+/g, "-").toLowerCase();

  return new NextResponse(workbook, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}-${safeKi}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
