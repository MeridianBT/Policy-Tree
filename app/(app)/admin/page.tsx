import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AdminScreen } from "./AdminScreen";
import { isAdminSection } from "./sections";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  await requireRole("SUPER_ADMIN");
  // The section lives in the URL so it can be linked to and survives a
  // refresh. An unknown one falls back to the first rather than erroring: a
  // stale bookmark should land somewhere useful, not on a page about itself.
  const { section } = await searchParams;
  const active = isAdminSection(section) ? section : "year";

  const [kis, orgUnits, users, bands, businessUnitRows] = await Promise.all([
    prisma.ki.findMany({
      orderBy: { startDate: "desc" },
      include: {
        planVersions: { orderBy: { sequence: "asc" } },
        _count: { select: { nodes: true } },
      },
    }),
    prisma.orgUnit.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.appUser.findMany({
      orderBy: { name: "asc" },
      include: { orgUnit: { select: { code: true } } },
    }),
    prisma.evaluationBand.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.businessUnit.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { controlItems: true } } },
    }),
  ]);

  return (
    <AdminScreen
      section={active}
      kis={kis.map((ki) => ({
        id: ki.id,
        code: ki.code,
        isCurrent: ki.isCurrent,
        nodeCount: ki._count.nodes,
        versions: ki.planVersions.map((version) => ({
          id: version.id,
          code: version.code,
          label: version.label,
          sequence: version.sequence,
          isActual: version.isActual,
          lockedAt: version.lockedAt?.toISOString() ?? null,
        })),
      }))}
      businessUnits={businessUnitRows.map((unit) => ({
        id: unit.id,
        code: unit.code,
        name: unit.name,
        controlItemCount: unit._count.controlItems,
      }))}
      orgUnits={orgUnits.map((unit) => ({
        id: unit.id,
        code: unit.code,
        name: unit.name,
        type: unit.type,
        parentId: unit.parentId,
      }))}
      users={users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        orgUnitCode: user.orgUnit?.code ?? null,
      }))}
      bands={bands.map((band) => ({
        symbol: band.symbol,
        label: band.label,
        minPct: band.minPct === null ? null : Number(band.minPct),
        maxPct: band.maxPct === null ? null : Number(band.maxPct),
        colorHex: band.colorHex,
        sortOrder: band.sortOrder,
      }))}
    />
  );
}
