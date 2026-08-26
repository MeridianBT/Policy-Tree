/**
 * Which sign-in methods a deployment has actually been configured for.
 *
 * Free of Prisma and Auth.js on purpose. These two answers decide what the
 * login screen offers and which providers get registered at all, so they are
 * worth testing directly - and a module that imports the database cannot be
 * loaded in a test without one.
 *
 * Both read the environment when called rather than when imported, so a test
 * can set the variables and get an honest answer.
 */

/**
 * True only when all three Entra settings are present *and* real.
 *
 * The issuer is not optional. Auth.js falls back to the `/common/` issuer
 * when it is unset, which would authenticate any Microsoft account in the
 * world - personal Outlook and Xbox accounts included - rather than only the
 * company tenant. A deployment holding a client id and secret but no tenant
 * is therefore treated as not configured, not as partly configured.
 *
 * The placeholder check is not defensive programming for its own sake. The
 * obvious way to configure a deployment is to copy .env.example and fill it
 * in, and the obvious way to get it wrong is to copy it and fill in only
 * some of it. The angle-bracketed placeholders then read as present, the
 * provider registers, and Auth.js fetches a discovery document from a URL
 * containing "<Directory (tenant) ID>" - which returns an HTML error page,
 * so the *login screen itself* dies parsing HTML as JSON. Nobody can sign in
 * by any method, and the error names none of this.
 */
function realValue(name: string): string | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  // Anything still carrying the shape of a .env.example placeholder.
  if (value.includes("<") || value.includes(">")) return null;
  return value;
}

export function entraConfigured(): boolean {
  const issuer = realValue("AUTH_MICROSOFT_ENTRA_ID_ISSUER");
  return Boolean(
    realValue("AUTH_MICROSOFT_ENTRA_ID_ID") &&
      realValue("AUTH_MICROSOFT_ENTRA_ID_SECRET") &&
      issuer &&
      issuer.startsWith("https://"),
  );
}

/**
 * Password sign-in is a development convenience, not a production feature.
 * Set AUTH_ALLOW_PASSWORD=true to keep it as a deliberate break-glass path.
 */
export function passwordSignInEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.AUTH_ALLOW_PASSWORD === "true";
}
