import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/config";
import { KiSwitcher } from "./KiSwitcher";
import { activeKiId } from "@/lib/ki/active";
import { NavLink } from "./NavLink";
import { AccountMenu } from "./AccountMenu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // A VIEWER has nothing to key in, so the outstanding badge is not theirs.
  const outstanding = user.role === "VIEWER" ? 0 : await countOutstanding(user.id);
  // Only ever set when somebody has pointed themselves at a year that is not
  // live; `activeKiId` returns nothing at all otherwise, roles included.
  const drafting = Boolean(await activeKiId());

  // One list, rendered as a row on a desktop and inside the menu on a phone,
  // so the two can never drift apart.
  const links = [
    { href: "/sheet", label: "Company sheet" },
    { href: "/cascade", label: "Cascade" },
    { href: "/rationale", label: "Definitions" },
    { href: "/insights", label: "Insights" },
    { href: "/my-entries", label: "My entries" },
    ...(user.role === "SUPER_ADMIN" ? [{ href: "/admin", label: "Admin" }] : []),
    // "/symbols" is deliberately absent. It renders each evaluation symbol
    // through every candidate font so a substitution on a new platform is
    // visible rather than assumed - a deployment check, not something a
    // director has any use for. The route still loads when typed, the same way
    // the Division view does, so IT can open it on a machine it is being rolled
    // out to. See DEPLOY.md.
  ];

  async function endSession() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-screen flex-col sm:h-full">
      <nav className="flex shrink-0 items-center gap-3 border-b border-rule-strong bg-paper px-3 py-1.5 sm:gap-4">
        <Link href="/sheet" className="shrink-0 text-[13px] font-semibold">
          Hoshin Kanri
        </Link>

        {/*
          On a phone the links plus the account block will not fit on one line,
          and nothing else on this screen is optimised for narrow. Rather than
          let them wrap into a wall, they collapse behind one menu. Somebody
          arriving cold from a reminder must never be stranded on whatever page
          they landed on.
        */}
        <details className="relative sm:hidden">
          <summary className="cursor-pointer list-none rounded-sm border border-rule px-2 py-1 text-[11px] text-ink-muted">
            Menu
            {outstanding > 0 && (
              <span className="num ml-1 rounded-sm bg-ink px-1 text-[10px] text-paper">{outstanding}</span>
            )}
          </summary>
          <div className="absolute left-0 top-full z-50 mt-1 w-56 border border-rule-strong bg-paper py-1 text-[12px] shadow-lg">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="block px-3 py-2 hover:bg-paper-sunken">
                {link.label}
                {link.href === "/my-entries" && outstanding > 0 && (
                  <span className="num ml-1 rounded-sm bg-ink px-1 text-[10px] text-paper">{outstanding}</span>
                )}
              </Link>
            ))}
          </div>
        </details>

        <div className="hidden items-center gap-1 text-[11px] sm:flex">
          {links.map((link) => (
            <NavLink key={link.href} href={link.href}>
              {link.label}
              {link.href === "/my-entries" && outstanding > 0 && (
                <span className="num ml-1 rounded-sm bg-ink px-1 text-[10px] text-paper">{outstanding}</span>
              )}
            </NavLink>
          ))}
        </div>

        {/*
          One control for the account, rather than five things in a row. The
          DRAFT YEAR badge is the one thing that must stay visible whatever is
          collapsed - working in a year nobody else is looking at is the mistake
          the switcher makes possible - so the switcher goes inside and its
          warning rides on the button.
        */}
        <div className="ml-auto flex items-center gap-2 text-[11px] text-ink-muted">
          <AccountMenu
            name={user.name}
            role={user.role}
            orgUnitCode={user.orgUnitCode}
            email={user.email}
            drafting={drafting}
            yearSwitcher={
              user.role === "SUPER_ADMIN" || user.role === "EXECUTIVE" ? <KiSwitcher /> : undefined
            }
            signOut={
              <form action={endSession}>
                <button
                  type="submit"
                  className="w-full rounded-sm border border-rule px-2 py-1 text-left text-[11px] text-ink hover:bg-paper-sunken"
                >
                  Sign out
                </button>
              </form>
            }
          />
        </div>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/**
 * Control Items this person is personally accountable for with no actual for
 * the open month. Deliberately "personal" and not "permitted": an admin may
 * key anything, but a badge claiming they owe thirty-one figures they do not
 * own is noise, and a badge people learn to ignore is worse than no badge.
 */
async function countOutstanding(userId: string): Promise<number> {
  const { outstandingForUser } = await import("@/lib/entries/query");
  try {
    const rows = await outstandingForUser(userId, { scope: "personal" });
    return rows.filter((row) => row.value === null).length;
  } catch {
    return 0;
  }
}
