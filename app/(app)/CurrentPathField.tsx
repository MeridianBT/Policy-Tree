"use client";

import { usePathname } from "next/navigation";

/**
 * The path the year switcher was used on, carried in the form so the action
 * can send the browser back to it.
 *
 * The switcher itself is a server component and a server component has no
 * pathname, so this one hidden input is the whole reason for a client
 * boundary here.
 */
export function CurrentPathField() {
  const pathname = usePathname();
  return <input type="hidden" name="path" value={pathname} />;
}
