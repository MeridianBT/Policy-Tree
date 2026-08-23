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
 * True only when all three Entra settings are present.
 *
 * The issuer is not optional. Auth.js falls back to the `/common/` issuer
 * when it is unset, which would authenticate any Microsoft account in the
 * world - personal Outlook and Xbox accounts included - rather than only the
 * company tenant. A deployment holding a client id and secret but no tenant
 * is therefore treated as not configured, not as partly configured.
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
export function passwordSignInEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.AUTH_ALLOW_PASSWORD === "true";
}
