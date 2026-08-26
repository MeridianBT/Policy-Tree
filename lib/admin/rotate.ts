/**
 * Which accounts a bulk password rotate touches.
 *
 * The rule that matters: an account created with no password at all is
 * invite-only through Microsoft, and giving it one during a rotate would
 * quietly open a second way in that nobody asked for - exactly the thing
 * `passwordSignInEnabled()` exists to prevent in production. A rotate changes
 * passwords that already exist; it never issues new ones.
 *
 * Pure, so the rule can be tested without a database standing behind it.
 */

export interface RotatableAccount {
  id: string;
  email: string;
  passwordHash: string | null;
}

export interface RotatePlan<T extends RotatableAccount> {
  change: T[];
  /** Accounts left alone because they sign in through Microsoft only. */
  skipSsoOnly: T[];
}

export function planRotate<T extends RotatableAccount>(accounts: readonly T[]): RotatePlan<T> {
  const change: T[] = [];
  const skipSsoOnly: T[] = [];
  for (const account of accounts) {
    if (account.passwordHash === null) skipSsoOnly.push(account);
    else change.push(account);
  }
  return { change, skipSsoOnly };
}
