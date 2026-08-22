/**
 * Tokeniser for the formula language.
 *
 * The input comes from users, so this is a real tokeniser feeding a real
 * recursive-descent parser. `eval`, `new Function` and every other form of
 * dynamic code execution are forbidden here - there is no path from a formula
 * string to executed JavaScript.
 */

import { FormulaError } from "./errors";

export type TokenType =
  | "NUMBER"
  | "IDENT"
  | "REF"
  | "PLUS"
  | "MINUS"
  | "STAR"
  | "SLASH"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "EOF";

export interface RefToken {
  /** Control Item code, e.g. "REV-AUTO". */
  controlItemCode: string;
  /** Single period, or the inclusive ends of a range. */
  periodFrom: string;
  periodTo: string;
  /** Version code, or null meaning "the same version as the containing cell". */
  versionCode: string | null;
}

export interface Token {
  type: TokenType;
  text: string;
  position: number;
  value?: number;
  ref?: RefToken;
}

const PERIOD = /^\d{4}-\d{2}$/;

export function tokenise(source: string): Token[] {
  let input = source.trim();
  if (!input.startsWith("=")) {
    throw new FormulaError("SYNTAX", 'A formula must begin with "=".');
  }
  input = input.slice(1);

  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (char === "[") {
      const start = i;
      const { ref, next } = readReference(input, i);
      tokens.push({ type: "REF", text: input.slice(start, next), position: start, ref });
      i = next;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      const start = i;
      while (i < input.length && /[0-9]/.test(input[i])) i++;
      if (input[i] === ".") {
        i++;
        while (i < input.length && /[0-9]/.test(input[i])) i++;
      }
      const text = input.slice(start, i);
      const value = Number(text);
      if (!Number.isFinite(value)) {
        throw new FormulaError("SYNTAX", `"${text}" is not a valid number.`);
      }
      tokens.push({ type: "NUMBER", text, position: start, value });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = i;
      while (i < input.length && /[A-Za-z0-9_]/.test(input[i])) i++;
      tokens.push({ type: "IDENT", text: input.slice(start, i), position: start });
      continue;
    }

    const simple: Record<string, TokenType> = {
      "+": "PLUS",
      "-": "MINUS",
      "*": "STAR",
      "/": "SLASH",
      "(": "LPAREN",
      ")": "RPAREN",
      ",": "COMMA",
    };
    const type = simple[char];
    if (!type) {
      throw new FormulaError("SYNTAX", `Unexpected character "${char}" at position ${i + 1}.`);
    }
    tokens.push({ type, text: char, position: i });
    i++;
  }

  tokens.push({ type: "EOF", text: "", position: input.length });
  return tokens;
}

/**
 * A reference is one to three bracketed parts:
 *
 *   [CI:REV-AUTO][2026-04][PRB]      an explicit version
 *   [CI:REV-AUTO][2026-04]           the containing cell's own version
 *   [CI:REV-AUTO][2026-04:2026-06]   a range of months
 *
 * The Control Item part may be omitted to address the containing cell's own
 * Control Item: [2026-04] on its own is a sibling month.
 */
function readReference(input: string, start: number): { ref: RefToken; next: number } {
  const parts: string[] = [];
  let i = start;

  while (input[i] === "[") {
    const close = input.indexOf("]", i);
    if (close === -1) {
      throw new FormulaError("SYNTAX", "A reference is missing its closing bracket.");
    }
    parts.push(input.slice(i + 1, close).trim());
    i = close + 1;
    // Only continue if another bracket follows immediately (no whitespace),
    // so that "[2026-04] + [2026-05]" reads as two references.
    if (input[i] !== "[") break;
  }

  if (parts.length === 0) {
    throw new FormulaError("SYNTAX", "Empty reference.");
  }

  let controlItemCode = "";
  let periodPart: string | null = null;
  let versionCode: string | null = null;

  for (const part of parts) {
    if (/^CI:/i.test(part)) {
      controlItemCode = part.slice(3).trim();
      if (!controlItemCode) throw new FormulaError("SYNTAX", "A [CI:…] reference names no Control Item.");
      continue;
    }
    if (isPeriodPart(part)) {
      if (periodPart !== null) {
        throw new FormulaError("SYNTAX", `Reference has more than one period part: "${part}".`);
      }
      periodPart = part;
      continue;
    }
    if (versionCode !== null) {
      throw new FormulaError("SYNTAX", `Reference has more than one version part: "${part}".`);
    }
    versionCode = part.toUpperCase();
  }

  if (periodPart === null) {
    throw new FormulaError("SYNTAX", "A reference must name a period, e.g. [2026-04].");
  }

  const [from, to] = periodPart.includes(":")
    ? periodPart.split(":").map((piece) => piece.trim())
    : [periodPart, periodPart];

  if (!PERIOD.test(from) || !PERIOD.test(to)) {
    throw new FormulaError("SYNTAX", `"${periodPart}" is not a period. Use YYYY-MM, or YYYY-MM:YYYY-MM.`);
  }

  return { ref: { controlItemCode, periodFrom: from, periodTo: to, versionCode }, next: i };
}

function isPeriodPart(part: string): boolean {
  const pieces = part.split(":");
  return pieces.length <= 2 && pieces.every((piece) => PERIOD.test(piece.trim()));
}
