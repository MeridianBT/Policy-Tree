"use client";

import Link from "next/link";
import { Bell, CircleUser, ClipboardList, Settings } from "lucide-react";
import { Menu, MENU_ITEM_CLASS } from "@/components/ui/primitives";

/**
 * Who you are signed in as, and the screens that are about you rather than
 * about the plan.
 *
 * The nav row is for the four screens people move between while reading the
 * plan. My entries is where you key your own figures and Settings is where you
 * set the place up: both are yours rather than the company's, and they sit here
 * with the account they belong to.
 *
 * The year switcher is deliberately *not* here. It is a control somebody sets
 * and then works under - the sheet beneath it means something different
 * depending on it - and that belongs in the bar where it can be seen without a
 * click. It was tried in this menu and taken back out.
 *
 * `group` rather than `menu`: what is inside is two links and a form, and
 * announcing a menu would promise menu items that are not all there.
 */
export function AccountMenu({
  name,
  role,
  orgUnitCode,
  email,
  outstanding = 0,
  adminHref,
  signOut,
}: {
  name: string;
  role: string;
  orgUnitCode?: string | null;
  email?: string | null;
  /** Figures this person owes for the open month. */
  outstanding?: number;
  /** Set only for somebody who may open Settings. */
  adminHref?: string;
  signOut: React.ReactNode;
}) {
  /*
   * A bell, not a number.
   *
   * The count used to sit beside My entries in the nav row, and moving the link
   * in here would have taken the nudge with it - a badge nobody sees until they
   * open a menu is not a badge. So the bell rides on the button and the number
   * waits inside, which keeps the bar quiet on the ordinary day when nothing is
   * due.
   *
   * Plain ink, deliberately: the five evaluation symbols carry this
   * application's entire colour budget, and a red bell would be a second
   * vocabulary for urgency. The count travels in the button's accessible name,
   * because a glyph on its own tells a screen reader nothing.
   */
  const icon = (
    <span className="flex items-center gap-1">
      {outstanding > 0 && (
        <>
          <Bell size={12} aria-hidden />
          <span className="sr-only">
            {outstanding} {outstanding === 1 ? "figure" : "figures"} due this month
          </span>
        </>
      )}
      <CircleUser size={13} aria-hidden />
    </span>
  );

  return (
    <Menu
      label={name}
      icon={icon}
      title={email ?? undefined}
      panelRole="group"
      width={240}
      // A phone has no room for a name beside the icons, and the icons are the
      // part that has to stay: this is the only way to My entries at that width.
      labelClassName="hidden sm:inline"
    >
      <div className="px-2 py-1.5 text-[11px] text-ink-muted">
        <div className="truncate text-ink">{name}</div>
        <div className="truncate">
          {role}
          {orgUnitCode ? ` · ${orgUnitCode}` : ""}
        </div>
        {email && <div className="truncate text-ink-faint">{email}</div>}
      </div>

      <div className="border-t border-rule py-0.5">
        {/*
          No `aria-current` on these. The nav marks the page you are on with
          exactly one mark, and a second one inside an open panel would be a
          second answer to "where am I".
        */}
        <Link href="/my-entries" className={MENU_ITEM_CLASS}>
          <ClipboardList size={12} />
          <span className="min-w-0 flex-1">My entries</span>
          {outstanding > 0 && (
            <span className="num rounded-sm bg-ink px-1 text-[10px] text-paper">{outstanding}</span>
          )}
        </Link>

        {adminHref && (
          <Link href={adminHref} className={MENU_ITEM_CLASS}>
            <Settings size={12} />
            <span className="min-w-0 flex-1">Settings</span>
          </Link>
        )}
      </div>

      <div className="border-t border-rule px-2 py-1.5">{signOut}</div>
    </Menu>
  );
}
