"use client";

/**
 * One cell of the sheet. It renders a finished `SheetCell` and nothing else -
 * no arithmetic happens here, ever. Every number arrived from lib/calc.
 */

import type { SheetCell } from "@/lib/calc/row";
import { formatAchievement, formatValue } from "@/lib/calc/format";
import { EvaluationSymbol } from "./EvaluationSymbol";

/*
  Three ways to read a cell, not four. A symbol-only mode was offered until a
  UAT pass asked for the width back: the symbol is already drawn beside the
  figure in Full and beside the percentage in Achievement, so its own chip
  bought a fourth way to see something two of the other three already show.
*/
export type DisplayMode = "FULL" | "TARGET_ACTUAL" | "ACHIEVEMENT";

export const DISPLAY_MODES: Array<{ value: DisplayMode; label: string; hint: string }> = [
  { value: "FULL", label: "Full", hint: "Target, actual, achievement and symbol" },
  { value: "TARGET_ACTUAL", label: "Target / Actual", hint: "The two numbers only" },
  { value: "ACHIEVEMENT", label: "Achievement", hint: "Percentage against target, with symbol" },
];

/**
 * One cell. The unit is deliberately not repeated here — it is stated once per
 * row in the Control Item column, and printing "%" in all seventeen columns
 * would cost width the numbers need.
 */
export function SheetCellView({
  cell,
  mode,
  decimalPlaces,
  hideTarget,
  comparison,
}: {
  cell: SheetCell;
  mode: DisplayMode;
  decimalPlaces: number;
  /**
   * Drop the target line, because an editable box is standing in its place
   * directly above. Only FULL and TARGET_ACTUAL show a target at all, so the
   * other two modes ignore this.
   */
  hideTarget?: boolean;
  /**
   * The same cell on another plan version, when one is being compared against.
   *
   * Only the target travels. An actual is keyed against the actual version and
   * is the same figure whichever plan version is being read, so the comparison
   * used to print it twice - and printing a number twice to say it has not
   * changed is the opposite of what a comparison is for.
   */
  comparison?: { target: number | null; versionCode: string } | null;
}) {
  if (cell.error) {
    return (
      <span className="num text-[10px]" style={{ color: "#B3261E" }} title={cell.error}>
        #ERR
      </span>
    );
  }

  const target = formatValue(cell.target, decimalPlaces);
  const actual = formatValue(cell.actual, decimalPlaces);

  /*
   * A comparison is about what moved between two plan versions, so it reads
   * the same way in every display mode: the two targets adjacent, with the
   * actual beneath them, and no achievement or symbol at all.
   *
   * Dropping those is not only decluttering. Achievement is measured against
   * *a* target, so beside two targets it is ambiguous by construction - and it
   * was the line that pushed the block past the row it sits in.
   */
  if (comparison) {
    return (
      <span className="flex flex-col items-end leading-tight">
        {!hideTarget && (
          <span className="num text-[10px] text-ink-muted" title="Target on the version being read">
            {target}
          </span>
        )}
        <span
          className="num flex items-baseline justify-end gap-1 text-[10px] text-ink-faint"
          title={`Target on ${comparison.versionCode}`}
        >
          <span className="text-[8px] uppercase tracking-wide">{comparison.versionCode}</span>
          {formatValue(comparison.target, decimalPlaces)}
        </span>
        <span className="num" title="Actual">
          {actual}
        </span>
      </span>
    );
  }

  switch (mode) {
    case "ACHIEVEMENT":
      return (
        <span className="flex items-baseline justify-end gap-1">
          <span className="num" style={{ color: cell.symbolColor ?? undefined }}>
            {formatAchievement(cell.achievement)}
          </span>
          <EvaluationSymbol
            symbol={cell.symbol}
            label={cell.symbolLabel}
            color={cell.symbolColor}
            size={12}
          />
        </span>
      );

    case "TARGET_ACTUAL":
      return (
        <span className="flex flex-col items-end leading-tight">
          {!hideTarget && <span className="num text-ink-muted text-[10px]">{target}</span>}
          <span className="num">{actual}</span>
        </span>
      );

    case "FULL":
    default:
      return (
        <span className="flex flex-col items-end leading-tight">
          {!hideTarget && (
            <span className="num text-ink-muted text-[10px]" title={`Target${cell.targetVersionCode ? ` (${cell.targetVersionCode})` : ""}`}>
              {target}
            </span>
          )}
          <span className="num">{actual}</span>
          <span className="flex items-baseline justify-end gap-1">
            <span className="num text-[10px]" style={{ color: cell.symbolColor ?? "var(--color-ink-faint)" }}>
              {formatAchievement(cell.achievement)}
            </span>
            <EvaluationSymbol
              symbol={cell.symbol}
              label={cell.symbolLabel}
              color={cell.symbolColor}
              size={12}
            />
          </span>
        </span>
      );
  }
}

/**
 * Row height needed for a display mode, in pixels.
 *
 * A comparison renders three lines whatever the mode - target, the compared
 * target, actual - so it is measured as FULL is. It used to be given twice the
 * mode's own height on the assumption that the compare block was a second copy
 * of the cell; it was, plus a separator, which is exactly why the content
 * spilled over the row's top and bottom edges.
 */
export function rowHeightFor(mode: DisplayMode, entryMode?: boolean, comparing?: boolean): number {
  const effective: DisplayMode = comparing ? "FULL" : mode;
  const base = effective === "FULL" ? 46 : effective === "TARGET_ACTUAL" ? 32 : 26;
  if (!entryMode) return base;
  // The box replaces the target line in the two modes that had one and is
  // added on top in the two that did not, so the extra height differs.
  return base + (effective === "FULL" || effective === "TARGET_ACTUAL" ? 8 : 20);
}
