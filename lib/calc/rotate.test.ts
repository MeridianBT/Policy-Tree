/**
 * Who a bulk password rotate touches.
 *
 * One rule, and it is a security rule rather than a convenience: an account
 * with no password is invite-only through Microsoft. Giving it one during a
 * rotate would open a second way in that nobody asked for, and it would do so
 * silently - the account would look exactly the same afterwards.
 */

import { describe, expect, it } from "vitest";
import { planRotate } from "@/lib/admin/rotate";

const withPassword = { id: "1", email: "keyed@example.com", passwordHash: "$2b$10$abc" };
const ssoOnly = { id: "2", email: "sso@example.com", passwordHash: null };

describe("planRotate", () => {
  it("changes accounts that already have a password", () => {
    const plan = planRotate([withPassword]);
    expect(plan.change.map((a) => a.email)).toEqual(["keyed@example.com"]);
    expect(plan.skipSsoOnly).toEqual([]);
  });

  it("never issues a password to a Microsoft-only account", () => {
    const plan = planRotate([ssoOnly]);
    expect(plan.change).toEqual([]);
    expect(plan.skipSsoOnly.map((a) => a.email)).toEqual(["sso@example.com"]);
  });

  it("splits a mixed directory without losing anyone", () => {
    const plan = planRotate([withPassword, ssoOnly]);
    expect(plan.change.length + plan.skipSsoOnly.length).toBe(2);
    expect(plan.change).toContain(withPassword);
    expect(plan.skipSsoOnly).toContain(ssoOnly);
  });

  it("handles an empty directory", () => {
    expect(planRotate([])).toEqual({ change: [], skipSsoOnly: [] });
  });
});
