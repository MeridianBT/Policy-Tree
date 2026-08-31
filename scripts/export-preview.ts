/**
 * Exports a fully computed company sheet as JSON.
 *
 *   npx tsx scripts/export-preview.ts out.json
 *
 * The rows come out of loadSheet, so every figure in the file - the roll-ups,
 * the latest-forecast baseline, the achievement percentages and the evaluation
 * symbols - is the application's own output rather than a re-derivation. Field
 * names are shortened because the result is meant to be embedded in a page.
 *
 * Written to feed a static, read-only view of the sheet for people who cannot
 * run the application: a review attendee on a tablet, or a stakeholder without
 * a database. It is a snapshot, not a substitute - nothing in it can be edited
 * and it goes stale the moment an actual is keyed.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/db.ts";
import { loadSheet } from "../lib/sheet/query.ts";
import type { ControlItemRow, GroupRow } from "../lib/sheet/types.ts";

function serialise(model: Awaited<ReturnType<typeof loadSheet>>) {
  return model.rows.map((row) => {
    if (row.kind === "CONTROL_ITEM") {
      const item = row as ControlItemRow;
      return {
        k: "CI",
        id: item.id,
        code: item.code,
        name: item.name,
        measuredAs: item.measuredAs,
        dicId: item.dicOrgUnitId,
        unit: item.unit,
        dp: item.decimalPlaces,
        dir: item.direction,
        agg: item.aggregation,
        dic: item.dicCode,
        lvl: item.level,
        path: item.path,
        kiSym: item.kiSymbol,
        cells: item.cells.map((c) => ({
          k: c.key,
          n: c.kind,
          l: c.label,
          t: c.target,
          a: c.actual,
          ach: c.achievement,
          g: c.gap,
          gs: c.gapSense,
          s: c.symbol,
          sl: c.symbolLabel,
          sc: c.symbolColor,
          tv: c.targetVersionCode,
        })),
      };
    }
    const group = row as GroupRow;
    return {
      k: group.kind,
      id: group.id,
      lvl: group.level,
      statement: group.statement,
      ordinal: group.ordinal ?? null,
      orgUnitId: group.orgUnitId ?? null,
      path: group.path,
    };
  });
}

/**
 * One finished sheet per target basis, so a static view can switch between
 * budget versions the way the application does. Achievement, the gap and the
 * evaluation symbol are recomputed against each basis by the calculation
 * module; the browser only ever picks which finished sheet to show.
 */
const LEVELS = [1, 2, 3, 4];

async function main() {
  // Levels 1-4: the expanded view, with every department branch folded in
  // under the Objective it ladders into.
  const latest = await loadSheet({ levels: LEVELS });

  const bases: Array<{ id: string; label: string; rows: unknown }> = [
    { id: "LATEST", label: "Latest forecast", rows: serialise(latest) },
  ];

  for (const version of latest.versions) {
    if (version.isActual) continue;
    const pinned = await loadSheet({ levels: LEVELS, targetVersionId: version.id });
    bases.push({
      id: version.id,
      label: version.lockedAt ? `${version.code} · locked` : version.code,
      rows: serialise(pinned),
    });
  }

  const out = {
    kiCode: latest.kiCode,
    kiStartYear: latest.kiStartYear,
    bands: latest.bands,
    dics: latest.dics,
    bases,
  };

  const json = JSON.stringify(out);
  writeFileSync(process.argv[2], json);
  console.log(
    `wrote ${process.argv[2]}: ${bases.length} target bases ` +
      `(${bases.map((b) => b.label).join(", ")}), ${(json.length / 1024).toFixed(0)} KB`,
  );
}

main().then(() => prisma.$disconnect());
