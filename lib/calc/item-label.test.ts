/**
 * What to call one Control Item away from the sheet.
 *
 * The case that matters is the one that only appears once an Objective carries
 * more than one Control Item: three lines reading the same statement tell
 * nobody which figure they owe.
 */

import { describe, expect, it } from "vitest";
import { controlItemLabel } from "@/lib/calc/item-label";

describe("controlItemLabel", () => {
  it("is the Objective's statement when it carries one Control Item", () => {
    expect(controlItemLabel("New vehicle deliveries", "Units delivered", 1)).toBe(
      "New vehicle deliveries",
    );
  });

  it("names the Control Item when the Objective carries several", () => {
    expect(controlItemLabel("Service experience", "NPS, -100 to +100", 3)).toBe(
      "Service experience — NPS, -100 to +100",
    );
  });

  it("falls back to the statement when the Control Item names no measure", () => {
    // measuredAs is optional in the database; a label reading "Objective — " is
    // worse than the statement alone.
    expect(controlItemLabel("Service experience", null, 3)).toBe("Service experience");
    expect(controlItemLabel("Service experience", "", 3)).toBe("Service experience");
  });

  it("treats a count it was never given as one", () => {
    expect(controlItemLabel("Market share", "% of VFACTS", 0)).toBe("Market share");
  });
});
