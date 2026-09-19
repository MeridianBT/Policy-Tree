"use client";

import { Menu } from "@/components/ui/primitives";

/**
 * Who you are signed in as, and the two things you can do about it.
 *
 * The nav's right-hand side held five separate things - name, role, org unit,
 * the year switcher and Sign out - which is most of a toolbar spent on
 * something a reader consults once a session. Behind one button naming the
 * person, it costs a click and gives the width back to the pages.
 *
 * The year switcher and the sign-out form are passed in rather than built
 * here: both are server components carrying server actions, and a client
 * component can hold them as children without turning them into client code.
 * That is the whole reason this file is thin.
 *
 * `group` rather than `menu`: what is inside is two forms, and announcing a
 * menu would promise menu items that are not there.
 */
export function AccountMenu({
  name,
  role,
  orgUnitCode,
  email,
  yearSwitcher,
  signOut,
  drafting,
}: {
  name: string;
  role: string;
  orgUnitCode?: string | null;
  email?: string | null;
  /** The Ki switcher, when this person is allowed one. */
  yearSwitcher?: React.ReactNode;
  signOut: React.ReactNode;
  /** Whether this person is pointed at a year that is not the live one. */
  drafting?: boolean;
}) {
  /*
   * The one thing that must not go behind a click.
   *
   * Everything else here is consulted once a session, but "you are keying into
   * a year nobody else is looking at" has to be true on the screen at the
   * moment somebody types a figure - which is the mistake the year switcher
   * makes possible in the first place. So the switcher collapses and its
   * warning does not.
   */
  const badge = drafting ? (
    <span
      className="rounded-sm border px-1 py-0.5 text-[10px] font-medium"
      style={{ color: "#B3261E", borderColor: "#B3261E" }}
      title="You are not looking at the live year. Nobody else sees this."
    >
      DRAFT YEAR
    </span>
  ) : undefined;

  return (
    <Menu label={name} icon={badge} title={email ?? undefined} panelRole="group" width={240}>
      <div className="px-2 py-1.5 text-[11px] text-ink-muted">
        <div className="truncate text-ink">{name}</div>
        <div className="truncate">
          {role}
          {orgUnitCode ? ` · ${orgUnitCode}` : ""}
        </div>
        {email && <div className="truncate text-ink-faint">{email}</div>}
      </div>

      {yearSwitcher && (
        <div className="border-t border-rule px-2 py-1.5">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-faint">Year</div>
          {yearSwitcher}
        </div>
      )}

      <div className="border-t border-rule px-2 py-1.5">{signOut}</div>
    </Menu>
  );
}
