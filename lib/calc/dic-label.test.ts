/**
 * How a Division or Department reads in a picker.
 *
 * The cases that matter are the ones where shortening would cost information:
 * a code that does not follow the convention, and two departments in different
 * divisions sharing a name.
 */

import { describe, expect, it } from "vitest";
import { dicOptionLabel, shortDicCode, type LabelledDic } from "@/components/sheet/dic-label";

const auto: LabelledDic = { code: "AUTO", name: "Automobiles", type: "DIVISION", parentCode: null };
const product: LabelledDic = {
  code: "AUTO-PRD",
  name: "Product",
  type: "DEPARTMENT",
  parentCode: "AUTO",
};
const autoNetwork: LabelledDic = {
  code: "AUTO-ND",
  name: "Network Development",
  type: "DEPARTMENT",
  parentCode: "AUTO",
};
const pspNetwork: LabelledDic = {
  code: "PSP-ND",
  name: "Network Development",
  type: "DEPARTMENT",
  parentCode: "PSP",
};

describe("shortDicCode", () => {
  it("drops the division a code carries", () => {
    expect(shortDicCode("AUTO-PRD", "AUTO")).toBe("PRD");
    expect(shortDicCode("BMD-DIGA", "BMD")).toBe("DIGA");
  });

  it("leaves a code that does not follow the convention alone", () => {
    // Admin → Departments takes any code an admin types, so the prefix is a
    // habit rather than a rule. Half a code is worse than a long one.
    expect(shortDicCode("SPECIAL", "AUTO")).toBe("SPECIAL");
    expect(shortDicCode("AUTOMATION", "AUTO")).toBe("AUTOMATION");
    expect(shortDicCode("AUTO-", "AUTO")).toBe("AUTO-");
    expect(shortDicCode("OX-PTS", null)).toBe("OX-PTS");
  });
});

describe("dicOptionLabel", () => {
  it("names a division by its own code", () => {
    expect(dicOptionLabel(auto, null)).toBe("AUTO — Automobiles");
    expect(dicOptionLabel(auto, "AUTO")).toBe("AUTO — Automobiles");
  });

  it("keeps a department's full code when the list spans divisions", () => {
    expect(dicOptionLabel(product, null)).toBe("AUTO-PRD — Product");
  });

  it("shortens a department once its own division is chosen", () => {
    expect(dicOptionLabel(product, "AUTO")).toBe("PRD — Product");
  });

  it("keeps the full code for a department outside the chosen division", () => {
    expect(dicOptionLabel(pspNetwork, "AUTO")).toBe("PSP-ND — Network Development");
  });

  it("never lets two departments read alike", () => {
    // Network Development exists under both AUTO and PSP. Across the whole
    // list the codes separate them; inside one division only one of them is
    // there to shorten.
    expect(dicOptionLabel(autoNetwork, null)).not.toBe(dicOptionLabel(pspNetwork, null));
    expect(dicOptionLabel(autoNetwork, "AUTO")).toBe("ND — Network Development");
    expect(dicOptionLabel(pspNetwork, "PSP")).toBe("ND — Network Development");
    // ...and the two are never offered in the same list, because choosing a
    // division is what narrows it.
  });

  it("never prints the division twice", () => {
    for (const within of [null, "AUTO"]) {
      const label = dicOptionLabel(product, within);
      expect(label.split("AUTO").length - 1).toBeLessThanOrEqual(1);
    }
  });
});
