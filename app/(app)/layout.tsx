import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { KiSwitcher } from "./KiSwitcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [divisions, outstanding] = await Promise.all([
    prisma.orgUnit.findMany({ where: { type: "DIVISION" }, orderBy: { sortOrder: "asc" } }),
    // A VIEWER has nothing to key in, so the outstanding badge is not theirs.
    user.role === "VIEWER" ? Promise.resolve(0) : countOutstanding(user.id),
  ]);

  async function endSession() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex h-full flex-col">
      <nav className="flex shrink-0 items-center gap-4 border-b border-rule-strong bg-paper px-3 py-1.5">
        <Link href="/sheet" className="text-[13px] font-semibold">
          Hoshin Kanri
        </Link>

        <div className="flex items-center gap-1 text-[11px]">
          <NavLink href="/sheet">Company sheet</NavLink>
          <NavLink href="/cascade">Cascade</NavLink>
          <NavLink href="/insights">Insights</NavLink>
          <NavLink href="/my-entries">
            My entries
            {outstanding > 0 && (
              <span className="num ml-1 rounded-sm bg-ink px-1 text-[10px] text-paper">{outstanding}</span>
            )}
          </NavLink>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-sm px-2 py-1 text-ink-muted hover:bg-paper-sunken">
              Divisions
            </summary>
            <div className="absolute left-0 top-full z-50 mt-1 w-44 border border-rule-strong bg-paper py-1 shadow-lg">
              {divisions.map((division) => (
                <Link
                  key={division.id}
                  href={`/division/${division.code}`}
                  className="block px-2 py-1 hover:bg-paper-sunken"
                >
                  {division.code} — {division.name}
                </Link>
              ))}
            </div>
          </details>
          {user.role === "ADMIN" && <NavLink href="/admin">Admin</NavLink>}
          <NavLink href="/symbols">Symbols</NavLink>
        </div>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-ink-muted">
          {user.role === "ADMIN" && <KiSwitcher />}
          <span title={user.email}>
            {user.name} · {user.role}
            {user.orgUnitCode ? ` · ${user.orgUnitCode}` : ""}
          </span>
          <form action={endSession}>
            <button type="submit" className="rounded-sm border border-rule px-2 py-1 hover:bg-paper-sunken">
              Sign out
            </button>
          </form>
        </div>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-sm px-2 py-1 text-ink-muted hover:bg-paper-sunken">
      {children}
    </Link>
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
