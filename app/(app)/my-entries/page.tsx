import { requireSession } from "@/lib/auth/session";
import { currentKiMonths, outstandingForUser } from "@/lib/entries/query";
import { MyEntries } from "./MyEntries";

export const dynamic = "force-dynamic";

export default async function MyEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireSession();
  const params = await searchParams;
  const { kiCode, months, openMonth } = await currentKiMonths();
  const period = params.period && months.includes(params.period) ? params.period : openMonth;
  const rows = await outstandingForUser(user.id, { period });

  return (
    <MyEntries
      rows={rows}
      kiCode={kiCode}
      months={months}
      period={period}
      canEdit={user.role !== "VIEWER"}
    />
  );
}
