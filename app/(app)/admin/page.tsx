import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AdminScreen } from "./AdminScreen";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireRole("SUPER_ADMIN");

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

  const nodes = await prisma.node.findMany({
    where: { kiId: kis.find((ki) => ki.isCurrent)?.id ?? kis[0]?.id },
    orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
    select: { id: true, level: true, kind: true, statement: true, parentId: true },
  });

  return (
    <AdminScreen
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
      nodes={nodes}
    />
  );
}
