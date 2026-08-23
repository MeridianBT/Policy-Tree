/**
 * Who gets in through Microsoft SSO.
 *
 * This is the security boundary of the whole SSO feature: proving you own a
 * Microsoft account is not permission to use this application. These tests
 * pin the invite-only rule, and the oid-over-email preference that keeps an
 * account attached to a person when their email changes.
 */

import { describe, expect, it, vi } from "vitest";
import {
  SsoAccountInactiveError,
  SsoAccountNotProvisionedError,
  emailFromClaims,
  resolveSsoUser,
  type SsoAccount,
  type SsoLookup,
} from "@/lib/auth/sso";

function account(overrides: Partial<SsoAccount> = {}): SsoAccount {
  return {
    id: "user-1",
    name: "Dealer Sales Lead",
    email: "dealer.lead@example.com",
    role: "OWNER",
    orgUnitId: "org-auto-sales",
    orgUnitCode: "AUTO-SALES",
    isActive: true,
    entraObjectId: null,
    ...overrides,
  };
}

/** A lookup backed by two in-memory tables, recording any link written. */
function lookup(seed: { byOid?: SsoAccount | null; byEmail?: SsoAccount | null } = {}): SsoLookup & {
  linked: Array<{ userId: string; oid: string }>;
} {
  const linked: Array<{ userId: string; oid: string }> = [];
  return {
    linked,
    byEntraObjectId: vi.fn(async () => seed.byOid ?? null),
    byEmail: vi.fn(async () => seed.byEmail ?? null),
    linkEntraObjectId: vi.fn(async (userId: string, oid: string) => {
      linked.push({ userId, oid });
    }),
  };
}

describe("emailFromClaims", () => {
  it("prefers the email claim, lower-cased", () => {
    expect(emailFromClaims({ email: "Dealer.Lead@Example.com" })).toBe("dealer.lead@example.com");
  });

  it("falls back to preferred_username when email is absent", () => {
    expect(emailFromClaims({ preferred_username: "dealer.lead@example.com" })).toBe(
      "dealer.lead@example.com",
    );
  });

  it("rejects a preferred_username that is not an address", () => {
    // Some accounts carry a bare username here; it must never be matched
    // against an invitation as though it were an email.
    expect(emailFromClaims({ preferred_username: "dealerlead" })).toBeNull();
  });

  it("is null when nothing usable is present", () => {
    expect(emailFromClaims({})).toBeNull();
  });
});

describe("resolveSsoUser", () => {
  it("matches an already-linked account by oid, without touching email", async () => {
    const existing = account({ entraObjectId: "oid-123" });
    const lk = lookup({ byOid: existing });

    const user = await resolveSsoUser({ oid: "oid-123", email: "dealer.lead@example.com" }, lk);

    expect(user.id).toBe("user-1");
    expect(user.role).toBe("OWNER");
    expect(user.orgUnitCode).toBe("AUTO-SALES");
    expect(lk.byEmail).not.toHaveBeenCalled();
    expect(lk.linked).toEqual([]);
  });

  it("matches an invited account by email and binds the oid on first sign-in", async () => {
    const lk = lookup({ byOid: null, byEmail: account() });

    const user = await resolveSsoUser({ oid: "oid-123", email: "dealer.lead@example.com" }, lk);

    expect(user.id).toBe("user-1");
    expect(lk.linked).toEqual([{ userId: "user-1", oid: "oid-123" }]);
  });

  it("does not re-link an account that already carries a different oid", async () => {
    // Reached by email but already bound elsewhere: leave the binding alone
    // rather than silently moving the account to a new identity.
    const lk = lookup({ byOid: null, byEmail: account({ entraObjectId: "oid-other" }) });

    await resolveSsoUser({ oid: "oid-123", email: "dealer.lead@example.com" }, lk);

    expect(lk.linked).toEqual([]);
  });

  it("prefers the oid match when oid and email point at different accounts", async () => {
    // The email moved to someone else in Entra; the oid is what identifies
    // the person, so the oid's account is the one that signs in.
    const lk = lookup({
      byOid: account({ id: "by-oid", entraObjectId: "oid-123" }),
      byEmail: account({ id: "by-email" }),
    });

    const user = await resolveSsoUser({ oid: "oid-123", email: "dealer.lead@example.com" }, lk);

    expect(user.id).toBe("by-oid");
  });

  it("refuses an unknown Microsoft account rather than provisioning one", async () => {
    const lk = lookup({ byOid: null, byEmail: null });

    await expect(
      resolveSsoUser({ oid: "oid-new", email: "stranger@example.com" }, lk),
    ).rejects.toBeInstanceOf(SsoAccountNotProvisionedError);
  });

  it("names the address in the refusal, so the message can say who to ask about", async () => {
    const lk = lookup({ byOid: null, byEmail: null });

    await expect(
      resolveSsoUser({ oid: "oid-new", email: "stranger@example.com" }, lk),
    ).rejects.toMatchObject({ identifier: "stranger@example.com" });
  });

  it("refuses a deactivated account", async () => {
    const lk = lookup({ byOid: account({ isActive: false, entraObjectId: "oid-123" }) });

    await expect(resolveSsoUser({ oid: "oid-123" }, lk)).rejects.toBeInstanceOf(
      SsoAccountInactiveError,
    );
  });

  it("refuses when the token carries neither an oid nor a usable email", async () => {
    const lk = lookup({ byOid: account(), byEmail: account() });

    await expect(resolveSsoUser({}, lk)).rejects.toBeInstanceOf(SsoAccountNotProvisionedError);
    expect(lk.byEntraObjectId).not.toHaveBeenCalled();
    expect(lk.byEmail).not.toHaveBeenCalled();
  });

  it("takes the display name from Entra but the email from the stored account", async () => {
    // Entra is authoritative for the name; the stored email is what every
    // other screen and every invitation is keyed on.
    const lk = lookup({ byOid: account({ name: "Old Name", entraObjectId: "oid-123" }) });

    const user = await resolveSsoUser(
      { oid: "oid-123", name: "New Married Name", email: "changed@example.com" },
      lk,
    );

    expect(user.name).toBe("New Married Name");
    expect(user.email).toBe("dealer.lead@example.com");
  });

  it("keeps the stored name when Entra sends none", async () => {
    const lk = lookup({ byOid: account({ entraObjectId: "oid-123" }) });
    const user = await resolveSsoUser({ oid: "oid-123", name: "   " }, lk);
    expect(user.name).toBe("Dealer Sales Lead");
  });
});
