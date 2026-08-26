import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness for a platform health check, and the first thing to curl when
 * something looks wrong.
 *
 * It touches the database on purpose. A process that is up but cannot reach
 * Postgres serves an error on every screen, so reporting it healthy would be
 * worse than useless - a deploy would go green while nobody could sign in.
 *
 * Deliberately says nothing about *why* it failed: this endpoint is
 * unauthenticated (it has to be, a health checker carries no cookie), and a
 * connection error can name the host, the database and the user. The detail
 * belongs in the container log, where it already is.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json({ status: "unhealthy" }, { status: 503 });
  }
}
