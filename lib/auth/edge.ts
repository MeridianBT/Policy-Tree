import NextAuth from "next-auth";
import { baseAuthConfig } from "./base-config";

/** Edge-runtime instance used by the middleware to verify the session cookie. */
export const { auth: edgeAuth } = NextAuth(baseAuthConfig);
