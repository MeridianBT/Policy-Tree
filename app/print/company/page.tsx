import { requireSession } from "@/lib/auth/session";
import { loadSheet } from "@/lib/sheet/query";
import { PrintSheet } from "../PrintSheet";
import { PrintChrome } from "../PrintChrome";

export const dynamic = "force-dynamic";

export default async function CompanyPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const model = await loadSheet({ levels: [1, 2, 3], targetVersionId: params.version ?? null });
  const pinned = params.version
    ? model.versions.find((version) => version.id === params.version)?.code
    : null;

  return (
    <>
      <PrintChrome />
      <PrintSheet
        model={model}
        title="Company sheet — Levels 1 to 3"
        versionLabel={pinned ? `Target: ${pinned}` : "Target: latest forecast"}
      />
    </>
  );
}
