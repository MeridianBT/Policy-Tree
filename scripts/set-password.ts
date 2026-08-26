/**
 * Change an account's password, or rotate every password at once.
 *
 * This exists because `SEED_PASSWORD` only ever applies to an *empty*
 * database. `prisma/seed-if-empty.ts` refuses to touch a database that already
 * has accounts, which is what makes SEED_ON_BOOT safe to leave set - and which
 * also means that changing SEED_PASSWORD on a running deployment changes
 * nothing at all. The hashes were written once, at seed time. Advice to
 * "rotate SEED_PASSWORD before sharing the URL" is therefore false comfort
 * unless something actually rewrites them. This is that something.
 *
 *   npm run set-password -- --email=md@honda.example --password='…'
 *   npm run set-password -- --all --password='…'
 *
 * `--all` deliberately skips accounts that have no password at all: those are
 * invite-only through Microsoft, and handing them one would open a second way
 * in that nobody asked for. See lib/admin/rotate.ts.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { planRotate } from "../lib/admin/rotate.ts";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  const password = arg("password");
  const email = arg("email")?.toLowerCase();
  const all = process.argv.includes("--all");

  if (!password || password.length < 8) {
    throw new Error("Pass --password= with at least 8 characters.");
  }
  if (all === Boolean(email)) {
    throw new Error("Pass either --email= for one account or --all for every account, not both.");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const accounts = await prisma.appUser.findMany({
      where: email ? { email } : {},
      select: { id: true, email: true, passwordHash: true },
      orderBy: { email: "asc" },
    });

    if (accounts.length === 0) {
      throw new Error(email ? `No account with email ${email}.` : "There are no accounts.");
    }

    const plan = planRotate(accounts);

    // Naming one account explicitly is a decision, not a sweep: an admin
    // giving a specific invite-only account a password knows what they are
    // doing, so only --all applies the skip.
    const targets = email ? accounts : plan.change;

    if (targets.length === 0) {
      console.log("Every account signs in through Microsoft only. Nothing to change.");
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    await prisma.appUser.updateMany({
      where: { id: { in: targets.map((account) => account.id) } },
      data: { passwordHash: hash },
    });

    console.log(
      `Set the password on ${targets.length} account${targets.length === 1 ? "" : "s"}:`,
    );
    for (const account of targets) console.log(`  ${account.email}`);
    if (!email && plan.skipSsoOnly.length) {
      console.log(
        `\nLeft ${plan.skipSsoOnly.length} Microsoft-only account${
          plan.skipSsoOnly.length === 1 ? "" : "s"
        } alone (no password to rotate):`,
      );
      for (const account of plan.skipSsoOnly) console.log(`  ${account.email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
