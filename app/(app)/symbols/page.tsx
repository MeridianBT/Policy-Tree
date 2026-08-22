import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Symbol rendering check.
 *
 * The five evaluation symbols are CJK-adjacent and several have emoji
 * presentation forms, so a font substitution on one platform can silently turn
 * the sheet into nonsense. This page renders each symbol through the
 * application's own font stack, then through each candidate face on its own, so
 * that a substitution is visible rather than assumed.
 *
 * Open it on each platform you deploy to. `npm run check:symbols` performs the
 * same check automatically on whatever browser is available locally.
 */
export default async function SymbolsPage() {
  await requireSession();
  const bands = await prisma.evaluationBand.findMany({ orderBy: { sortOrder: "asc" } });

  const faces = [
    "Hiragino Kaku Gothic ProN",
    "Yu Gothic",
    "Noto Sans CJK JP",
    "Meiryo",
    "MS Gothic",
    "IPAGothic",
    "Segoe UI Symbol",
    "sans-serif",
  ];

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <h1 className="text-[15px] font-semibold">Evaluation symbol rendering</h1>
      <p className="mt-1 max-w-3xl text-[12px] text-ink-muted">
        Every glyph below is emitted with a trailing U+FE0E variation selector, which requests text
        presentation. If any cell shows a coloured emoji, a box, or a blank, that platform is
        substituting a face and needs a Japanese-capable font installed.
      </p>

      <table className="mt-4 border-collapse text-[12px]">
        <thead>
          <tr className="bg-paper-band-strong">
            <th className="border border-rule px-2 py-1 text-left font-medium">Band</th>
            <th className="border border-rule px-2 py-1 text-left font-medium">Codepoint</th>
            <th className="border border-rule px-3 py-1 font-medium">App stack</th>
            {faces.map((face) => (
              <th key={face} className="border border-rule px-2 py-1 text-[10px] font-medium">
                {face}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bands.map((band) => (
            <tr key={band.symbol}>
              <td className="border border-rule px-2 py-1">{band.label}</td>
              <td className="num border border-rule px-2 py-1 text-[11px]">
                U+{band.symbol.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}
              </td>
              <td
                className="symbol border border-rule px-3 py-2 text-center"
                style={{ fontSize: 28, color: band.colorHex }}
                data-symbol-cell={band.symbol}
              >
                {band.symbol}&#xFE0E;
              </td>
              {faces.map((face) => (
                <td
                  key={face}
                  className="border border-rule px-2 py-2 text-center"
                  style={{ fontFamily: `"${face}"`, fontSize: 22 }}
                >
                  {band.symbol}&#xFE0E;
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td className="border border-rule px-2 py-1 text-ink-faint" colSpan={2}>
              Control: a codepoint no font has
            </td>
            <td
              className="symbol border border-rule px-3 py-2 text-center text-ink-faint"
              style={{ fontSize: 28 }}
              data-symbol-cell="control"
            >
              &#xE000;
            </td>
            <td className="border border-rule px-2 py-1 text-[11px] text-ink-faint" colSpan={faces.length}>
              This one is expected to show as a missing-glyph box. Compare it with the row above —
              if a real symbol matches this width, that symbol is not rendering.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
