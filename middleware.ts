import { edgeAuth } from "@/lib/auth/edge";

/**
 * Route protection. This only checks that a session cookie is present and
 * valid - authorisation always happens again on the server, in
 * lib/auth/session, on every read and every mutation.
 */
export default edgeAuth((request) => {
  if (!request.auth) {
    const url = new URL("/login", request.nextUrl.origin);
    url.searchParams.set("next", request.nextUrl.pathname);
    return Response.redirect(url);
  }
});

export const config = {
  // `api/reminders` is excluded because it is called by a scheduler, which
  // carries a shared secret rather than a session cookie - left in, the
  // middleware would redirect it to /login and the reminders would silently
  // never run. That route does its own authorisation; it is not open.
  //
  // `api/health` is excluded for the same shape of reason: a platform health
  // checker carries no cookie, and a 302 to /login would read as healthy while
  // the database was unreachable.
  matcher: ["/((?!api/auth|api/reminders|api/health|login|_next/static|_next/image|favicon.ico).*)"],
};
