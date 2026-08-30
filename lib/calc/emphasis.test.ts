/**
 * Bold and italic in a statement.
 *
 * The cases worth pinning are the ones where a parser costs the reader
 * something: a code with an underscore in it turning italic, a single stray
 * asterisk swallowing the rest of a line, and a marker vanishing from a
 * tooltip while surviving on screen.
 */

import { describe, expect, it } from "vitest";
import { hasEmphasis, parseEmphasis, plainText } from "@/lib/text/emphasis";

const runs = (text: string) =>
  parseEmphasis(text).map((run) => [run.text, run.bold ? "b" : "", run.italic ? "i" : ""].join("|"));

describe("parseEmphasis", () => {
  it("leaves ordinary text as one run", () => {
    expect(parseEmphasis("Grow retail volume in a record market")).toEqual([
      { text: "Grow retail volume in a record market", bold: false, italic: false },
    ]);
  });

  it("reads bold and italic", () => {
    expect(runs("Grow **retail** volume")).toEqual(["Grow ||", "retail|b|", " volume||"]);
    expect(runs("Grow _retail_ volume")).toEqual(["Grow ||", "retail||i", " volume||"]);
  });

  it("nests one inside the other", () => {
    expect(runs("**all _of_ it**")).toEqual(["all |b|", "of|b|i", " it|b|"]);
  });

  it("keeps an unmatched marker as a literal character", () => {
    // "profit **before tax" must read as typed rather than swallowing the
    // rest of the line into bold that never closes.
    expect(runs("profit **before tax")).toEqual(["profit **before tax||"]);
    expect(runs("a _ b")).toEqual(["a _ b||"]);
    expect(plainText("5 * 3 and 2 ** 8")).toBe("5 * 3 and 2 ** 8");
  });

  it("never italicises an underscore inside a word", () => {
    // Department codes look like this all over the product.
    expect(runs("AUTO_ND and OX_PTS")).toEqual(["AUTO_ND and OX_PTS||"]);
    expect(runs("file_name_here")).toEqual(["file_name_here||"]);
  });

  it("refuses a marker with a space against it", () => {
    // "** not bold **" is two pairs of asterisks in a sentence.
    expect(runs("** not bold **")).toEqual(["** not bold **||"]);
    expect(runs("**  **")).toEqual(["**  **||"]);
  });

  it("survives markers with nothing between them", () => {
    expect(plainText("****")).toBe("****");
    expect(plainText("__")).toBe("__");
  });

  it("merges runs that a literal marker split", () => {
    expect(parseEmphasis("2 * 3 * 4")).toHaveLength(1);
  });

  it("handles emphasis at either end", () => {
    expect(runs("**Profit** and growth")).toEqual(["Profit|b|", " and growth||"]);
    expect(runs("Profit and **growth**")).toEqual(["Profit and ||", "growth|b|"]);
  });

  it("is empty for empty text", () => {
    expect(parseEmphasis("")).toEqual([]);
    expect(plainText("")).toBe("");
  });
});

describe("plainText", () => {
  it("strips the markers a label must not show", () => {
    expect(plainText("Grow **retail** volume")).toBe("Grow retail volume");
    expect(plainText("**all _of_ it**")).toBe("all of it");
  });

  it("leaves text that carries no emphasis exactly as it is", () => {
    for (const text of ["AUTO_ND", "2 * 3", "profit **before tax", "plain words"]) {
      expect(plainText(text)).toBe(text);
    }
  });
});

describe("hasEmphasis", () => {
  it("separates text worth rendering as runs from text that is not", () => {
    expect(hasEmphasis("Grow **retail** volume")).toBe(true);
    expect(hasEmphasis("AUTO_ND")).toBe(false);
    expect(hasEmphasis("profit **before tax")).toBe(false);
  });
});
