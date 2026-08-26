import { requireSession } from "@/lib/auth/session";
import { loadSheet } from "@/lib/sheet/query";
import { PrintSheet } from "../PrintSheet";
import { PrintChrome } from "../PrintChrome";

export const dynamic = "force-dynamic";

export default async function CompanyPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string; columns?: string; bu?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const model = await loadSheet({ levels: [1, 2, 3], targetVersionId: params.version ?? null });
  const pinned = params.version
    ? model.versions.find((version) => version.id === params.version)?.code
    : null;

  // A per-business-unit A3 is the obvious thing to want in a review, so the
  // filter travels in the URL the same way the pinned version and the
  // condensed columns already do. An unknown code prints everything rather
  // than an empty sheet.
  const unit = model.businessUnits.find((candidate) => candidate.code === params.bu);
  const rows = unit
    ? model.rows.filter(
        (row) => row.kind !== "CONTROL_ITEM" || row.businessUnitCode === unit.code,
      )
    : model.rows;

  return (
    <>
      <PrintChrome />
      <PrintSheet
        model={{ ...model, rows }}
        title={
          unit ? `Company sheet — Levels 1 to 3 — ${unit.name}` : "Company sheet — Levels 1 to 3"
        }
        versionLabel={pinned ? `Target: ${pinned}` : "Target: latest forecast"}
        quartersOnly={params.columns === "quarters"}
      />
    </>
  );
}
