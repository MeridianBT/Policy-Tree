import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, orgUnitSubtree } from "@/lib/auth/session";
import { loadSheet } from "@/lib/sheet/query";
import { DivisionSheet } from "./DivisionSheet";

export const dynamic = "force-dynamic";

export default async function DivisionPage({ params }: { params: Promise<{ code: string }> }) {
  await requireSession();
  const { code } = await params;

  const orgUnit = await prisma.orgUnit.findUnique({ where: { code: code.toUpperCase() } });
  if (!orgUnit) notFound();

  // A division sheet includes the departments beneath it.
  const orgUnitIds = await orgUnitSubtree(orgUnit.id);
  const model = await loadSheet({ levels: [4], orgUnitIds });

  return (
    <DivisionSheet
      initialModel={model}
      orgUnitIds={orgUnitIds}
      divisionCode={orgUnit.code}
      divisionName={orgUnit.name}
    />
  );
}
