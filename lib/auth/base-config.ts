import type { NextAuthConfig } from "next-auth";
import type { AuthenticatedUser, Role } from "./types";

/**
 * Configuration shared by the Node runtime and the Edge middleware.
 *
 * The provider list is deliberately absent: providers reach the database, and
 * the middleware runs on the Edge runtime where Prisma cannot go. Middleware
 * only needs to verify the JWT, which this config is enough for.
 */
export const baseAuthConfig: NextAuthConfig = {
  providers: [],
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const authenticated = user as unknown as AuthenticatedUser;
        token.uid = authenticated.id;
        token.role = authenticated.role;
        token.orgUnitId = authenticated.orgUnitId;
        token.orgUnitCode = authenticated.orgUnitCode;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as Role;
        session.user.orgUnitId = (token.orgUnitId as string | null) ?? null;
        session.user.orgUnitCode = (token.orgUnitCode as string | null) ?? null;
      }
      return session;
    },
  },
};
