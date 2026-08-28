/**
 * Where a sign-in may send someone afterwards.
 *
 * The login screen carries the page the visitor was trying to reach in a
 * `next` query parameter and hands it to `redirect()`. Anything in a query
 * parameter is written by whoever built the link, so `next` has to be checked
 * before it is followed: `/login?next=https://elsewhere.example` would
 * otherwise bounce an already-signed-in employee straight off the site, with
 * the company's own domain in the address bar right up to the moment it did.
 *
 * That matters more the moment month-end reminders start mailing people links
 * into the app every month, because the whole point of those links is to teach
 * people that clicking them is normal.
 *
 * Only a same-site path is allowed through. Everything else falls back to the
 * sheet rather than erroring - a broken link should land somewhere useful, not
 * on a page about the link.
 *
 * Pure and free of Next.js on purpose, so the rule can be tested directly.
 */

export const DEFAULT_DESTINATION = "/sheet";

/**
 * Control characters, which some URL parsers strip before resolving. Scanned
 * by code point rather than matched by a regular expression: a character
 * class holding literal control bytes is unreadable in a diff and is what
 * the no-control-regex lint rule exists to stop.
 */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeNext(next: string | null | undefined): string {
  if (!next) return DEFAULT_DESTINATION;

  // A protocol-relative URL ("//elsewhere.example/x") is an absolute URL
  // wearing the costume of a path, and is the classic way past a
  // startsWith("/") check used on its own.
  if (!next.startsWith("/") || next.startsWith("//")) return DEFAULT_DESTINATION;

  // Some browsers treat a backslash as a slash when resolving a URL, so a
  // path beginning "/\" can leave the site on those. Refuse it rather than
  // reason about which ones.
  if (next.includes("\\")) return DEFAULT_DESTINATION;

  // A stripped newline or tab turns a path back into an absolute URL, and
  // nothing this application generates contains one.
  if (hasControlCharacter(next)) return DEFAULT_DESTINATION;

  return next;
}
