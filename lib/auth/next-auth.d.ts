import type { Role } from "./types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: Role;
      orgUnitId: string | null;
      orgUnitCode: string | null;
    };
  }
}
