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

async function main() {
  const model = await loadSheet({ levels: [1, 2, 3] });

  const rows = model.rows.map((row) => {
    if (row.kind === "CONTROL_ITEM") {
      const item = row as ControlItemRow;
      return {
        k: "CI",
        id: item.id,
        code: item.code,
        name: item.name,
        measuredAs: item.measuredAs,
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
      path: group.path,
    };
  });

  const out = {
    kiCode: model.kiCode,
    kiStartYear: model.kiStartYear,
    bands: model.bands,
    dics: model.dics,
    themes: model.themes,
    rows,
  };
  writeFileSync(process.argv[2], JSON.stringify(out));
  console.log(`wrote ${process.argv[2]}: ${rows.length} rows, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
}

main().then(() => prisma.$disconnect());
