/**
 * The five evaluation symbols carry the entire colour budget of the sheet.
 *
 * Two things matter for correctness here:
 *
 * 1. The glyphs are CJK-adjacent - 〇 is U+3007 IDEOGRAPHIC NUMBER ZERO, which
 *    a Latin-only face will not have. The `symbol` class carries a font stack
 *    with Japanese-capable faces ahead of the fallbacks.
 * 2. □ ◎ ▲ ■ all have emoji presentation forms on some platforms. Every symbol
 *    is emitted with a trailing U+FE0E VARIATION SELECTOR-15, which requests
 *    text presentation, so no platform substitutes an emoji.
 *
 * Meaning is never carried by colour alone: the glyph is distinct on its own
 * and the band label is the accessible name.
 */

const TEXT_PRESENTATION = "︎";

export function EvaluationSymbol({
  symbol,
  label,
  color,
  size,
  className,
}: {
  symbol: string | null;
  label?: string | null;
  color?: string | null;
  /** Omit to let the stylesheet decide - which is how the print sheet sizes them. */
  size?: number;
  className?: string;
}) {
  if (!symbol) return null;
  return (
    <span
      className={`symbol ${className ?? ""}`}
      style={{ color: color ?? "var(--color-ink)", ...(size ? { fontSize: size } : {}) }}
      role="img"
      aria-label={label ?? symbol}
      title={label ?? undefined}
    >
      {symbol}
      {TEXT_PRESENTATION}
    </span>
  );
}
