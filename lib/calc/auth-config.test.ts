/**
 * Which providers a deployment actually registers.
 *
 * The rule that matters: a half-configured Entra provider must not be
 * registered at all. Auth.js falls back to the `/common/` issuer when
 * `issuer` is unset, and /api/auth/signin/... never passes through the login
 * screen, so a guard on that screen cannot protect it. Absence is the guard.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const KEYS = [
  "AUTH_MICROSOFT_ENTRA_ID_ID",
  "AUTH_MICROSOFT_ENTRA_ID_SECRET",
  "AUTH_MICROSOFT_ENTRA_ID_ISSUER",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Imported fresh each time, because it reads the environment when called. */
async function entraConfigured() {
  const mod = await import("@/lib/auth/env");
  return mod.entraConfigured();
}

describe("entraConfigured", () => {
  it("is false when nothing is set", async () => {
    expect(await entraConfigured()).toBe(false);
  });

  it("is false with a client id and secret but no tenant issuer", async () => {
    // The dangerous middle state: enough for Auth.js to build a working
    // /common/ flow, not enough to restrict it to one tenant.
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID = "id";
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET = "secret";
    expect(await entraConfigured()).toBe(false);
  });

  it("is false when the issuer is set but the secret is missing", async () => {
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID = "id";
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER = "https://login.microsoftonline.com/t/v2.0";
    expect(await entraConfigured()).toBe(false);
  });

  it("is true only when all three are present", async () => {
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID = "id";
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET = "secret";
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER = "https://login.microsoftonline.com/t/v2.0";
    expect(await entraConfigured()).toBe(true);
  });

  it("treats an empty string as absent, not as configured", async () => {
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID = "id";
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET = "secret";
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER = "";
    expect(await entraConfigured()).toBe(false);
  });
});
