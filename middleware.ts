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
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
