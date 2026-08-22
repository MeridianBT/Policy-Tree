/**
 * The thin internal auth module. Application code - screens, server actions,
 * route handlers - imports only from here and never from next-auth directly,
 * so swapping the identity provider touches lib/auth/providers.ts and nothing
 * else.
 *
 * Permissions are enforced on the server, on every mutation. The UI hiding a
 * control is a courtesy, never a control.
 */

import { auth } from "./config";
import { NotAuthenticatedError, NotPermittedError } from "./errors";
import type { AuthenticatedUser, Role } from "./types";

export type { AuthenticatedUser, Role };
export { NotAuthenticatedError, NotPermittedError };
export {
  canEditControlItem,
  canEditStructureAt,
  assignableOrgUnitIds,
  orgUnitCovers,
  orgUnitSubtree,
} from "./permissions";

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
    orgUnitId: session.user.orgUnitId,
    orgUnitCode: session.user.orgUnitCode,
  };
}

export async function requireSession(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) throw new NotAuthenticatedError();
  return user;
}

export async function requireRole(...roles: Role[]): Promise<AuthenticatedUser> {
  const user = await requireSession();
  if (!roles.includes(user.role)) {
    throw new NotPermittedError(`This action needs the ${roles.join(" or ")} role.`);
  }
  return user;
}
