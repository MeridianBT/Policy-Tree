/**
 * A statement or a measure name, with its emphasis rendered.
 *
 * `<strong>` and `<em>` rather than styled spans, because the emphasis is
 * meaning rather than decoration: a screen reader and a printed page should
 * both carry it. Everything about which markers count lives in
 * lib/text/emphasis.ts, so the sheet, the cascade, the print view and the
 * Excel export cannot disagree about what a statement says.
 *
 * Text with no emphasis renders as the string itself - no wrapper element and
 * no extra DOM on a sheet that can hold hundreds of rows.
 */

import { parseEmphasis } from "@/lib/text/emphasis";

export function RichText({ text }: { text: string }) {
  const runs = parseEmphasis(text);
  if (runs.length === 1 && !runs[0].bold && !runs[0].italic) return <>{runs[0].text}</>;

  return (
    <>
      {runs.map((run, index) => {
        const key = `${index}-${run.text}`;
        if (run.bold && run.italic) {
          return (
            <strong key={key}>
              <em>{run.text}</em>
            </strong>
          );
        }
        if (run.bold) return <strong key={key}>{run.text}</strong>;
        if (run.italic) return <em key={key}>{run.text}</em>;
        return <span key={key}>{run.text}</span>;
      })}
    </>
  );
}
