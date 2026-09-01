import type { Metadata } from "next";

export const metadata: Metadata = { title: "Hoshin Kanri — print" };

/**
 * The print route's layout, which deliberately renders no markup at all.
 *
 * It used to render its own `<html>` and `<body>`. Only a *root* layout may do
 * that, and this one is nested under `app/layout.tsx`, so what reached the
 * browser was an `<html>` inside a `<body>` - which no browser will build. The
 * DOM the client constructed therefore differed from the HTML the server sent,
 * and every print page hydrated with "some attributes of the server rendered
 * HTML didn't match the client properties", followed by React complaining that
 * a second `<html>` was mounting before the first had unmounted.
 *
 * What those tags were really for was escaping the app shell - a white page
 * that flows, rather than a fixed-height frame with its own scrolling panes.
 * That is a stylesheet's job, and print.css does it now against the body the
 * root layout owns.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return children;
}
