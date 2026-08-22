export type Role = "ADMIN" | "OWNER" | "VIEWER";

/** The shape every provider must produce, whatever it authenticates against. */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  orgUnitId: string | null;
  orgUnitCode: string | null;
}
