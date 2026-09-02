/**
 * The upload template, for the Ki the caller names.
 *
 * Authenticated like the export, and for the same reason: it carries the plan's
 * statements and codes, which is what any signed-in user already sees on the
 * sheet. It writes nothing.
 *
 * `?ki=` is required rather than defaulted, because this is downloaded from a
 * panel that has already asked which year the file will be uploaded into. A
 * template for one year and an upload into another is exactly the mismatch the
 * whole two-step preview exists to catch, and it is better not to hand somebody
 * the makings of it.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadSheet } from "@/lib/sheet/query";
import { buildTemplate } from "@/lib/export/template";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sign in to download a template.", { status: 401 });

  const kiId = new URL(request.url).searchParams.get("ki");
  if (!kiId) return new NextResponse("Name the Ki this template is for.", { status: 400 });

  const ki = await prisma.ki.findUnique({ where: { id: kiId }, select: { id: true } });
  if (!ki) return new NextResponse("No such Ki.", { status: 404 });

  // Levels 1 to 3. A Level 4 branch is refused by the importer - it has to be
  // started on the sheet, where the Objective it ladders into is chosen - so
  // pre-filling one would be offering a row that cannot be sent back.
  const model = await loadSheet({ levels: [1, 2, 3], kiId: ki.id });
  const workbook = await buildTemplate(model);

  const safeKi = model.kiCode.replace(/\s+/g, "-").toLowerCase();
  return new NextResponse(workbook, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="upload-template-${safeKi}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
