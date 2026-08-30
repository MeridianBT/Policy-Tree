/**
 * Bold and italic inside a statement or a measure name.
 *
 * `**bold**` and `_italic_`, and nothing else. Not colour: DESIGN.md gives the
 * five evaluation symbols the entire colour budget, and that reservation is
 * exactly what lets them be found at a glance across a full page. Coloured
 * words would compete with them for the reader's eye, while weight and slope
 * carry emphasis on a projector and on paper without spending anything.
 *
 * Not a markdown parser either. Statements are one line of prose written by a
 * director in a text box; links, headings, lists and code spans have no
 * meaning here, and every construct this understood would be a construct
 * somebody could type by accident.
 *
 * Two rules keep ordinary text safe. An unmatched marker stays a literal
 * character, so "profit **before tax" reads as typed rather than swallowing
 * the rest of the line. And `_` only delimits at a word boundary, so
 * AUTO_ND, snake_case and file_name_here are never italicised - underscores
 * appear inside codes in this product far more often than around emphasis.
 *
 * Pure and free of React on purpose: the sheet, the cascade, the print view
 * and the Excel export all need the same answer, and the rule is testable
 * without any of them.
 */

export interface TextRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

const BOLD = "**";

/** Whitespace, or one of the marks a word can sit against. */
function isBoundary(char: string | undefined): boolean {
  return char === undefined || /[\s(["'\-–—/]/.test(char);
}

function isSpace(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

/**
 * The closing `**` for an opener, or -1.
 *
 * The closer may not be preceded by a space - "** not bold **" is two literal
 * pairs of asterisks in a sentence, not emphasis - and may not sit hard
 * against the opener, so a stray "****" survives as itself.
 */
function findBoldClose(text: string, from: number): number {
  for (let i = from; i <= text.length - BOLD.length; i++) {
    if (text.slice(i, i + BOLD.length) !== BOLD) continue;
    if (i === from) continue;
    if (isSpace(text[i - 1])) continue;
    return i;
  }
  return -1;
}

/** True when the `_` at `index` can open emphasis. */
function opensItalic(text: string, index: number): boolean {
  return isBoundary(text[index - 1]) && !isSpace(text[index + 1]);
}

/**
 * The closing `_`, or -1. It must end a word: preceded by a non-space and
 * followed by the end of the text or a boundary. That is what keeps
 * `snake_case` and `AUTO_ND` out of italics.
 */
function findItalicClose(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] !== "_") continue;
    if (i === from) continue;
    if (isSpace(text[i - 1])) continue;
    if (!isBoundary(text[i + 1]) && text[i + 1] !== undefined) continue;
    return i;
  }
  return -1;
}

function parseInto(text: string, bold: boolean, italic: boolean, out: TextRun[]): void {
  let buffer = "";

  const flush = () => {
    if (!buffer) return;
    const previous = out[out.length - 1];
    // Merge with the run before it when nothing changed, so a marker that
    // turned out to be literal does not split a word into two runs.
    if (previous && previous.bold === bold && previous.italic === italic) {
      previous.text += buffer;
    } else {
      out.push({ text: buffer, bold, italic });
    }
    buffer = "";
  };

  let i = 0;
  while (i < text.length) {
    if (!bold && text.slice(i, i + BOLD.length) === BOLD) {
      const close = findBoldClose(text, i + BOLD.length);
      if (close !== -1) {
        flush();
        parseInto(text.slice(i + BOLD.length, close), true, italic, out);
        i = close + BOLD.length;
        continue;
      }
    }
    if (!italic && text[i] === "_" && opensItalic(text, i)) {
      const close = findItalicClose(text, i + 1);
      if (close !== -1) {
        flush();
        parseInto(text.slice(i + 1, close), bold, true, out);
        i = close + 1;
        continue;
      }
    }
    buffer += text[i];
    i++;
  }
  flush();
}

export function parseEmphasis(text: string): TextRun[] {
  const runs: TextRun[] = [];
  parseInto(text, false, false, runs);
  return runs;
}

/**
 * The text with its markers removed.
 *
 * For every place that needs a string rather than markup - a tooltip, an aria
 * label, a document title, a filename - so that emphasis never leaks into a
 * label as literal asterisks.
 */
export function plainText(text: string): string {
  return parseEmphasis(text)
    .map((run) => run.text)
    .join("");
}

/** True when the text carries emphasis worth rendering as runs. */
export function hasEmphasis(text: string): boolean {
  const runs = parseEmphasis(text);
  return runs.some((run) => run.bold || run.italic);
}
