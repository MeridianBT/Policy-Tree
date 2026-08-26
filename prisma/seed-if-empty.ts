/**
 * Seed a deployment that has no data yet, from inside the container.
 *
 * Exists because not every platform gives you a shell. Railway's `ssh` is
 * plan-dependent, and a locked-down corporate host may offer nothing at all -
 * which leaves a correctly deployed app with an empty database and no way in,
 * since there are no accounts to sign in with.
 *
 * The guard is the important part. `db:seed:uat` deletes and recreates its Ki,
 * so running it a second time would erase every figure anyone had keyed. This
 * checks for existing accounts first and does nothing at all if it finds any.
 * That makes SEED_ON_BOOT safe to leave set: it fills an empty database once
 * and is inert from then on.
 */

import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const users = await prisma.appUser.count();
  await prisma.$disconnect();

  if (users > 0) {
    console.log(
      `SEED_ON_BOOT: ${users} account${users === 1 ? "" : "s"} already exist — ` +
        "leaving the database untouched.",
    );
    return;
  }

  console.log("SEED_ON_BOOT: no accounts found, loading the demo dataset…");
  if (!process.env.SEED_PASSWORD) {
    console.warn(
      'SEED_ON_BOOT: SEED_PASSWORD is not set, so every account will use "hoshin" — ' +
        "which is published in this repository. Set it before sharing the URL.",
    );
  }
  // Importing runs the seed: seed-uat.ts invokes its own main() on load.
  await import("./uat/seed-uat.ts");
}

main().catch((error) => {
  console.error("SEED_ON_BOOT failed:", error);
  process.exit(1);
});
