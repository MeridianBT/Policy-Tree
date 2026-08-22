import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { orgUnitSubtree, requireSession } from "@/lib/auth/session";
import { loadSheet } from "@/lib/sheet/query";
import { PrintSheet } from "../../PrintSheet";
import { PrintChrome } from "../../PrintChrome";

export const dynamic = "force-dynamic";

export default async function DivisionPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ columns?: string }>;
}) {
  await requireSession();
  const { code } = await params;
  const query = await searchParams;
  const orgUnit = await prisma.orgUnit.findUnique({ where: { code: code.toUpperCase() } });
  if (!orgUnit) notFound();

  const model = await loadSheet({ levels: [4], orgUnitIds: await orgUnitSubtree(orgUnit.id) });

  return (
    <>
      <PrintChrome />
      <PrintSheet
        model={model}
        title={`${orgUnit.code} — ${orgUnit.name} · Level 4`}
        versionLabel="Target: latest forecast"
        quartersOnly={query.columns === "quarters"}
      />
    </>
  );
}
