/**
 * Identity providers. This is the only file that knows how a user proves who
 * they are. Dropping in Entra, Okta or LDAP later means adding a provider here
 * and mapping its claims onto `AuthenticatedUser` - no application code, no
 * screen and no server action changes.
 *
 * Two providers now sit side by side.
 *
 * Microsoft Entra ID is the real one: the corporate directory owns identity,
 * which means password policy, MFA and conditional access are enforced where
 * they belong instead of here. Entra says *who you are*; this application
 * still decides *what you may do*, from its own `role` and `org_unit_id`.
 *
 * Email and password remains for development, where there is no tenant to
 * authenticate against and the seeded accounts have to work. It is off in
 * production unless someone deliberately sets AUTH_ALLOW_PASSWORD, so a
 * production deployment has no local password to leak or rotate.
 *
 * The Entra provider overrides `profile()` rather than doing its work in a
 * `jwt` callback. That is deliberate: `profile()` runs in Node during the
 * OAuth callback, so it can reach the database, and returning a fully
 * populated `AuthenticatedUser` from it means base-config's existing jwt and
 * session callbacks need no change at all. Doing the lookup in `jwt` would
 * pull Prisma into the Edge middleware bundle, where it cannot go.
 */

import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveSsoUser, type EntraClaims, type SsoLookup } from "./sso";
import type { AuthenticatedUser } from "./types";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const localCredentialsProvider = Credentials({
  name: "Email and password",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(raw): Promise<AuthenticatedUser | null> {
    const parsed = credentialsSchema.safeParse(raw);
    if (!parsed.success) return null;

    const user = await prisma.appUser.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      include: { orgUnit: { select: { id: true, code: true, name: true } } },
    });
    // Compare against a dummy hash when the user is unknown so that a missing
    // account and a wrong password take the same time to reject.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const ok = await bcrypt.compare(parsed.data.password, hash);
    if (!user || !ok || !user.isActive) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      orgUnitId: user.orgUnitId,
      orgUnitCode: user.orgUnit?.code ?? null,
    };
  },
});

const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.Uz8i2Zm1u9Q0Zg7q3cVn8m4Kx0Vy";

// ------------------------------------------------------------ Microsoft SSO

const ACCOUNT_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  orgUnitId: true,
  isActive: true,
  entraObjectId: true,
  orgUnit: { select: { code: true } },
} as const;

/** Flattens the joined org unit down to the code the session carries. */
function toSsoAccount<T extends { orgUnit: { code: string } | null }>(row: T) {
  return { ...row, orgUnitCode: row.orgUnit?.code ?? null };
}

/** The database half of the resolution, kept behind the interface so the
 *  rule itself stays testable without a database. See lib/auth/sso.ts. */
const prismaSsoLookup: SsoLookup = {
  async byEntraObjectId(oid) {
    const row = await prisma.appUser.findUnique({
      where: { entraObjectId: oid },
      select: ACCOUNT_SELECT,
    });
    return row ? toSsoAccount(row) : null;
  },
  async byEmail(email) {
    const row = await prisma.appUser.findUnique({
      where: { email },
      select: ACCOUNT_SELECT,
    });
    return row ? toSsoAccount(row) : null;
  },
  async linkEntraObjectId(userId, oid) {
    await prisma.appUser.update({ where: { id: userId }, data: { entraObjectId: oid } });
  },
};

export const entraProvider = MicrosoftEntraID({
  clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
  clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
  // Must be the tenant-specific issuer. Left unset, Auth.js defaults to
  // /common/, which would let any Microsoft account in the world - personal
  // Outlook and Xbox accounts included - reach the sign-in step.
  issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
  // Replaces the built-in profile(), which fetches the user's Graph photo and
  // base64-inlines it. The session is a cookie and there is no avatar anywhere
  // in this application, so that would be pure payload.
  async profile(profile): Promise<AuthenticatedUser> {
    return resolveSsoUser(profile as EntraClaims, prismaSsoLookup);
  },
});

/**
 * Whether the Entra credentials are actually present.
 *
 * Auth.js handles a missing client id or secret by redirecting internally,
 * before any error this application could catch, which lands the user back on
 * a bare sign-in screen with nothing said. Checking first means a deployment
 * that has not been given its credentials says so, instead of looking like a
 * button that does nothing.
 */
export function entraConfigured(): boolean {
  return Boolean(
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
      process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
      process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
  );
}

/**
 * Password sign-in is a development convenience, not a production feature.
 * Set AUTH_ALLOW_PASSWORD=true to keep it as a deliberate break-glass path.
 */
export const passwordSignInEnabled =
  process.env.NODE_ENV !== "production" || process.env.AUTH_ALLOW_PASSWORD === "true";

export const providers = passwordSignInEnabled
  ? [entraProvider, localCredentialsProvider]
  : [entraProvider];
