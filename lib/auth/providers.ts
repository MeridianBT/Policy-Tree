/**
 * Identity providers. This is the only file that knows how a user proves who
 * they are. Dropping in Entra, Okta or LDAP later means adding a provider here
 * and mapping its claims onto `AuthenticatedUser` - no application code, no
 * screen and no server action changes.
 */

import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
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

export const providers = [localCredentialsProvider];
