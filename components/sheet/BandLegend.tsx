/**
 * The evaluation scale, stated in words beside its glyphs.
 *
 * Lifted out of SheetGrid unchanged when the landscape view needed it too.
 * One definition rather than two, for the reason the sheet gives everywhere
 * else: the bands come from `evaluation_band` in the database and an admin can
 * retune them, so a second copy of the range arithmetic would be a second
 * thing to keep in step with the scale people actually set.
 *
 * It matters more on a slide than on the sheet. A reader at the sheet has
 * learned the five symbols; a director seeing a wall chart in a board pack has
 * not, and a page of glyphs with nothing explaining them is decoration.
 */

import { EvaluationSymbol } from "./EvaluationSymbol";
import type { SheetModel } from "@/lib/sheet/types";

export function BandLegend({ model, size = 13 }: { model: SheetModel; size?: number }) {
  return (
    <div className="flex items-center gap-3">
      {model.bands.map((band) => (
        <span key={band.symbol} className="flex items-center gap-1">
          <EvaluationSymbol symbol={band.symbol} label={band.label} color={band.colorHex} size={size} />
          <span className="text-[10px] text-ink-faint">{bandRange(band)}</span>
        </span>
      ))}
    </div>
  );
}

function bandRange(band: SheetModel["bands"][number]): string {
  if (band.minPct === null) return `< ${pct(band.maxPct!)}`;
  if (band.maxPct === null) return `≥ ${pct(band.minPct)}`;
  return `${pct(band.minPct)}–${pct(band.maxPct)}`;
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
