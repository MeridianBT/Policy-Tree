/**
 * Which year "My entries" keys into when somebody is pointed at another one.
 *
 * The year switcher lets a SUPER_ADMIN or an EXECUTIVE work on a Ki that is not
 * the live one, and every screen that *reads* the plan follows it. This screen
 * is different, because it keys **actuals** - figures for months that have
 * already happened - and that makes the switcher awkward rather than simply
 * applicable:
 *
 * - **Backwards is meaningful.** A prior year has actuals, and somebody there
 *   is correcting the record. Only a SUPER_ADMIN can reach a prior year
 *   (`selectableKis`) and only a SUPER_ADMIN may write into one
 *   (`canEditInKi`), so the people who can go there are exactly the people who
 *   may key there.
 * - **Forwards is empty.** A year that has not started has no month whose
 *   actual could exist. Following the switcher there would offer a screenful of
 *   boxes for figures that cannot be known yet.
 *
 * So: follow it backwards, hold the live year forwards - and say so on the
 * screen when the answer is not the year the switcher shows, because a page
 * that quietly disagrees with the control above it is worse than one that
 * explains.
 *
 * "Not prior" covers one case besides a draft ahead: a Ki starting on the same
 * day as the live one, which the seed data happens to contain. Its months have
 * happened, so the screen must not tell it there is nothing to key yet - which
 * is why the line it shows states where actuals go rather than guessing why.
 *
 * Pure, and separate from the Prisma that feeds it, for the reason
 * `lib/reminders/match.ts` gives: the rule is the part worth reading and
 * testing, and it should not need a database to exercise.
 */

export interface KeyingChoice<T> {
  /** The Ki to key into. Null only when the deployment has no Ki at all. */
  ki: T | null;
  /**
   * True when this is the switcher's choice rather than the live year. False
   * when they coincide *and* when the switcher was overruled - the caller
   * tells those apart by whether a choice was offered in the first place.
   */
  followed: boolean;
}

export function kiToKeyInto<T>(input: {
  /** The Ki the company is running. */
  live: T | null;
  /** The Ki the switcher points at, or null when it points at the live one. */
  chosen: T | null;
  /** Whether `chosen` started before `live`. Meaningless when chosen is null. */
  chosenIsPrior: boolean;
}): KeyingChoice<T> {
  if (!input.chosen) return { ki: input.live, followed: false };
  if (input.chosenIsPrior) return { ki: input.chosen, followed: true };
  // A draft year ahead of the live one: nothing has happened in it yet.
  return { ki: input.live, followed: false };
}
