/**
 * The Control Item detail screen's data: every version's monthly series for
 * the trend chart, the resolved baseline, and the full edit history.
 */

import { prisma } from "@/lib/db";
import { buildRow } from "@/lib/calc/row";
import { loadBands, loadVersions } from "@/lib/sheet/query";
import { dateToPeriod, kiMonths, kiStartYearOf, monthLabel, type PeriodKey } from "@/lib/domain/period";
import type { SheetCell } from "@/lib/calc/row";
import type { EvaluationBandSpec, ValuesByVersion, VersionSpec } from "@/lib/calc/types";

export interface TrendPoint {
  period: PeriodKey;
  label: string;
  /** One key per version code, plus the resolved baseline. */
  [versionCode: string]: string | number | null;
}

export interface AuditRow {
  id: string;
  period: PeriodKey;
  versionCode: string;
  oldValue: number | null;
  newValue: number | null;
  oldFormula: string | null;
  newFormula: string | null;
  changedBy: string;
  changedAt: string;
}

export interface ControlItemDetail {
  id: string;
  code: string;
  name: string;
  measuredAs: string;
  unit: string;
  direction: string;
  achievementMethod: string;
  aggregation: string;
  decimalPlaces: number;
  dicCode: string;
  dicName: string;
  responsibleUserName: string | null;
  objective: string;
  themePath: string[];
  level: number;
  kiCode: string;
  kiStartYear: number;
  months: PeriodKey[];
  versions: VersionSpec[];
  bands: EvaluationBandSpec[];
  cells: SheetCell[];
  trend: TrendPoint[];
  /** Raw stored entries, so a formula can be shown as typed. */
  entries: Array<{
    period: PeriodKey;
    versionCode: string;
    value: number | null;
    formula: string | null;
    error: string | null;
  }>;
  audit: AuditRow[];
}

export async function loadControlItem(controlItemId: string): Promise<ControlItemDetail> {
  const item = await prisma.controlItem.findUniqueOrThrow({
    where: { id: controlItemId },
    include: {
      dicOrgUnit: { select: { code: true, name: true } },
      responsibleUser: { select: { name: true } },
      node: { include: { ki: true } },
    },
  });

  const kiStartYear = kiStartYearOf(dateToPeriod(item.node.ki.startDate));
  const months = kiMonths(kiStartYear);

  const [bands, versions, entries, audits, ancestors] = await Promise.all([
    loadBands(),
    loadVersions(item.node.kiId),
    prisma.entry.findMany({
      where: { controlItemId },
      include: { planVersion: { select: { code: true } } },
      orderBy: { period: "asc" },
    }),
    prisma.entryAudit.findMany({
      where: { entry: { controlItemId } },
      include: {
        changedBy: { select: { name: true } },
        entry: { select: { period: true, planVersion: { select: { code: true } } } },
      },
      orderBy: { changedAt: "desc" },
      take: 200,
    }),
    ancestorStatements(item.nodeId),
  ]);

  const valuesByVersion: ValuesByVersion = {};
  for (const entry of entries) {
    const periodValues = (valuesByVersion[entry.planVersionId] ??= {});
    const stored = entry.formula ? entry.computedValue : entry.rawValue;
    periodValues[dateToPeriod(entry.period)] = {
      value: stored === null || stored === undefined ? null : Number(stored),
      error: entry.errorMessage ?? null,
    };
  }

  const built = buildRow({
    controlItem: {
      id: item.id,
      aggregation: item.aggregation,
      direction: item.direction,
      achievementMethod: item.achievementMethod,
      unit: item.unit,
      decimalPlaces: item.decimalPlaces,
    },
    kiStartYear,
    versions,
    valuesByVersion,
    bands,
  });

  const trend: TrendPoint[] = months.map((period) => {
    const point: TrendPoint = { period, label: monthLabel(period) };
    for (const version of versions) {
      point[version.code] = valuesByVersion[version.id]?.[period]?.value ?? null;
    }
    point.Baseline = built.resolvedTargets[period]?.value ?? null;
    return point;
  });

  return {
    id: item.id,
    code: item.code,
    name: item.name,
    measuredAs: item.measuredAs ?? item.unit.toLowerCase(),
    unit: item.unit,
    direction: item.direction,
    achievementMethod: item.achievementMethod,
    aggregation: item.aggregation,
    decimalPlaces: item.decimalPlaces,
    dicCode: item.dicOrgUnit.code,
    dicName: item.dicOrgUnit.name,
    responsibleUserName: item.responsibleUser?.name ?? null,
    objective: item.node.statement,
    themePath: ancestors,
    level: item.node.level,
    kiCode: item.node.ki.code,
    kiStartYear,
    months,
    versions,
    bands,
    cells: built.cells,
    trend,
    entries: entries.map((entry) => ({
      period: dateToPeriod(entry.period),
      versionCode: entry.planVersion.code,
      value: Number(entry.formula ? entry.computedValue : entry.rawValue) || null,
      formula: entry.formula,
      error: entry.errorMessage,
    })),
    audit: audits.map((audit) => ({
      id: audit.id,
      period: dateToPeriod(audit.entry.period),
      versionCode: audit.entry.planVersion.code,
      oldValue: audit.oldValue === null ? null : Number(audit.oldValue),
      newValue: audit.newValue === null ? null : Number(audit.newValue),
      oldFormula: audit.oldFormula,
      newFormula: audit.newFormula,
      changedBy: audit.changedBy?.name ?? "—",
      changedAt: audit.changedAt.toISOString(),
    })),
  };
}

async function ancestorStatements(nodeId: string): Promise<string[]> {
  const statements: string[] = [];
  let current: { parentId: string | null; statement: string } | null =
    await prisma.node.findUnique({ where: { id: nodeId }, select: { parentId: true, statement: true } });
  while (current?.parentId) {
    const parent: { parentId: string | null; statement: string } | null = await prisma.node.findUnique({
      where: { id: current.parentId },
      select: { parentId: true, statement: true },
    });
    if (!parent) break;
    statements.unshift(parent.statement);
    current = parent;
  }
  return statements;
}
