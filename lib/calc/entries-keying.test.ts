/**
 * Which year "My entries" keys into.
 *
 * The rule is small and the failure it prevents is not: a nav badge counting
 * one year beside a screen opening another, or a screen full of empty boxes
 * for a year that has not started. Both look like working software.
 */

import { describe, expect, it } from "vitest";
import { kiToKeyInto } from "@/lib/entries/keying";

const live = { id: "live", code: "103KI" };
const prior = { id: "prior", code: "102KI" };
const draft = { id: "draft", code: "104KI" };

describe("kiToKeyInto", () => {
  it("keys the live year when nobody has switched", () => {
    expect(kiToKeyInto({ live, chosen: null, chosenIsPrior: false })).toEqual({
      ki: live,
      followed: false,
    });
  });

  /*
   * Backwards is where the switcher means something here: a prior year has
   * actuals in it, and the only people who can reach one are the only people
   * allowed to write there - see `selectableKis` and `canEditInKi`.
   */
  it("follows the switcher into a prior year, which is the record being corrected", () => {
    expect(kiToKeyInto({ live, chosen: prior, chosenIsPrior: true })).toEqual({
      ki: prior,
      followed: true,
    });
  });

  /*
   * Forwards it does not. An actual is a figure for a month that has happened,
   * and a year that has not started has none - following the switcher there
   * would offer boxes for numbers nobody can know.
   */
  it("holds the live year for a draft ahead of it, which has nothing to key", () => {
    expect(kiToKeyInto({ live, chosen: draft, chosenIsPrior: false })).toEqual({
      ki: live,
      followed: false,
    });
  });

  it("says it did not follow, so the screen can explain itself", () => {
    // The caller turns this into "you are working on 104KI, actuals belong to
    // 103KI". Silence here is what let the two disagree unremarked.
    expect(kiToKeyInto({ live, chosen: draft, chosenIsPrior: false }).followed).toBe(false);
    expect(kiToKeyInto({ live, chosen: prior, chosenIsPrior: true }).followed).toBe(true);
  });

  it("survives a deployment with no Ki at all rather than throwing", () => {
    expect(kiToKeyInto({ live: null, chosen: null, chosenIsPrior: false })).toEqual({
      ki: null,
      followed: false,
    });
  });

  // A prior year chosen on a deployment with no live year: there is nothing to
  // fall back to, so the choice stands rather than becoming null.
  it("still follows a prior year when there is no live one to hold", () => {
    expect(kiToKeyInto({ live: null, chosen: prior, chosenIsPrior: true })).toEqual({
      ki: prior,
      followed: true,
    });
  });
});
