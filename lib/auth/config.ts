import NextAuth from "next-auth";
import { baseAuthConfig } from "./base-config";
import { providers } from "./providers";

/**
 * The Node-runtime Auth.js instance: the one that can actually authenticate,
 * because it can reach the database. Application code does not import this -
 * it imports lib/auth/session.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...baseAuthConfig,
  providers,
});
