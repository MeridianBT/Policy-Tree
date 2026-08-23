"use client";

/**
 * One cell of the sheet. It renders a finished `SheetCell` and nothing else -
 * no arithmetic happens here, ever. Every number arrived from lib/calc.
 */

import type { SheetCell } from "@/lib/calc/row";
import { EM_DASH, formatAchievement, formatValue } from "@/lib/calc/format";
import { EvaluationSymbol } from "./EvaluationSymbol";

export type DisplayMode = "FULL" | "TARGET_ACTUAL" | "ACHIEVEMENT" | "SYMBOL";

export const DISPLAY_MODES: Array<{ value: DisplayMode; label: string; hint: string }> = [
  { value: "FULL", label: "Full", hint: "Target, actual, achievement and symbol" },
  { value: "TARGET_ACTUAL", label: "Target / Actual", hint: "The two numbers only" },
  { value: "ACHIEVEMENT", label: "Achievement", hint: "Percentage against target, with symbol" },
  { value: "SYMBOL", label: "Symbol", hint: "Evaluation symbol only" },
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
}: {
  cell: SheetCell;
  mode: DisplayMode;
  decimalPlaces: number;
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

  switch (mode) {
    case "SYMBOL":
      return cell.symbol ? (
        <EvaluationSymbol symbol={cell.symbol} label={cell.symbolLabel} color={cell.symbolColor} size={15} />
      ) : (
        <span className="num text-ink-faint">{EM_DASH}</span>
      );

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
          <span className="num text-ink-muted text-[10px]">{target}</span>
          <span className="num">{actual}</span>
        </span>
      );

    case "FULL":
    default:
      return (
        <span className="flex flex-col items-end leading-tight">
          <span className="num text-ink-muted text-[10px]" title={`Target${cell.targetVersionCode ? ` (${cell.targetVersionCode})` : ""}`}>
            {target}
          </span>
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

/** Row height needed for a display mode, in pixels. */
export function rowHeightFor(mode: DisplayMode): number {
  switch (mode) {
    case "FULL": return 46;
    case "TARGET_ACTUAL": return 32;
    default: return 26;
  }
}
