/**
 * Who is accountable for what, as pure functions over rows already fetched.
 *
 * Free of Prisma on purpose - the rule that decides whose inbox a reminder
 * lands in is the part most worth testing, and it should not need a database
 * to exercise. `lib/reminders/recipients.ts` does the fetching and calls in
 * here.
 */

export interface OutstandingItem {
  controlItemId: string;
  code: string;
  name: string;
  dicCode: string;
  objective: string;
}

/** A Control Item still missing its actual, with the facts needed to route it. */
export interface UnkeyedItem extends OutstandingItem {
  dicOrgUnitId: string;
  responsibleUserId: string | null;
}

export interface CandidateUser {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "EXECUTIVE" | "OWNER" | "VIEWER";
  orgUnitId: string | null;
  /**
   * True when this person's org unit is the company itself, rather than a
   * division or department. Covering the whole company is an administrative
   * fact, not a personal to-do list - see `assignRecipients`.
   */
  atCompanyRoot: boolean;
  /** Every org unit this person covers: their own and everything beneath it. */
  covers: string[];
}

export interface Recipient {
  userId: string;
  name: string;
  email: string;
  items: OutstandingItem[];
}

/**
 * Match unkeyed items to the people accountable for them.
 *
 * Naming somebody responsible *narrows* the chase to them. A measure with a
 * named person reaches that person and not their division lead; a measure
 * with nobody named falls back to org-unit coverage, which is what makes a
 * lead answerable for everything in their division that has not been
 * delegated. Without the narrowing, naming someone would only ever add mail
 * rather than move responsibility, and a lead would keep receiving a chase
 * for every measure in their division - the surest way to teach them to
 * filter these to trash.
 *
 * The one exception is a named person who is no longer active. They are not
 * among the candidates at all, so the fallback applies and their lead is
 * chased instead. A measure must not go quiet because somebody left.
 *
 * Two exclusions keep this from becoming noise, and both were found by
 * running it against real data rather than reasoned about in advance:
 *
 * A VIEWER is never reminded. They attend the review and key nothing, so
 * there is no figure a reminder could ask them for. The nav badge already
 * takes the same line.
 *
 * Someone whose org unit is the company itself is reminded only about
 * measures they are *named* responsible for, never by coverage. The company
 * root covers every division, so coverage there means "all 31 measures" -
 * true, and useless as a to-do list. This is the case an ADMIN normally
 * falls into: they administer the plan, they do not personally key it.
 */
export function assignRecipients(
  items: readonly UnkeyedItem[],
  users: readonly CandidateUser[],
): Recipient[] {
  const out: Recipient[] = [];

  // Which items have a named person who could actually receive the mail. A
  // name pointing at a deactivated account is treated as no name at all, so
  // the org-unit fallback catches it.
  const activeIds = new Set(users.map((user) => user.id));
  const namedAndActive = new Set(
    items
      .filter((item) => item.responsibleUserId && activeIds.has(item.responsibleUserId))
      .map((item) => item.controlItemId),
  );

  for (const user of users) {
    if (user.role === "VIEWER") continue;

    const covered = new Set(user.atCompanyRoot ? [] : user.covers);
    const mine = items.filter((item) =>
      namedAndActive.has(item.controlItemId)
        ? item.responsibleUserId === user.id
        : covered.has(item.dicOrgUnitId),
    );
    if (mine.length === 0) continue;
    out.push({
      userId: user.id,
      name: user.name,
      email: user.email,
      items: mine.map(({ controlItemId, code, name, dicCode, objective }) => ({
        controlItemId,
        code,
        name,
        dicCode,
        objective,
      })),
    });
  }

  return out;
}

/**
 * An org unit and everything beneath it, from rows already in memory.
 *
 * `lib/auth/permissions.ts` has the same walk against the database, which is
 * right for a single request; a reminder run resolves this for every user at
 * once and must not go back to the database per person.
 */
export function subtreeOf(
  rootId: string,
  units: readonly { id: string; parentId: string | null }[],
): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const unit of units) {
    if (!unit.parentId) continue;
    const siblings = childrenOf.get(unit.parentId);
    if (siblings) siblings.push(unit.id);
    else childrenOf.set(unit.parentId, [unit.id]);
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    // A cycle would otherwise hang the run; the tree should never have one,
    // but this walk is not the place to find that out the hard way.
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return ids;
}
