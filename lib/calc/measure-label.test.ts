/**
 * What to call one Control Item away from the sheet.
 *
 * The case that matters is the one that only appears once a measure has more
 * than one control item: three lines reading the same name tell nobody which
 * figure they owe.
 */

import { describe, expect, it } from "vitest";
import { controlItemLabel } from "@/lib/calc/measure-label";

describe("controlItemLabel", () => {
  it("is the measure's name when the measure has one control item", () => {
    expect(controlItemLabel("New vehicle deliveries", "Units delivered", 1)).toBe(
      "New vehicle deliveries",
    );
  });

  it("names the control item when the measure has several", () => {
    expect(controlItemLabel("Service experience", "NPS, -100 to +100", 3)).toBe(
      "Service experience — NPS, -100 to +100",
    );
  });

  it("falls back to the measure's name when the control item has none", () => {
    // measuredAs is optional in the database; a label reading "Measure — " is
    // worse than the measure's name alone.
    expect(controlItemLabel("Service experience", null, 3)).toBe("Service experience");
    expect(controlItemLabel("Service experience", "", 3)).toBe("Service experience");
  });

  it("treats a count it was never given as one", () => {
    expect(controlItemLabel("Market share", "% of VFACTS", 0)).toBe("Market share");
  });
});
