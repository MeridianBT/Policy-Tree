/**
 * Where a sign-in may send someone.
 *
 * Every case here is a way past a naive `startsWith("/")` guard, which is what
 * makes them worth pinning: the failure is silent, looks like a working link,
 * and only shows itself once the visitor is on somebody else's domain.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_DESTINATION, safeNext } from "@/lib/auth/next-path";

describe("safeNext", () => {
  it("lets an ordinary in-app path through, query string and all", () => {
    // The query string is the point: it carries the month a reminder is
    // chasing, and dropping it lands people on the wrong one.
    expect(safeNext("/my-entries")).toBe("/my-entries");
    expect(safeNext("/my-entries?period=2026-08")).toBe("/my-entries?period=2026-08");
    expect(safeNext("/control-item/abc123")).toBe("/control-item/abc123");
  });

  it("falls back to the sheet when there is no destination", () => {
    expect(safeNext(null)).toBe(DEFAULT_DESTINATION);
    expect(safeNext(undefined)).toBe(DEFAULT_DESTINATION);
    expect(safeNext("")).toBe(DEFAULT_DESTINATION);
  });

  it("refuses an absolute URL", () => {
    expect(safeNext("https://elsewhere.example/x")).toBe(DEFAULT_DESTINATION);
    expect(safeNext("http://elsewhere.example")).toBe(DEFAULT_DESTINATION);
    expect(safeNext("javascript:alert(1)")).toBe(DEFAULT_DESTINATION);
  });

  it("refuses a protocol-relative URL", () => {
    // An absolute URL wearing the costume of a path, and the classic way past
    // a startsWith("/") check used on its own.
    expect(safeNext("//elsewhere.example/x")).toBe(DEFAULT_DESTINATION);
  });

  it("refuses a backslash, which some browsers resolve as a slash", () => {
    expect(safeNext("/\\elsewhere.example")).toBe(DEFAULT_DESTINATION);
    expect(safeNext("\\\\elsewhere.example")).toBe(DEFAULT_DESTINATION);
  });

  it("refuses control characters some parsers strip before resolving", () => {
    // A stripped newline turns the path back into an absolute URL.
    expect(safeNext("/\nhttps://elsewhere.example")).toBe(DEFAULT_DESTINATION);
    expect(safeNext("/\tfoo")).toBe(DEFAULT_DESTINATION);
    expect(safeNext("/\u0000foo")).toBe(DEFAULT_DESTINATION);
  });
});
