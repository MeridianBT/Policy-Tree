/**
 * The app shell is measured against the viewport you can actually see.
 *
 * Found on an iPad. The nav sat underneath Safari's tab bar, off the top of the
 * screen, with no way to pull it back down.
 *
 * The cause is one CSS unit. Safari's `vh` is the *large* viewport - the page
 * as it would be if the browser's chrome were collapsed - so a body of
 * `height: 100vh` stands a tab bar taller than the screen it is on. The
 * document scrolls by that difference, and because the body hides its own
 * overflow and every pane inside it scrolls separately, nothing the reader does
 * scrolls it back. `svh` is the same measurement taken with the chrome showing,
 * which is never taller than what you can see.
 *
 * No browser check can catch a regression here, which is why this file exists:
 * Chromium has no collapsible chrome, so `vh`, `svh` and `dvh` are all the same
 * number in Playwright and a screen that is broken on an iPad passes every
 * assertion in scripts/ui-check.cjs. The units themselves are the evidence, so
 * the units are what this reads.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  readFileSync(new URL("../" + relative, import.meta.url), "utf8");

/** The `className` of the first element in a file matching a marker. */
function classesOf(source: string, marker: string): string {
  const at = source.indexOf(marker);
  expect(at, `${marker} is no longer in this file`).toBeGreaterThan(-1);
  const match = /className="([^"]+)"/.exec(source.slice(at));
  expect(match, `${marker} carries no className`).not.toBeNull();
  return match![1];
}

describe("the app shell's height", () => {
  it("sizes the fixed frame in svh, never in vh", () => {
    const classes = classesOf(read("app/layout.tsx"), "<body");
    expect(classes).toContain("sm:h-svh");
    // `h-screen` and `min-h-screen` are Tailwind for `100vh`, which is the bug.
    expect(classes).not.toMatch(/(^|\s|:)h-screen\b/);
    expect(classes).not.toMatch(/(^|\s|:)min-h-screen\b/);
    // Below `sm` the page scrolls, so the frame is a floor rather than a height.
    expect(classes).toContain("min-h-dvh");
    expect(classes).toContain("sm:overflow-hidden");
  });

  it("puts no minimum height inside that frame", () => {
    // A minimum taller than the body would push the bottom of the column out
    // of a frame that hides its overflow.
    const classes = classesOf(read("app/(app)/layout.tsx"), "return (");
    expect(classes).toContain("sm:h-full");
    expect(classes).toContain("sm:min-h-0");
    expect(classes).not.toMatch(/(^|\s|:)min-h-screen\b/);
  });

  it("pins the document above sm, so no scroll can carry the nav away", () => {
    const css = read("app/globals.css");
    const pin = /@media \(min-width: 40rem\) \{\s*html \{([^}]*)\}/.exec(css);
    expect(pin, "globals.css no longer pins html above sm").not.toBeNull();
    expect(pin![1]).toContain("overflow: hidden");
  });

  it("releases the document again on the routes that print", () => {
    // A pinned root would clip a sheet that has to flow down the page, exactly
    // as the sized body did before print.css undid it.
    for (const [file, marker] of [
      ["app/print/print.css", ".print-sheet"],
      ["app/print/slide/slide.css", ".print-slide"],
    ] as const) {
      const css = read(file);
      expect(css, file).toContain(`html:has(${marker})`);
      expect(css, file).toContain(`body:has(${marker})`);
    }
  });
});
