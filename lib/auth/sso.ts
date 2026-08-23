/**
 * Resolving a Microsoft Entra sign-in onto an application account.
 *
 * This module is deliberately free of both Prisma and Auth.js: it takes the
 * claims and a pair of lookup functions and returns the `AuthenticatedUser`
 * the rest of the app expects. That makes the rule that actually matters -
 * who is allowed in - exercisable in a unit test, with no OAuth round trip
 * and no database.
 *
 * The rule is invite-only. Proving you own a Microsoft account in the
 * company tenant is not by itself permission to use this application: an
 * admin has to have created the account first. So an unknown user is
 * refused rather than provisioned, and refused with a message that says so
 * plainly - "ask an admin", not "wrong password".
 *
 * Matching prefers `oid` over email. Email is what an admin types when
 * inviting someone, so it has to work for the first sign-in, but it is
 * mutable in Entra - people marry, change surname, get their mailbox
 * renamed. `oid` is immutable and tenant-wide, so the first successful
 * match records it and every later sign-in keys off it instead.
 */

import type { AuthenticatedUser } from "./types";

/** The subset of the Entra ID token we actually rely on. */
export interface EntraClaims {
  /** Immutable, tenant-wide object id. The identifier we trust. */
  oid?: string | null;
  /** Present when the `email` scope is granted; absent for some accounts. */
  email?: string | null;
  /** Falls back for the email when `email` is missing - usually the UPN. */
  preferred_username?: string | null;
  name?: string | null;
}

/** What a lookup returns: enough to decide, and to build the session user. */
export interface SsoAccount {
  id: string;
  name: string;
  email: string;
  role: AuthenticatedUser["role"];
  orgUnitId: string | null;
  orgUnitCode: string | null;
  isActive: boolean;
  entraObjectId: string | null;
}

export interface SsoLookup {
  byEntraObjectId(oid: string): Promise<SsoAccount | null>;
  byEmail(email: string): Promise<SsoAccount | null>;
  /** Records the oid on first match, so later sign-ins never need the email. */
  linkEntraObjectId(userId: string, oid: string): Promise<void>;
}

/** Thrown when the sign-in is genuine but the person has no account here. */
export class SsoAccountNotProvisionedError extends Error {
  constructor(readonly identifier: string) {
    super(`${identifier} has no Hoshin Kanri account.`);
    this.name = "SsoAccountNotProvisionedError";
  }
}

/** Thrown when the account exists but an admin has deactivated it. */
export class SsoAccountInactiveError extends Error {
  constructor(readonly identifier: string) {
    super(`${identifier} is deactivated.`);
    this.name = "SsoAccountInactiveError";
  }
}

/** The address to match an invitation against, lower-cased as stored. */
export function emailFromClaims(claims: EntraClaims): string | null {
  const raw = claims.email ?? claims.preferred_username ?? null;
  const trimmed = raw?.trim().toLowerCase();
  // A UPN is usually an address, but not always - anything without an @ is
  // not something to match an invitation against.
  return trimmed && trimmed.includes("@") ? trimmed : null;
}

export async function resolveSsoUser(
  claims: EntraClaims,
  lookup: SsoLookup,
): Promise<AuthenticatedUser> {
  const oid = claims.oid?.trim() || null;
  const email = emailFromClaims(claims);
  const identifier = email ?? oid ?? "This Microsoft account";

  // oid first: it is the identifier that cannot drift.
  let account = oid ? await lookup.byEntraObjectId(oid) : null;

  if (!account && email) {
    account = await lookup.byEmail(email);
    // First sign-in for an invited account - bind it to the oid now so a
    // later email change cannot orphan it.
    if (account && oid && !account.entraObjectId) {
      await lookup.linkEntraObjectId(account.id, oid);
    }
  }

  if (!account) throw new SsoAccountNotProvisionedError(identifier);
  if (!account.isActive) throw new SsoAccountInactiveError(identifier);

  return {
    id: account.id,
    // Entra is authoritative for the display name; the stored one is only
    // ever what an admin typed at invite time.
    name: claims.name?.trim() || account.name,
    email: account.email,
    role: account.role,
    orgUnitId: account.orgUnitId,
    orgUnitCode: account.orgUnitCode,
  };
}
