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

describe("entraConfigured, against a half-filled .env.example", () => {
  // The exact values from .env.example. Copying that file into a deployment
  // and filling in only some of it is the ordinary way to get this wrong, and
  // it used to take the login screen down entirely rather than fall back to
  // the password form.
  const PLACEHOLDERS = {
    AUTH_MICROSOFT_ENTRA_ID_ID: "<Application (client) ID>",
    AUTH_MICROSOFT_ENTRA_ID_SECRET: "<Client secret value>",
    AUTH_MICROSOFT_ENTRA_ID_ISSUER:
      "https://login.microsoftonline.com/<Directory (tenant) ID>/v2.0",
  };

  it("treats the untouched placeholders as unconfigured", async () => {
    Object.assign(process.env, PLACEHOLDERS);
    expect(await entraConfigured()).toBe(false);
  });

  it("still refuses when only the tenant is left as a placeholder", async () => {
    Object.assign(process.env, PLACEHOLDERS, {
      AUTH_MICROSOFT_ENTRA_ID_ID: "11111111-2222-3333-4444-555555555555",
      AUTH_MICROSOFT_ENTRA_ID_SECRET: "a-real-looking-secret",
    });
    expect(await entraConfigured()).toBe(false);
  });

  it("refuses an issuer that is not https", async () => {
    Object.assign(process.env, {
      AUTH_MICROSOFT_ENTRA_ID_ID: "11111111-2222-3333-4444-555555555555",
      AUTH_MICROSOFT_ENTRA_ID_SECRET: "a-real-looking-secret",
      AUTH_MICROSOFT_ENTRA_ID_ISSUER: "login.microsoftonline.com/tenant/v2.0",
    });
    expect(await entraConfigured()).toBe(false);
  });

  it("accepts three genuinely filled-in values", async () => {
    Object.assign(process.env, {
      AUTH_MICROSOFT_ENTRA_ID_ID: "11111111-2222-3333-4444-555555555555",
      AUTH_MICROSOFT_ENTRA_ID_SECRET: "a-real-looking-secret",
      AUTH_MICROSOFT_ENTRA_ID_ISSUER:
        "https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0",
    });
    expect(await entraConfigured()).toBe(true);
  });
});

describe("passwordSignInEnabled, in production", () => {
  // A hosting panel is not a .env file: people paste quotes, capitalise, and
  // reach for 1. Getting any of those wrong used to remove the password form
  // with no explanation, on a deployment where it was the only way in.
  let savedNodeEnv: string | undefined;
  let savedFlag: string | undefined;

  beforeEach(() => {
    savedNodeEnv = process.env.NODE_ENV;
    savedFlag = process.env.AUTH_ALLOW_PASSWORD;
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
      writable: true,
      enumerable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: savedNodeEnv,
      configurable: true,
      writable: true,
      enumerable: true,
    });
    if (savedFlag === undefined) delete process.env.AUTH_ALLOW_PASSWORD;
    else process.env.AUTH_ALLOW_PASSWORD = savedFlag;
  });

  async function enabled() {
    const mod = await import("@/lib/auth/env");
    return mod.passwordSignInEnabled();
  }

  it("accepts the spellings people actually type", async () => {
    for (const value of ["true", "TRUE", "True", ' "true" ', "1", "yes", "on"]) {
      process.env.AUTH_ALLOW_PASSWORD = value;
      expect(await enabled(), `value: ${JSON.stringify(value)}`).toBe(true);
    }
  });

  it("stays off when unset, empty, or explicitly denied", async () => {
    for (const value of ["", "   ", "false", "FALSE", "no", "off", "0", "maybe"]) {
      process.env.AUTH_ALLOW_PASSWORD = value;
      expect(await enabled(), `value: ${JSON.stringify(value)}`).toBe(false);
    }
    delete process.env.AUTH_ALLOW_PASSWORD;
    expect(await enabled()).toBe(false);
  });
});
