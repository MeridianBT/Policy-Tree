/**
 * SUPER_ADMIN - everything, including the lock itself and any past year.
 * EXECUTIVE   - the company structure (Levels 1-3) and any unlocked figure,
 *               in the current Ki or a future one being built.
 * OWNER       - their own Level 4 branch and their own numbers.
 * VIEWER      - nothing.
 */
export type Role = "SUPER_ADMIN" | "EXECUTIVE" | "OWNER" | "VIEWER";

/** The shape every provider must produce, whatever it authenticates against. */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  orgUnitId: string | null;
  orgUnitCode: string | null;
}
