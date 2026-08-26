/**
 * Walks the hand-verification checklist against the seeded Ki, through the real
 * modules rather than through mocks.
 *
 *   npm run db:seed && npx tsx scripts/accept-check.ts && npm run db:seed
 *
 * It writes to the current Ki - clearing a month, setting a zero target,
 * locking 2QFC and unlocking it again - so run it against a development
 * database and re-seed afterwards. The unit and integration suites are the
 * regression net; this is the "check it by hand" pass, automated.
 */
import "dotenv/config";
import { prisma } from "../lib/db.ts";
import { loadSheet } from "../lib/sheet/query.ts";
import { saveEntry, VersionLockedError } from "../lib/entries/save.ts";
import { formatValue, formatAchievement, EM_DASH } from "../lib/calc/format.ts";
import type { ControlItemRow } from "../lib/sheet/types.ts";

const pass = (n: string, ok: boolean, detail = "") =>
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${detail ? "  — " + detail : ""}`);

async function main() {

async function adminUser() {
  const admin = await prisma.appUser.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: "SUPER_ADMIN" as const,
    orgUnitId: admin.orgUnitId,
    orgUnitCode: null,
  };
}

const model = await loadSheet({ levels: [1, 2, 3] });
const rows = model.rows.filter((r) => r.kind === "CONTROL_ITEM") as ControlItemRow[];
const byCode = new Map(rows.map((r) => [r.code, r]));
const cell = (r: ControlItemRow, k: string) => r.cells.find((c) => c.key === k)!;

// 1. SUM: Q1 = Apr + May + Jun, Ki = sum of quarters
{
  const r = byCode.get("AUTO-VOL")!;
  const q1 = cell(r, "Q1").actual!;
  const months = ["2026-04", "2026-05", "2026-06"].reduce((t, k) => t + (cell(r, k).actual ?? 0), 0);
  const ki = cell(r, "KI").actual!;
  const quarters = ["Q1", "Q2", "Q3", "Q4"].reduce((t, k) => t + (cell(r, k).actual ?? 0), 0);
  pass("SUM: Q1 = Apr+May+Jun and Ki = sum of quarters", q1 === months && ki === quarters,
    `Q1=${q1} months=${months} Ki=${ki} quarters=${quarters}`);
}

// 2. AVERAGE with only two of three months populated
{
  const r = byCode.get("AUTO-MIX")!; // AVERAGE aggregation
  const admin = await adminUser();
  const act = model.versions.find((x) => x.isActual)!;
  // The seed populates every month of the first half, so clear May to create
  // the partial quarter this check is about.
  await saveEntry(admin, { controlItemId: r.id, period: "2026-05", planVersionId: act.id, input: null });

  const after = await loadSheet({ levels: [1, 2, 3] });
  const row = (after.rows.filter((x) => x.kind === "CONTROL_ITEM") as ControlItemRow[]).find((x) => x.code === "AUTO-MIX")!;
  const at = (k: string) => row.cells.find((c) => c.key === k)!;
  const populated = ["2026-04", "2026-05", "2026-06"].map((k) => at(k).actual).filter((v) => v !== null) as number[];
  const mean = populated.reduce((a, b) => a + b, 0) / populated.length;

  pass("AVERAGE with two of three months populated averages only the two",
    populated.length === 2 && Math.abs(at("Q1").actual! - mean) < 1e-9,
    `May cleared, ${populated.length} months populated, Q1=${at("Q1").actual!.toFixed(4)}`);
  pass("A cleared month is an em dash, not a zero",
    at("2026-05").actual === null && formatValue(at("2026-05").actual, row.decimalPlaces) === EM_DASH);
  pass("AVERAGE over a quarter with no actuals at all is an em dash",
    at("Q3").actual === null && formatValue(at("Q3").actual, row.decimalPlaces) === EM_DASH);
}

// 3. LATEST takes the most recent populated month
{
  const r = byCode.get("FRC-HC")!; // LATEST
  const q2Months = ["2026-07", "2026-08", "2026-09"];
  const populated = q2Months.filter((k) => cell(r, k).actual !== null);
  const last = cell(r, populated[populated.length - 1]).actual;
  pass("LATEST takes the most recent populated month", cell(r, "Q2").actual === last,
    `Q2=${cell(r, "Q2").actual} last populated (${populated[populated.length - 1]})=${last}`);
  pass("LATEST over a quarter with no actuals is null", cell(r, "Q4").actual === null);
}

// 4. SG&A under budget -> achievement above 100% and a favourable gap
{
  const r = byCode.get("FRC-SGA")!; // LOWER_BETTER / INVERSE
  const under = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
    .map((k) => cell(r, k))
    .find((c) => c.actual !== null && c.target !== null && c.actual < c.target)!;
  pass("SG&A under budget achieves above 100% with a favourable gap",
    under.achievement! > 1 && under.gapSense === "FAVOURABLE" && under.gap! < 0,
    `actual ${under.actual} vs target ${under.target}: ${formatAchievement(under.achievement)}, gap ${under.gap}, ${under.gapSense}`);
}

// 5. A zero target produces an em dash, not Infinity
{
  const r = byCode.get("BMD-INC")!;
  const v = model.versions.find((x) => x.code === "2QFC")!;
  const act = model.versions.find((x) => x.isActual)!;
  await prisma.$transaction([
    prisma.entry.deleteMany({ where: { controlItemId: r.id, period: new Date(Date.UTC(2026, 9, 1)) } }),
  ]);
  const user = await adminUser();
  await saveEntry(user, { controlItemId: r.id, period: "2026-10", planVersionId: v.id, input: "0" });
  await saveEntry(user, { controlItemId: r.id, period: "2026-10", planVersionId: act.id, input: "5" });

  const after = await loadSheet({ levels: [1, 2, 3] });
  const row = (after.rows.filter((x) => x.kind === "CONTROL_ITEM") as ControlItemRow[]).find((x) => x.code === "BMD-INC")!;
  const oct = row.cells.find((c) => c.key === "2026-10")!;
  pass("A zero target produces an em dash, not Infinity and not an error",
    oct.achievement === null && oct.symbol === null && formatAchievement(oct.achievement) === EM_DASH && Number.isFinite(oct.gap!),
    `target ${oct.target}, actual ${oct.actual}, achievement ${formatAchievement(oct.achievement)}`);
}

// 6. Boundaries belong to the upper band, on live data
{
  const r = byCode.get("BMD-MIG")!;
  const v = model.versions.find((x) => x.code === "3QFC")!;
  const act = model.versions.find((x) => x.isActual)!;
  const user = await adminUser();
  for (const [period, target, actual] of [["2026-11", 1000, 1050], ["2026-12", 1000, 950]] as const) {
    await saveEntry(user, { controlItemId: r.id, period, planVersionId: v.id, input: String(target) });
    await saveEntry(user, { controlItemId: r.id, period, planVersionId: act.id, input: String(actual) });
  }
  const after = await loadSheet({ levels: [1, 2, 3] });
  const row = (after.rows.filter((x) => x.kind === "CONTROL_ITEM") as ControlItemRow[]).find((x) => x.code === "BMD-MIG")!;
  const nov = row.cells.find((c) => c.key === "2026-11")!;
  const dec = row.cells.find((c) => c.key === "2026-12")!;
  pass("Exactly 105.0% evaluates as ◎", nov.symbol === "◎", `${formatAchievement(nov.achievement)} -> ${nov.symbol}`);
  pass("Exactly 95.0% evaluates as 〇", dec.symbol === "〇", `${formatAchievement(dec.achievement)} -> ${dec.symbol}`);
}

// 7. Locking 2QFC: no role may edit it; its values still render
{
  const ki = await prisma.ki.findFirstOrThrow({ where: { isCurrent: true } });
  const v2 = await prisma.planVersion.findFirstOrThrow({ where: { kiId: ki.id, code: "2QFC" } });
  await prisma.planVersion.update({ where: { id: v2.id }, data: { lockedAt: new Date() } });

  const users = await prisma.appUser.findMany({ where: { role: { in: ["SUPER_ADMIN", "OWNER", "VIEWER"] } } });
  const item = byCode.get("AUTO-VOL")!;
  const refusals: string[] = [];
  for (const u of users) {
    try {
      await saveEntry(
        { id: u.id, name: u.name, email: u.email, role: u.role, orgUnitId: u.orgUnitId, orgUnitCode: null },
        { controlItemId: item.id, period: "2026-10", planVersionId: v2.id, input: "1" },
      );
      refusals.push(`${u.role} WAS ALLOWED`);
    } catch (error) {
      refusals.push(error instanceof VersionLockedError ? `${u.role} locked` : `${u.role} ${(error as Error).name}`);
    }
  }
  pass("A locked 2QFC refuses every role", !refusals.some((r) => r.includes("ALLOWED")), refusals.join(", "));

  const pinned = await loadSheet({ levels: [1, 2, 3], targetVersionId: v2.id });
  const row = (pinned.rows.filter((x) => x.kind === "CONTROL_ITEM") as ControlItemRow[]).find((x) => x.code === "AUTO-VOL")!;
  const octTarget = row.cells.find((c) => c.key === "2026-10")!.target;
  pass("A locked version still renders its values in compare mode",
    octTarget !== null, `2QFC Oct target = ${octTarget}`);

  await prisma.planVersion.update({ where: { id: v2.id }, data: { lockedAt: null } });
}


}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
