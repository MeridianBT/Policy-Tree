/**
 * Automated check that the five evaluation symbols really render.
 *
 * A missing glyph is not an error a browser reports - it silently draws a
 * box - so this measures each symbol's rendered width and compares it against
 * a private-use codepoint that no font can have. If a symbol measures the same
 * as the control, the font stack is not covering it on this platform.
 *
 *   node scripts/check-symbols.cjs [baseUrl] [email] [password]
 *
 * Exits non-zero if any symbol fails, so it can gate a deployment.
 */

const { chromium } = require("playwright");

const SYMBOLS = [
  { glyph: "□", name: "WHITE SQUARE" },
  { glyph: "◎", name: "BULLSEYE" },
  { glyph: "〇", name: "IDEOGRAPHIC NUMBER ZERO" },
  { glyph: "▲", name: "BLACK UP-POINTING TRIANGLE" },
  { glyph: "■", name: "BLACK SQUARE" },
];

const FONT_STACK =
  '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Yu Gothic UI", "Noto Sans CJK JP", ' +
  '"Noto Sans JP", "Meiryo", "MS Gothic", "IPAGothic", "TakaoGothic", "VL Gothic", ' +
  '"Segoe UI Symbol", sans-serif';

(async () => {
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setContent("<body style='margin:0'></body>");

  const results = await page.evaluate(
    ({ symbols, stack }) => {
      /**
       * Draw a glyph and describe what actually landed on the canvas.
       *
       * Width is useless here: these are full-width CJK glyphs, so a missing
       * glyph box measures exactly the same 1em as the real thing. What
       * separates them is the ink - the pattern of pixels drawn - so each
       * glyph is rasterised and compared against a private-use codepoint that
       * no font can cover.
       */
      function raster(text, fontFamily) {
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = "#000";
        ctx.font = `48px ${fontFamily}`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillText(text, size / 2, size / 2);

        const { data } = ctx.getImageData(0, 0, size, size);
        let ink = 0;
        let coloured = 0;
        let signature = 0;
        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
          if (r < 250 || g < 250 || b < 250) {
            ink++;
            // Black text drawn as a colour emoji shows chroma.
            if (Math.max(r, g, b) - Math.min(r, g, b) > 24) coloured++;
            signature = (signature * 31 + (i / 4) + r) >>> 0;
          }
        }
        return { ink, coloured, signature };
      }

      // U+E000 is private use: no font legitimately covers it, so whatever the
      // browser draws for it is the missing-glyph box.
      const control = raster("\uE000", stack);

      return symbols.map((symbol) => {
        const rendered = raster(symbol.glyph + "\uFE0E", stack);
        return {
          ...symbol,
          ink: rendered.ink,
          controlInk: control.ink,
          blank: rendered.ink === 0,
          // Identical ink pattern to the control means the same box was drawn.
          missing: rendered.signature === control.signature && rendered.ink > 0,
          emoji: rendered.coloured > rendered.ink * 0.1,
        };
      });
    },
    { symbols: SYMBOLS, stack: FONT_STACK },
  );

  const version = browser.version();
  console.log(`Browser: Chromium ${version}`);
  console.log(`Platform: ${process.platform}`);
  console.log("");

  let failed = 0;
  for (const result of results) {
    const codepoint = `U+${result.glyph.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
    const problem = result.blank
      ? "nothing drawn"
      : result.missing
        ? "missing-glyph box"
        : result.emoji
          ? "substituted with a colour emoji"
          : null;
    if (problem) failed++;
    console.log(
      `${problem ? "FAIL" : "PASS"}  ${result.glyph}  ${codepoint}  ${result.name.padEnd(32)} ` +
        (problem ?? `${result.ink} px of ink drawn`),
    );
  }

  await browser.close();

  console.log("");
  if (failed) {
    console.error(
      `${failed} symbol(s) are not rendering on this platform. Install a Japanese-capable font ` +
        "(Noto Sans CJK JP, IPAGothic, Yu Gothic or Meiryo) and run this again.",
    );
    process.exit(1);
  }
  console.log("All five evaluation symbols render on this platform.");
})();
