/**
 * Evaluation symbols.
 *
 * A band covers [minPct, maxPct): the lower bound is inclusive and the upper
 * bound is exclusive, which is what "boundaries belong to the upper band"
 * means - an achievement of exactly 105.0% evaluates as the band starting at
 * 105%, not the one ending there.
 */

import type { EvaluationBandSpec } from "./types";

export const DEFAULT_BANDS: EvaluationBandSpec[] = [
  { symbol: "□", label: "Far above target", minPct: 1.2, maxPct: null, colorHex: "#1D6FB8", sortOrder: 1 },
  { symbol: "◎", label: "Above target", minPct: 1.05, maxPct: 1.2, colorHex: "#2F8F5B", sortOrder: 2 },
  { symbol: "〇", label: "On target", minPct: 0.95, maxPct: 1.05, colorHex: "#6B7280", sortOrder: 3 },
  { symbol: "▲", label: "Below target", minPct: 0.85, maxPct: 0.95, colorHex: "#C2751B", sortOrder: 4 },
  { symbol: "■", label: "Far below target", minPct: null, maxPct: 0.85, colorHex: "#B3261E", sortOrder: 5 },
];

export class BandConfigurationError extends Error {
  constructor(message: string) {
    super(`Evaluation bands are misconfigured: ${message}`);
    this.name = "BandConfigurationError";
  }
}

/**
 * Assert that the configured bands are contiguous and cover the whole number
 * line. Called on startup; the application refuses to serve with a broken
 * scale rather than silently mis-evaluating a Control Item.
 */
export function validateBands(bands: readonly EvaluationBandSpec[]): void {
  if (bands.length === 0) throw new BandConfigurationError("no bands are configured");

  const ascending = [...bands].sort((a, b) => {
    if (a.minPct === null) return -1;
    if (b.minPct === null) return 1;
    return a.minPct - b.minPct;
  });

  const symbols = new Set<string>();
  for (const band of ascending) {
    if (symbols.has(band.symbol)) {
      throw new BandConfigurationError(`symbol ${band.symbol} is used more than once`);
    }
    symbols.add(band.symbol);
    if (band.minPct !== null && band.maxPct !== null && band.minPct >= band.maxPct) {
      throw new BandConfigurationError(
        `band ${band.symbol} has min ${band.minPct} which is not below max ${band.maxPct}`,
      );
    }
  }

  const lowest = ascending[0];
  const highest = ascending[ascending.length - 1];
  if (lowest.minPct !== null) {
    throw new BandConfigurationError(
      `nothing covers achievement below ${fmtPct(lowest.minPct)} - the lowest band needs an unbounded minimum`,
    );
  }
  if (highest.maxPct !== null) {
    throw new BandConfigurationError(
      `nothing covers achievement at or above ${fmtPct(highest.maxPct)} - the highest band needs an unbounded maximum`,
    );
  }

  for (let i = 0; i < ascending.length - 1; i++) {
    const lower = ascending[i];
    const upper = ascending[i + 1];
    if (lower.maxPct === null) {
      throw new BandConfigurationError(`band ${lower.symbol} is unbounded above but is not the highest band`);
    }
    if (upper.minPct === null) {
      throw new BandConfigurationError(`band ${upper.symbol} is unbounded below but is not the lowest band`);
    }
    if (lower.maxPct !== upper.minPct) {
      const gapOrOverlap = lower.maxPct < upper.minPct ? "a gap" : "an overlap";
      throw new BandConfigurationError(
        `${gapOrOverlap} between ${lower.symbol} (up to ${fmtPct(lower.maxPct)}) and ` +
          `${upper.symbol} (from ${fmtPct(upper.minPct)})`,
      );
    }
  }
}

/**
 * The band an achievement ratio falls in. `null` achievement (no target, no
 * actual, or a guarded division) has no symbol at all - it is not "far below".
 */
export function bandFor(
  achievement: number | null,
  bands: readonly EvaluationBandSpec[],
): EvaluationBandSpec | null {
  if (achievement === null || !Number.isFinite(achievement)) return null;
  for (const band of bands) {
    const aboveMin = band.minPct === null || achievement >= band.minPct;
    const belowMax = band.maxPct === null || achievement < band.maxPct;
    if (aboveMin && belowMax) return band;
  }
  return null;
}

function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
