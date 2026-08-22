import { describe, expect, it } from "vitest";
import { parseFormula, referencesOf } from "./parse";
import { tokenise } from "./tokenise";
import { evaluate, resolveRefs, type CellContext, type CellResolver, type ResolvedRef } from "./evaluate";
import { findCycle, topologicalOrder } from "./graph";
import { FormulaError } from "./errors";

const CONTEXT: CellContext = {
  controlItemCode: "AUTO-REV",
  period: "2026-07",
  versionCode: "2QFC",
};

/** An in-memory sheet, addressed exactly as the database resolver is. */
function sheet(cells: Record<string, number | null>, known?: { items?: string[]; versions?: string[] }): CellResolver {
  const items = new Set(known?.items ?? [...new Set(Object.keys(cells).map((key) => key.split("|")[0]))]);
  const versions = new Set(known?.versions ?? [...new Set(Object.keys(cells).map((key) => key.split("|")[2]))]);
  items.add("AUTO-REV");
  versions.add("2QFC");
  return {
    read(ref: ResolvedRef) {
      if (!items.has(ref.controlItemCode)) {
        throw new FormulaError("REF", `No Control Item with code "${ref.controlItemCode}" in this Ki.`);
      }
      if (!versions.has(ref.versionCode)) {
        throw new FormulaError("REF", `No plan version "${ref.versionCode}" in this Ki.`);
      }
      const key = `${ref.controlItemCode}|${ref.period}|${ref.versionCode}`;
      return key in cells ? cells[key] : null;
    },
  };
}

function run(source: string, cells: Record<string, number | null> = {}, context = CONTEXT) {
  return evaluate(parseFormula(source), context, sheet(cells));
}

describe("tokeniser", () => {
  it("insists on a leading equals sign", () => {
    expect(() => tokenise("1 + 1")).toThrow(/must begin with/);
  });

  it("reads a full three-part reference", () => {
    const tokens = tokenise("=[CI:REV-AUTO][2026-04][PRB]");
    expect(tokens[0].ref).toEqual({
      controlItemCode: "REV-AUTO",
      periodFrom: "2026-04",
      periodTo: "2026-04",
      versionCode: "PRB",
    });
  });

  it("defaults the version when it is omitted", () => {
    expect(tokenise("=[CI:REV-AUTO][2026-04]")[0].ref!.versionCode).toBeNull();
  });

  it("reads a range shorthand", () => {
    const ref = tokenise("=[CI:REV-AUTO][2026-04:2026-06]")[0].ref!;
    expect(ref.periodFrom).toBe("2026-04");
    expect(ref.periodTo).toBe("2026-06");
  });

  it("treats a bare period as the containing Control Item", () => {
    expect(tokenise("=[2026-04]")[0].ref!.controlItemCode).toBe("");
  });

  it("separates two references written with a space between them", () => {
    const tokens = tokenise("=[2026-04] + [2026-05]");
    expect(tokens.map((token) => token.type)).toEqual(["REF", "PLUS", "REF", "EOF"]);
  });

  it("rejects an unclosed reference", () => {
    expect(() => tokenise("=[CI:REV-AUTO][2026-04")).toThrow(/closing bracket/);
  });

  it("rejects a malformed period", () => {
    expect(() => tokenise("=[CI:REV][April]")).toThrow(/must name a period|not a period/);
  });

  it("rejects a stray character", () => {
    expect(() => tokenise("=1 & 2")).toThrow(/Unexpected character/);
  });
});

describe("parser", () => {
  it("applies multiplication before addition", () => {
    expect(run("=2 + 3 * 4")).toBe(14);
  });

  it("applies division before subtraction", () => {
    expect(run("=20 - 10 / 2")).toBe(15);
  });

  it("respects parentheses", () => {
    expect(run("=(2 + 3) * 4")).toBe(20);
  });

  it("nests parentheses to depth", () => {
    expect(run("=((1 + 2) * (3 + (4 - 1))) / 2")).toBe(9);
  });

  it("handles unary minus, including doubled", () => {
    expect(run("=-5 + 3")).toBe(-2);
    expect(run("=--5")).toBe(5);
    expect(run("=10 * -2")).toBe(-20);
  });

  it("is left-associative for subtraction and division", () => {
    expect(run("=10 - 3 - 2")).toBe(5);
    expect(run("=100 / 5 / 2")).toBe(10);
  });

  it("parses decimals", () => {
    expect(run("=0.5 * 8")).toBe(4);
  });

  it("rejects an unknown function", () => {
    expect(() => parseFormula("=MEDIAN(1,2)")).toThrow(/Unknown function "MEDIAN"/);
  });

  it("rejects an unbalanced parenthesis", () => {
    expect(() => parseFormula("=(1 + 2")).toThrow(/Expected "\)"/);
  });

  it("rejects trailing rubbish", () => {
    expect(() => parseFormula("=1 + 2 3")).toThrow(/Expected the end of the formula/);
  });

  it("rejects an empty argument list", () => {
    expect(() => parseFormula("=SUM()")).toThrow(/at least one argument/);
  });

  it("collects every reference in the tree", () => {
    const ast = parseFormula("=SUM([CI:A][2026-04], [CI:B][2026-05]) * [CI:C][2026-06]");
    expect(referencesOf(ast)).toHaveLength(3);
  });
});

describe("functions", () => {
  const cells = {
    "AUTO-VOL|2026-04|2QFC": 10,
    "AUTO-VOL|2026-05|2QFC": 20,
    "AUTO-VOL|2026-06|2QFC": 30,
  };

  it("SUM over a range", () => {
    expect(run("=SUM([CI:AUTO-VOL][2026-04:2026-06])", cells)).toBe(60);
  });

  it("AVG over a range", () => {
    expect(run("=AVG([CI:AUTO-VOL][2026-04:2026-06])", cells)).toBe(20);
  });

  it("MIN and MAX over a range", () => {
    expect(run("=MIN([CI:AUTO-VOL][2026-04:2026-06])", cells)).toBe(10);
    expect(run("=MAX([CI:AUTO-VOL][2026-04:2026-06])", cells)).toBe(30);
  });

  it("mixes scalars and ranges in one call", () => {
    expect(run("=SUM([CI:AUTO-VOL][2026-04:2026-06], 40)", cells)).toBe(100);
  });

  it("skips months with no value rather than treating them as zero", () => {
    const sparse = { "AUTO-VOL|2026-04|2QFC": 10, "AUTO-VOL|2026-06|2QFC": 30 };
    expect(run("=AVG([CI:AUTO-VOL][2026-04:2026-06])", sparse, CONTEXT)).toBe(20);
  });

  it("returns null when a range holds no values at all", () => {
    expect(run("=SUM([CI:AUTO-VOL][2026-04:2026-06])", { "AUTO-VOL|2026-04|2QFC": null })).toBeNull();
  });

  it("nests functions", () => {
    expect(run("=MAX(SUM(1, 2), AVG(10, 20))", {})).toBe(15);
  });
});

describe("references", () => {
  it("reads a cell on another Control Item and version", () => {
    expect(run("=[CI:AUTO-VOL][2026-04][PRB] * 0.85", { "AUTO-VOL|2026-04|PRB": 100 })).toBe(85);
  });

  it("defaults the version to the containing cell's version", () => {
    const refs = resolveRefs(
      { controlItemCode: "AUTO-VOL", periodFrom: "2026-04", periodTo: "2026-04", versionCode: null },
      CONTEXT,
    );
    expect(refs).toEqual([{ controlItemCode: "AUTO-VOL", period: "2026-04", versionCode: "2QFC" }]);
  });

  it("defaults the Control Item to the containing cell's item", () => {
    const refs = resolveRefs(
      { controlItemCode: "", periodFrom: "2026-05", periodTo: "2026-05", versionCode: null },
      CONTEXT,
    );
    expect(refs[0].controlItemCode).toBe("AUTO-REV");
  });

  it("expands a range across a fiscal year boundary", () => {
    const refs = resolveRefs(
      { controlItemCode: "X", periodFrom: "2026-12", periodTo: "2027-02", versionCode: "PRB" },
      CONTEXT,
    );
    expect(refs.map((ref) => ref.period)).toEqual(["2026-12", "2027-01", "2027-02"]);
  });

  it("reports a reference to a Control Item that does not exist", () => {
    expect(() => run("=[CI:NOPE][2026-04]", { "AUTO-VOL|2026-04|2QFC": 1 })).toThrow(
      /No Control Item with code "NOPE"/,
    );
  });

  it("reports a reference to a version that does not exist", () => {
    expect(() => run("=[CI:AUTO-VOL][2026-04][9QFC]", { "AUTO-VOL|2026-04|2QFC": 1 })).toThrow(
      /No plan version "9QFC"/,
    );
  });

  it("reads a cell with no value as null, not zero", () => {
    expect(run("=[CI:AUTO-VOL][2026-09]", { "AUTO-VOL|2026-04|2QFC": 1 })).toBeNull();
  });

  it("propagates null through arithmetic instead of substituting zero", () => {
    expect(run("=[CI:AUTO-VOL][2026-09] + 100", { "AUTO-VOL|2026-04|2QFC": 1 })).toBeNull();
  });

  it("rejects a range used in plain arithmetic", () => {
    expect(() => run("=[CI:AUTO-VOL][2026-04:2026-06] * 2", { "AUTO-VOL|2026-04|2QFC": 1 })).toThrow(
      /only be used inside SUM/,
    );
  });

  it("rejects a backwards range", () => {
    expect(() => run("=SUM([CI:AUTO-VOL][2026-06:2026-04])", { "AUTO-VOL|2026-04|2QFC": 1 })).toThrow(
      /runs backwards/,
    );
  });

  it("surfaces a broken upstream cell rather than reading through it", () => {
    const resolver: CellResolver = {
      read() {
        throw new FormulaError("REF", "[CI:X][2026-04][PRB] is itself in error: divides by zero");
      },
    };
    expect(() => evaluate(parseFormula("=[CI:X][2026-04][PRB] + 1"), CONTEXT, resolver)).toThrow(
      /itself in error/,
    );
  });
});

describe("division by zero", () => {
  it("is a typed error, never Infinity", () => {
    try {
      run("=10 / 0");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(FormulaError);
      expect((error as FormulaError).code).toBe("DIV0");
    }
  });

  it("is raised when the divisor comes from a cell holding zero", () => {
    expect(() => run("=100 / [CI:AUTO-VOL][2026-04]", { "AUTO-VOL|2026-04|2QFC": 0 })).toThrow(
      /divides by zero/,
    );
  });

  it("is not raised when the divisor is merely empty - that is null", () => {
    expect(run("=100 / [CI:AUTO-VOL][2026-04]", { "AUTO-VOL|2026-05|2QFC": 5 })).toBeNull();
  });
});

describe("dependency graph", () => {
  function graph(edges: Record<string, string[]>) {
    return (id: string) => edges[id] ?? [];
  }

  it("finds no cycle in a chain", () => {
    expect(findCycle("a", graph({ a: ["b"], b: ["c"], c: [] }))).toBeNull();
  });

  it("finds a direct self reference", () => {
    expect(findCycle("a", graph({ a: ["a"] }))).toEqual(["a", "a"]);
  });

  it("finds a two-cell cycle and names both cells", () => {
    const cycle = findCycle("a", graph({ a: ["b"], b: ["a"] }));
    expect(cycle).toEqual(["a", "b", "a"]);
  });

  it("finds a longer cycle", () => {
    const cycle = findCycle("a", graph({ a: ["b"], b: ["c"], c: ["a"] }));
    expect(cycle).toEqual(["a", "b", "c", "a"]);
  });

  it("does not report a diamond as a cycle", () => {
    expect(findCycle("a", graph({ a: ["b", "c"], b: ["d"], c: ["d"], d: [] }))).toBeNull();
  });

  it("orders a recompute chain so dependencies come first", () => {
    // a <- b <- c : changing a must recompute b then c.
    const dependents = graph({ a: ["b"], b: ["c"], c: [] });
    expect(topologicalOrder(["a"], dependents)).toEqual(["b", "c"]);
  });

  it("orders a diamond so the join comes last", () => {
    const dependents = graph({ a: ["b", "c"], b: ["d"], c: ["d"], d: [] });
    const order = topologicalOrder(["a"], dependents);
    expect(order.indexOf("d")).toBeGreaterThan(order.indexOf("b"));
    expect(order.indexOf("d")).toBeGreaterThan(order.indexOf("c"));
  });

  it("recomputes a deep chain in one pass", () => {
    const edges: Record<string, string[]> = {};
    for (let i = 0; i < 50; i++) edges[`n${i}`] = [`n${i + 1}`];
    const order = topologicalOrder(["n0"], graph(edges));
    expect(order).toHaveLength(50);
    expect(order[0]).toBe("n1");
    expect(order[49]).toBe("n50");
  });

  it("returns nothing when a cell has no dependents", () => {
    expect(topologicalOrder(["a"], graph({}))).toEqual([]);
  });
});

describe("no dynamic code execution", () => {
  it("treats a JavaScript payload as a syntax error, not as code", () => {
    const payloads = [
      "=constructor.constructor('return 1')()",
      "=process.exit(1)",
      "=globalThis",
      "=1;console.log(2)",
      "=`${1}`",
    ];
    for (const payload of payloads) {
      expect(() => parseFormula(payload)).toThrow(FormulaError);
    }
  });
});
