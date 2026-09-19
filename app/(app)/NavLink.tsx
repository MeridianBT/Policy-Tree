"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * A nav link that knows whether you are on it.
 *
 * Nothing marked the current screen before this: seven links, all identical,
 * so the only way to tell where you were was to read the page. The active
 * state is the visual half and `aria-current="page"` is the other - a screen
 * reader announces it, and it is the thing that makes the nav a map rather
 * than a list.
 *
 * A client component for the same reason `CurrentPathField` is one: a server
 * component has no pathname. The layout stays a server component around it.
 *
 * `startsWith` rather than equality, so a detail screen keeps its section lit:
 * /control-item/… belongs to the sheet the reader came from. The root path is
 * matched exactly, or it would light on every page.
 */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-sm px-2 py-1 ${
        active ? "bg-paper-sunken font-medium text-ink" : "text-ink-muted hover:bg-paper-sunken"
      }`}
    >
      {children}
    </Link>
  );
}
