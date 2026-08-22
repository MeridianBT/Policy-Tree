import { describe, expect, it } from "vitest";
import { kiMonths, quarterMonths, quarterOf, periodRange, monthLabel } from "@/lib/domain/period";
import { rollUp } from "./aggregate";
import { achievement, gap, gapSense } from "./achievement";
import { DEFAULT_BANDS, bandFor, validateBands, BandConfigurationError } from "./bands";
import { resolveLatestForecast, forecastVersionsDescending } from "./baseline";
import { buildRow } from "./row";
import { formatValue, formatAchievement, EM_DASH } from "./format";
import type { ControlItemSpec, PeriodValues, ValuesByVersion, VersionSpec } from "./types";

const v = (value: number | null): { value: number | null } => ({ value });

function values(map: Record<string, number | null>): PeriodValues {
  return Object.fromEntries(Object.entries(map).map(([k, n]) => [k, v(n)]));
}

const VERSIONS: VersionSpec[] = [
  { id: "ob", code: "OB", label: "Original Budget", sequence: 1, isActual: false, lockedAt: null },
  { id: "prb", code: "PRB", label: "Press Release Budget", sequence: 2, isActual: false, lockedAt: null },
  { id: "1qfc", code: "1QFC", label: "1st Quarter Forecast", sequence: 3, isActual: false, lockedAt: null },
  { id: "2qfc", code: "2QFC", label: "2nd Quarter Forecast", sequence: 4, isActual: false, lockedAt: null },
  { id: "3qfc", code: "3QFC", label: "3rd Quarter Forecast", sequence: 5, isActual: false, lockedAt: null },
  { id: "act", code: "ACT", label: "Actual", sequence: 99, isActual: true, lockedAt: null },
];

const REVENUE: ControlItemSpec = {
  id: "rev",
  aggregation: "SUM",
  direction: "HIGHER_BETTER",
  achievementMethod: "RATIO",
  unit: "CURRENCY",
  decimalPlaces: 0,
};

const ENGAGEMENT: ControlItemSpec = {
  id: "eng",
  aggregation: "AVERAGE",
  direction: "HIGHER_BETTER",
  achievementMethod: "RATIO",
  unit: "PERCENT",
  decimalPlaces: 1,
};

const HEADCOUNT: ControlItemSpec = {
  id: "hc",
  aggregation: "LATEST",
  direction: "HIGHER_BETTER",
  achievementMethod: "RATIO",
  unit: "COUNT",
  decimalPlaces: 0,
};

const SGA: ControlItemSpec = {
  id: "sga",
  aggregation: "SUM",
  direction: "LOWER_BETTER",
  achievementMethod: "RATIO",
  unit: "CURRENCY",
  decimalPlaces: 0,
};

describe("fiscal periods", () => {
  it("runs a Ki from April to March of the following calendar year", () => {
    expect(kiMonths(2026)).toEqual([
      "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
      "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
    ]);
  });

  it("maps quarters onto the fiscal calendar", () => {
    expect(quarterMonths(2026, "Q1")).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(quarterMonths(2026, "Q4")).toEqual(["2027-01", "2027-02", "2027-03"]);
    expect(quarterOf("2026-04")).toBe("Q1");
    expect(quarterOf("2026-09")).toBe("Q2");
    expect(quarterOf("2026-12")).toBe("Q3");
    expect(quarterOf("2027-03")).toBe("Q4");
  });

  it("labels months by fiscal position", () => {
    expect(monthLabel("2026-04")).toBe("Apr");
    expect(monthLabel("2027-03")).toBe("Mar");
  });

  it("expands an inclusive period range across a year boundary", () => {
    expect(periodRange("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(periodRange("2026-06", "2026-04")).toEqual([]);
  });
});

describe("roll-up", () => {
  const q1 = quarterMonths(2026, "Q1");

  it("SUM adds the populated months", () => {
    const monthly = values({ "2026-04": 100, "2026-05": 110, "2026-06": 120 });
    expect(rollUp(monthly, q1, "SUM")).toBe(330);
  });

  it("Ki total equals the sum of the four quarters for a SUM item", () => {
    const monthly = values(
      Object.fromEntries(kiMonths(2026).map((period, index) => [period, index + 1])),
    );
    const quarterTotals = (["Q1", "Q2", "Q3", "Q4"] as const).map((quarter) =>
      rollUp(monthly, quarterMonths(2026, quarter), "SUM"),
    );
    const kiTotal = rollUp(monthly, kiMonths(2026), "SUM");
    expect(quarterTotals.reduce((a, b) => (a ?? 0) + (b ?? 0), 0)).toBe(kiTotal);
    expect(kiTotal).toBe(78);
  });

  it("AVERAGE means only the populated months", () => {
    const monthly = values({ "2026-04": 80, "2026-06": 90 });
    expect(rollUp(monthly, q1, "AVERAGE")).toBe(85);
  });

  it("AVERAGE does not treat a missing month as zero", () => {
    const monthly = values({ "2026-04": 90, "2026-05": null, "2026-06": 90 });
    expect(rollUp(monthly, q1, "AVERAGE")).toBe(90);
  });

  it("LATEST takes the most recent populated month, not the last month of the range", () => {
    const monthly = values({ "2026-04": 210, "2026-05": 218, "2026-06": null });
    expect(rollUp(monthly, q1, "LATEST")).toBe(218);
  });

  it("LATEST ignores gaps before the most recent value", () => {
    const monthly = values({ "2026-04": 210, "2026-05": null, "2026-06": 225 });
    expect(rollUp(monthly, q1, "LATEST")).toBe(225);
  });

  it("returns null, not zero, when no month in the range has a value", () => {
    expect(rollUp(values({}), q1, "SUM")).toBeNull();
    expect(rollUp(values({}), q1, "AVERAGE")).toBeNull();
    expect(rollUp(values({}), q1, "LATEST")).toBeNull();
  });

  it("a real zero is a value and is not skipped", () => {
    expect(rollUp(values({ "2026-04": 0, "2026-05": 10 }), q1, "AVERAGE")).toBe(5);
  });
});

describe("achievement", () => {
  it("HIGHER_BETTER with RATIO is actual over target", () => {
    expect(
      achievement({ actual: 110, target: 100, direction: "HIGHER_BETTER", achievementMethod: "RATIO" }),
    ).toBeCloseTo(1.1, 10);
  });

  it("LOWER_BETTER with RATIO is target over actual", () => {
    expect(
      achievement({ actual: 90, target: 100, direction: "LOWER_BETTER", achievementMethod: "RATIO" }),
    ).toBeCloseTo(1.1111, 4);
  });

  it("LOWER_BETTER with INVERSE is a linear penalty", () => {
    expect(
      achievement({ actual: 90, target: 100, direction: "LOWER_BETTER", achievementMethod: "INVERSE" }),
    ).toBeCloseTo(1.1, 10);
    expect(
      achievement({ actual: 110, target: 100, direction: "LOWER_BETTER", achievementMethod: "INVERSE" }),
    ).toBeCloseTo(0.9, 10);
  });

  it("an SG&A item under budget achieves above 100%", () => {
    const result = achievement({
      actual: 950,
      target: 1000,
      direction: "LOWER_BETTER",
      achievementMethod: "RATIO",
    });
    expect(result!).toBeGreaterThan(1);
  });

  it("returns null for a zero target rather than Infinity", () => {
    const result = achievement({
      actual: 50,
      target: 0,
      direction: "HIGHER_BETTER",
      achievementMethod: "RATIO",
    });
    expect(result).toBeNull();
  });

  it("returns null for a zero actual on a LOWER_BETTER ratio", () => {
    expect(
      achievement({ actual: 0, target: 100, direction: "LOWER_BETTER", achievementMethod: "RATIO" }),
    ).toBeNull();
  });

  it("returns null when either side is missing", () => {
    expect(
      achievement({ actual: null, target: 100, direction: "HIGHER_BETTER", achievementMethod: "RATIO" }),
    ).toBeNull();
    expect(
      achievement({ actual: 100, target: null, direction: "HIGHER_BETTER", achievementMethod: "RATIO" }),
    ).toBeNull();
  });

  it("never returns NaN or Infinity", () => {
    const combinations: Array<[number | null, number | null]> = [
      [0, 0], [null, null], [1, 0], [0, 1], [-1, 0],
    ];
    for (const [actual, target] of combinations) {
      for (const direction of ["HIGHER_BETTER", "LOWER_BETTER"] as const) {
        for (const method of ["RATIO", "INVERSE"] as const) {
          const result = achievement({ actual, target, direction, achievementMethod: method });
          expect(result === null || Number.isFinite(result)).toBe(true);
        }
      }
    }
  });
});

describe("gap", () => {
  it("is the raw signed difference", () => {
    expect(gap(950, 1000)).toBe(-50);
    expect(gap(1100, 1000)).toBe(100);
    expect(gap(null, 1000)).toBeNull();
  });

  it("reads an underspend as favourable for a LOWER_BETTER item", () => {
    expect(gapSense(-50, "LOWER_BETTER")).toBe("FAVOURABLE");
    expect(gapSense(-50, "HIGHER_BETTER")).toBe("UNFAVOURABLE");
    expect(gapSense(50, "HIGHER_BETTER")).toBe("FAVOURABLE");
    expect(gapSense(0, "HIGHER_BETTER")).toBe("NEUTRAL");
    expect(gapSense(null, "HIGHER_BETTER")).toBe("NEUTRAL");
  });
});

describe("evaluation bands", () => {
  it("accepts the seeded contiguous scale", () => {
    expect(() => validateBands(DEFAULT_BANDS)).not.toThrow();
  });

  it("puts a boundary in the upper band", () => {
    expect(bandFor(1.05, DEFAULT_BANDS)?.symbol).toBe("◎");
    expect(bandFor(0.95, DEFAULT_BANDS)?.symbol).toBe("〇");
    expect(bandFor(1.2, DEFAULT_BANDS)?.symbol).toBe("□");
    expect(bandFor(0.85, DEFAULT_BANDS)?.symbol).toBe("▲");
  });

  it("places values inside each band", () => {
    expect(bandFor(1.5, DEFAULT_BANDS)?.symbol).toBe("□");
    expect(bandFor(1.1, DEFAULT_BANDS)?.symbol).toBe("◎");
    expect(bandFor(1.0, DEFAULT_BANDS)?.symbol).toBe("〇");
    expect(bandFor(0.9, DEFAULT_BANDS)?.symbol).toBe("▲");
    expect(bandFor(0.4, DEFAULT_BANDS)?.symbol).toBe("■");
    expect(bandFor(-0.5, DEFAULT_BANDS)?.symbol).toBe("■");
  });

  it("gives no symbol at all to a null achievement", () => {
    expect(bandFor(null, DEFAULT_BANDS)).toBeNull();
  });

  it("rejects a gap in the scale", () => {
    const holed = DEFAULT_BANDS.map((band) =>
      band.symbol === "〇" ? { ...band, minPct: 0.97 } : band,
    );
    expect(() => validateBands(holed)).toThrow(BandConfigurationError);
    expect(() => validateBands(holed)).toThrow(/gap between ▲ .* and 〇/);
  });

  it("rejects an overlap in the scale", () => {
    const overlapping = DEFAULT_BANDS.map((band) =>
      band.symbol === "〇" ? { ...band, minPct: 0.8 } : band,
    );
    expect(() => validateBands(overlapping)).toThrow(/overlap/);
  });

  it("rejects a scale that does not reach the bottom of the number line", () => {
    const bounded = DEFAULT_BANDS.map((band) =>
      band.symbol === "■" ? { ...band, minPct: 0 } : band,
    );
    expect(() => validateBands(bounded)).toThrow(/unbounded minimum/);
  });

  it("rejects a scale that does not reach the top of the number line", () => {
    const bounded = DEFAULT_BANDS.map((band) =>
      band.symbol === "□" ? { ...band, maxPct: 5 } : band,
    );
    expect(() => validateBands(bounded)).toThrow(/unbounded maximum/);
  });

  it("rejects a duplicated symbol", () => {
    const duplicated = [...DEFAULT_BANDS, { ...DEFAULT_BANDS[2] }];
    expect(() => validateBands(duplicated)).toThrow(/more than once/);
  });
});

describe("latest-forecast baseline", () => {
  it("orders forecast versions by sequence and excludes ACT", () => {
    expect(forecastVersionsDescending(VERSIONS).map((version) => version.code)).toEqual([
      "3QFC", "2QFC", "1QFC", "PRB", "OB",
    ]);
  });

  it("takes the highest-sequence version that actually has a value for the month", () => {
    const byVersion: ValuesByVersion = {
      prb: values({ "2026-04": 100, "2026-05": 100, "2026-06": 100 }),
      "1qfc": values({ "2026-04": 110 }),
      "2qfc": values({ "2026-06": 130 }),
    };
    const resolved = resolveLatestForecast(byVersion, VERSIONS, quarterMonths(2026, "Q1"));
    expect(resolved["2026-04"]).toMatchObject({ value: 110, versionCode: "1QFC" });
    expect(resolved["2026-05"]).toMatchObject({ value: 100, versionCode: "PRB" });
    expect(resolved["2026-06"]).toMatchObject({ value: 130, versionCode: "2QFC" });
  });

  it("never resolves a target from the ACT version", () => {
    const byVersion: ValuesByVersion = { act: values({ "2026-04": 999 }) };
    const resolved = resolveLatestForecast(byVersion, VERSIONS, ["2026-04"]);
    expect(resolved["2026-04"].value).toBeNull();
  });

  it("skips a null cell on a higher-sequence version", () => {
    const byVersion: ValuesByVersion = {
      prb: values({ "2026-04": 100 }),
      "2qfc": values({ "2026-04": null }),
    };
    const resolved = resolveLatestForecast(byVersion, VERSIONS, ["2026-04"]);
    expect(resolved["2026-04"]).toMatchObject({ value: 100, versionCode: "PRB" });
  });

  it("reproduces an earlier review when capped to that sequence", () => {
    const byVersion: ValuesByVersion = {
      prb: values({ "2026-04": 100 }),
      "2qfc": values({ "2026-04": 130 }),
    };
    const asAtQ1 = resolveLatestForecast(byVersion, VERSIONS, ["2026-04"], 3);
    expect(asAtQ1["2026-04"]).toMatchObject({ value: 100, versionCode: "PRB" });
  });

  it("resolves to null when no forecast version holds the month", () => {
    const resolved = resolveLatestForecast({}, VERSIONS, ["2026-04"]);
    expect(resolved["2026-04"]).toMatchObject({ value: null, versionCode: null });
  });
});

describe("sheet rows", () => {
  const bands = DEFAULT_BANDS;

  function row(controlItem: ControlItemSpec, byVersion: ValuesByVersion, targetVersionId?: string) {
    return buildRow({
      controlItem,
      kiStartYear: 2026,
      versions: VERSIONS,
      valuesByVersion: byVersion,
      bands,
      targetVersionId,
    });
  }

  it("lays out seventeen columns in fiscal order", () => {
    const built = row(REVENUE, {});
    expect(built.cells.map((cell) => cell.label)).toEqual([
      "Apr", "May", "Jun", "Q1",
      "Jul", "Aug", "Sep", "Q2",
      "Oct", "Nov", "Dec", "Q3",
      "Jan", "Feb", "Mar", "Q4",
      "Ki Total",
    ]);
  });

  it("derives Q1 as Apr + May + Jun and Ki as the sum of the quarters", () => {
    const byVersion: ValuesByVersion = {
      prb: values(Object.fromEntries(kiMonths(2026).map((p) => [p, 100]))),
      act: values(Object.fromEntries(kiMonths(2026).map((p) => [p, 90]))),
    };
    const built = row(REVENUE, byVersion);
    const cell = (key: string) => built.cells.find((c) => c.key === key)!;
    expect(cell("Q1").target).toBe(300);
    expect(cell("Q1").actual).toBe(270);
    expect(cell("KI").target).toBe(1200);
    expect(cell("KI").actual).toBe(1080);
    const quarterActuals = ["Q1", "Q2", "Q3", "Q4"].map((q) => cell(q).actual ?? 0);
    expect(quarterActuals.reduce((a, b) => a + b, 0)).toBe(cell("KI").actual);
  });

  it("averages only the populated months for an AVERAGE item", () => {
    const byVersion: ValuesByVersion = {
      prb: values({ "2026-04": 70, "2026-05": 70, "2026-06": 70 }),
      act: values({ "2026-04": 80, "2026-06": 90 }),
    };
    const built = row(ENGAGEMENT, byVersion);
    const q1 = built.cells.find((cell) => cell.key === "Q1")!;
    expect(q1.actual).toBe(85);
    expect(q1.target).toBe(70);
  });

  it("takes the most recent populated month for a LATEST item", () => {
    const byVersion: ValuesByVersion = {
      prb: values({ "2026-04": 200, "2026-05": 205, "2026-06": 210 }),
      act: values({ "2026-04": 198, "2026-05": 203 }),
    };
    const built = row(HEADCOUNT, byVersion);
    const q1 = built.cells.find((cell) => cell.key === "Q1")!;
    expect(q1.actual).toBe(203);
    expect(q1.target).toBe(210);
  });

  it("marks an SG&A underspend favourable with achievement above 100%", () => {
    const byVersion: ValuesByVersion = {
      prb: values({ "2026-04": 1000 }),
      act: values({ "2026-04": 950 }),
    };
    const built = row(SGA, byVersion);
    const april = built.cells.find((cell) => cell.key === "2026-04")!;
    expect(april.gap).toBe(-50);
    expect(april.gapSense).toBe("FAVOURABLE");
    expect(april.achievement!).toBeGreaterThan(1);
    expect(april.symbol).toBe("◎");
  });

  it("produces no symbol and no achievement against a zero target", () => {
    const byVersion: ValuesByVersion = {
      prb: values({ "2026-04": 0 }),
      act: values({ "2026-04": 50 }),
    };
    const april = row(REVENUE, byVersion).cells.find((cell) => cell.key === "2026-04")!;
    expect(april.achievement).toBeNull();
    expect(april.symbol).toBeNull();
    expect(formatAchievement(april.achievement)).toBe(EM_DASH);
  });

  it("evaluates 105.0% as ◎ and 95.0% as 〇 on a real row", () => {
    const byVersion: ValuesByVersion = {
      prb: values({ "2026-04": 1000, "2026-05": 1000 }),
      act: values({ "2026-04": 1050, "2026-05": 950 }),
    };
    const built = row(REVENUE, byVersion);
    expect(built.cells.find((cell) => cell.key === "2026-04")!.symbol).toBe("◎");
    expect(built.cells.find((cell) => cell.key === "2026-05")!.symbol).toBe("〇");
  });

  it("records which forecast version supplied each month's target", () => {
    const byVersion: ValuesByVersion = {
      prb: values({ "2026-04": 100, "2026-05": 100 }),
      "2qfc": values({ "2026-05": 120 }),
    };
    const built = row(REVENUE, byVersion);
    expect(built.cells.find((cell) => cell.key === "2026-04")!.targetVersionCode).toBe("PRB");
    expect(built.cells.find((cell) => cell.key === "2026-05")!.targetVersionCode).toBe("2QFC");
  });

  it("pins the target to one version when asked, ignoring later forecasts", () => {
    const byVersion: ValuesByVersion = {
      prb: values({ "2026-04": 100 }),
      "2qfc": values({ "2026-04": 130 }),
    };
    const built = row(REVENUE, byVersion, "prb");
    expect(built.cells.find((cell) => cell.key === "2026-04")!.target).toBe(100);
  });

  it("computes quarter achievement from rolled values, not from averaged achievements", () => {
    // A large month at 100% and a small month at 200% must not read as 150%.
    const byVersion: ValuesByVersion = {
      prb: values({ "2026-04": 1000, "2026-05": 10, "2026-06": null }),
      act: values({ "2026-04": 1000, "2026-05": 20, "2026-06": null }),
    };
    const q1 = row(REVENUE, byVersion).cells.find((cell) => cell.key === "Q1")!;
    expect(q1.achievement).toBeCloseTo(1020 / 1010, 10);
  });

  it("leaves derived columns non-editable", () => {
    const built = row(REVENUE, {});
    for (const cell of built.cells) {
      if (cell.kind !== "MONTH") expect(cell.locked).toBe(true);
    }
  });

  it("marks month cells locked when the actual version is locked", () => {
    const lockedVersions = VERSIONS.map((version) =>
      version.isActual ? { ...version, lockedAt: new Date("2026-07-01") } : version,
    );
    const built = buildRow({
      controlItem: REVENUE,
      kiStartYear: 2026,
      versions: lockedVersions,
      valuesByVersion: {},
      bands: DEFAULT_BANDS,
    });
    expect(built.cells.filter((cell) => cell.kind === "MONTH").every((cell) => cell.locked)).toBe(true);
  });
});

describe("formatting", () => {
  it("renders an em dash for no data, and a real zero as zero", () => {
    expect(formatValue(null, 0)).toBe(EM_DASH);
    expect(formatValue(undefined, 0)).toBe(EM_DASH);
    expect(formatValue(0, 0)).toBe("0");
    expect(formatValue(Number.NaN, 0)).toBe(EM_DASH);
  });

  it("respects decimal places exactly so columns stay aligned", () => {
    expect(formatValue(1234.5, 0)).toBe("1,235");
    expect(formatValue(1234.5, 1)).toBe("1,234.5");
    expect(formatValue(1234, 2)).toBe("1,234.00");
  });

  it("formats achievement against 100% to one decimal", () => {
    expect(formatAchievement(1.05)).toBe("105.0%");
    expect(formatAchievement(0.9512)).toBe("95.1%");
    expect(formatAchievement(null)).toBe(EM_DASH);
  });

  it("signs a gap when asked", () => {
    expect(formatValue(-50, 0, "CURRENCY", { signed: true, withUnit: true })).toBe("-$50");
    expect(formatValue(50, 0, "CURRENCY", { signed: true, withUnit: true })).toBe("+$50");
  });
});
