/**
 * Excel download. Authenticated like every other read: any signed-in user may
 * export what they are allowed to see on screen.
 *
 * The workbook itself is built by `lib/export/for-view.ts`, which the Share
 * menu's email action also calls - what is downloaded and what is attached to
 * a message have to be the same file, so they are built in the same place.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { UnknownDivision, workbookFilename, workbookForView } from "@/lib/export/for-view";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sign in to export.", { status: 401 });

  const params = new URL(request.url).searchParams;

  try {
    const workbook = await workbookForView(params);
    return new NextResponse(workbook.buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${workbookFilename(workbook)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof UnknownDivision) return new NextResponse("No such division.", { status: 404 });
    throw error;
  }
}
