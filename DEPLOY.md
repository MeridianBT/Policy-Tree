# Deploying to Railway

A hosted demo: a real URL you can send people, so a leadership team can click
through it and a colleague can key a number without installing anything.

This is a **pilot deployment**, not the production one. It puts your company's
real division names on the public internet behind a shared password. Read
*Before you send the link to anyone* at the bottom before you do.

For the production path — Azure, Microsoft sign-in, an internal-only endpoint —
see the IT brief instead.

## What Railway needs from you

One repository and one database. The image builds from the `Dockerfile` at the
repo root; migrations apply themselves on every boot, so there is no separate
migration step to run or sequence.

## 1 · Create the project

In Railway: **New Project → Deploy from GitHub repo**, and pick
`MeridianBT/Policy-Tree`. You will be asked to authorise Railway against the
GitHub organisation the first time.

Railway sees the `Dockerfile` and builds from it. The first build takes several
minutes; later ones are much faster.

It will fail the first time. That is expected — there is no database yet.

## 2 · Add PostgreSQL

In the same project: **New → Database → Add PostgreSQL**.

Railway creates it with its own credentials and exposes them as variables on
that service. You never type a password.

## 3 · Set the variables

On the **app** service (not the database), add these:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — type it exactly, braces included |
| `AUTH_SECRET` | A long random string. `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | `true` |
| `AUTH_ALLOW_PASSWORD` | `true` |
| `APP_URL` | The public URL from step 4 |

`${{Postgres.DATABASE_URL}}` is a reference, not a paste: Railway resolves it
to the database's internal address at deploy time, so the two services talk
over Railway's private network rather than the public internet. If the database
service is named something other than `Postgres`, use that name instead.

`AUTH_ALLOW_PASSWORD` matters. The image runs in production mode, where
password sign-in is off by default and Microsoft is the only way in — and
Microsoft is not configured yet. Without this you get a sign-in screen you
cannot get past.

**Set only the five variables above.** Do not paste the rest of
`.env.example` in: its Microsoft and Graph entries are angle-bracketed
placeholders, and a half-configured Entra provider used to take the whole
login screen down. The app now ignores placeholder values, but leaving them
set still buys you nothing.

## 4 · Give it a URL

App service → **Settings → Networking → Generate Domain**.

You get something like `policy-tree-production.up.railway.app`. Put it in
`APP_URL` (with `https://`) and redeploy. Reminder emails link to whatever is
in `APP_URL`, so a wrong value sends people to the wrong host.

## 5 · Check it is alive

```bash
curl https://<your-domain>/api/health
```

`{"status":"ok"}` means the app is up *and* can reach the database. A 503 means
it is running but the database is not reachable — check `DATABASE_URL`.

Point Railway's health check at `/api/health` too (Settings → Deploy), so a
broken deploy is caught rather than going green.

### One check the health endpoint cannot make

The five evaluation symbols — □ ◎ 〇 ▲ ■ — are CJK-adjacent, and several have
emoji presentation forms. A font substitution on one platform turns the column
that carries the whole plan's meaning into boxes or coloured pictures, and
nothing errors: the page is up, the database is fine, and the sheet is nonsense.

Open **`/symbols`** on each platform you deploy to and on the machines people
will actually read this on. It renders every symbol through the application's
own font stack and then through each candidate face alone, so a substitution is
visible rather than assumed.

It is deliberately **not on the menu** — nobody using the plan needs it — so
type the path. `npm run check:symbols` performs the same check automatically
against whatever browser is available.

## 6 · Load the demo data

The database is empty until you seed it. Migrations create the tables; they
do not create a plan, and with no accounts there is nothing to sign in with.

**The easy way — no shell needed.** Set two more variables on the app service:

| Variable | Value |
|---|---|
| `SEED_ON_BOOT` | `uat` |
| `SEED_PASSWORD` | Something only your team knows |

Redeploy. The container seeds itself on the way up, and the deploy log says so:

```
SEED_ON_BOOT: no accounts found, loading the demo dataset…
  org units:      45
  103KI:         72 rows, 82 Control Items, 2296 figures
```

`SEED_ON_BOOT` is safe to leave set. It checks for existing accounts first and
does nothing at all if it finds any — which matters, because the seed deletes
and recreates its Ki, so an unguarded second run would erase every figure
anyone had keyed. On later boots the log reads:

```
SEED_ON_BOOT: 14 accounts already exist — leaving the database untouched.
```

To re-seed deliberately, empty the year from Admin first, or drop the database.

**`SEED_PASSWORD` only applies to an empty database.** The guard above is what
makes `SEED_ON_BOOT` safe to leave set, and it has a consequence worth being
explicit about: once the accounts exist, their password hashes are written and
changing `SEED_PASSWORD` on the platform does nothing at all. To actually
change a password on a running deployment, rewrite the hash:

```bash
npm run set-password -- --email=md@honda.example --password='…'
npm run set-password -- --all --password='…'
```

`--all` skips accounts that have no password, because those are invite-only
through Microsoft and handing them one would open a second way in. Run it
wherever `DATABASE_URL` points at the deployment - `railway ssh`, or your own
machine against `DATABASE_PUBLIC_URL`.

**The other way — a shell**, if you have one and prefer it:

```bash
railway ssh
SEED_PASSWORD='…' npm run db:seed:uat
```

Or from your own machine, against the Postgres service's `DATABASE_PUBLIC_URL`
(the public one — the `railway.internal` address does not resolve off-platform):

```bash
git clone https://github.com/MeridianBT/Policy-Tree.git
cd Policy-Tree && npm install
DATABASE_URL='<DATABASE_PUBLIC_URL>' SEED_PASSWORD='…' npm run db:seed:uat
```

## 7 · Sign in

`https://<your-domain>` — `md@honda.example` and the password you chose.

The full account list is in [prisma/uat/README.md](prisma/uat/README.md).

## Upgrading a deployment that is already running

Redeploy and the entrypoint applies any pending migrations before the app
listens, so most upgrades need nothing from you. One of them changes data
rather than schema and is worth knowing about.

**`20260901090000_relink_level_4_under_level_3`.** A Level 4 department branch
ladders from a Level 3 and only from a Level 3. Plans created before that rule
was enforced have Level 4 rows hanging straight off a Level 2, which leaves
them awkward in two visible ways: **L4+** is offered on Level 3 rows only, so a
department cannot add a sibling branch where it already has one; and siblings
order by `sort_order` alone now, so a Level 2 holding rows of two levels
interleaves them and a new branch looks like it landed somewhere down the list.

The migration inserts the missing Level 3 under each affected Level 2 and moves
that Level 2's branches onto it. **Nothing is deleted** - every node, Control
Item, figure and owner survives, and each branch keeps its place in the reading
order. It is a no-op on any plan that is already legal, so a fresh deployment
never notices it.

The new Level 3 repeats its Level 2's statement, because the company's wording
for a deployment it never wrote down is not in the database and inventing one
would put words into the plan that nobody chose. Rename it on the sheet to
whatever the team would rather it said.

To confirm afterwards - this should return no rows:

```sql
SELECT c.level AS child, p.level AS parent, count(*)
FROM node c JOIN node p ON p.id = c.parent_id
WHERE c.level <> p.level + 1 OR (c.level = 4 AND p.level <> 3)
GROUP BY 1, 2;
```

Reseeding instead of migrating is the other way, and it is destructive: the
seed deletes and recreates its Ki, so every figure keyed against 103KI and
104KI goes. Accounts, org units and business units survive. If you do reseed,
set `SEED_PASSWORD` on the command - the seeder writes it to every account and
falls back to `hoshin` when it is unset, which on a public URL undoes the whole
of the lock:

```bash
railway ssh
SEED_PASSWORD='…' npm run db:seed:uat
```

## Patching

Nothing is patched in place. The application is one stateless image and a
database, so a patch is a rebuild and a redeploy. Three layers move
independently:

| Layer | What moves | Who |
|---|---|---|
| `node:22-bookworm-slim` | Debian and Node patch releases. Pinned **by tag, not digest**, so a rebuild picks them up — **a scheduled rebuild is the OS patching**. The trade is reproducibility: two builds of one commit are not byte-identical. | you, by rebuilding |
| npm dependencies | Ranges over a committed `package-lock.json`. `npm ci` installs the lockfile exactly, so nothing moves until someone runs an update and commits it. | you, deliberately |
| PostgreSQL | Minor and patch versions. | the managed service |

What makes a bump safe is `npm run build` (linter and type-checker as well as
the compiler) plus `npx vitest run`. Monthly rebuilds, out-of-band for anything
critical.

### Reading `npm audit` on this repository

It currently reports nine advisories. Two of them cannot fire here at all:
`mysql2` rides along inside Prisma's tree and this app is PostgreSQL, and
`sharp` is Next's image optimiser, which is unused — `next/image` appears
nowhere. Triage by reachability before severity, or a review spends its time on
findings with no path to them.

**Do not run `npm audit fix --force` here.** Every remedy it offers is flagged
breaking and two are *downgrades*: it proposes Prisma 6.19.3 against the 7.9.1
in use, and exceljs 3.4.0 against 4.4.0. It is picking a version whose tree
lacks the advisory, not a patched one.

`npm audit` cannot see the Debian layer. Image scanning — Trivy, or Defender for
Containers — is the other half, and belongs in whatever pipeline builds this.

### What the image contains

The runtime layer does its own `npm ci --omit=dev`: 245 packages rather than the
503 the build needs. The three packages the container itself runs — `prisma`
for migrations on boot, `tsx` and `dotenv` for `SEED_ON_BOOT` and
`npm run set-password` — are declared as dependencies rather than
devDependencies, which is what makes the prune safe.
Measured before that change: `tsx` vanished under `--omit=dev` while `prisma`
and `dotenv` survived only by arriving under `@prisma/client`. On the demo, the
pushed image went from 417 MB to 365 MB across that one commit, and the boot log
still shows migrations applying and the seed check running — which is the proof
that the pruned tree still carries what the entrypoint needs.

**It still runs as root, and should not.** The base image ships a `node` user
at uid 1000 and the change is three lines, but it has not shipped because it
could not be tested where it was written — and the way it fails is the container
starting and then finding it cannot write somewhere, which surfaces on the first
request rather than at build time. Worth doing from anywhere a `docker build`
actually runs.

## Before you send the link to anyone

**The URL is public and the password is shared.** There is no IP restriction,
no MFA and no invite check on the password path — the whole lock is one
password that every demo account shares. Anyone who has it, or guesses it, sees
the plan.

That matters more than usual here, because the divisions and departments in
this dataset are your real org chart. The numbers are invented, but nothing on
the screen says so, and a reader has no way to tell.

So:

- **Set `SEED_PASSWORD` before the first boot.** Do not deploy with `hoshin`,
  which is in this repository and in every document written about it. If the
  database is already seeded, setting the variable changes nothing — use
  `npm run set-password -- --all --password='…'` instead.
- **Change it again if it has been written down anywhere** — pasted into a
  chat, a ticket or a transcript. Same command.
- **Say the numbers are invented**, out loud, when you demo. Being real about
  the structure is what makes the figures beside it look real.
- **Take it down when the demo is over.** Railway → Settings → Delete Service.
- Treat it as a pilot. Real deployment means Microsoft sign-in, a private
  endpoint and IT's own hosting — the IT brief covers that.

## Running costs

One small app container and one small Postgres. On Railway's usage-based
pricing that is a few dollars a month for something this size, and the app
sleeps when idle if you let it. Check current pricing before assuming.

## When something is wrong

**Build fails immediately.** Check Railway is building from the `Dockerfile`
rather than trying to detect the framework.

**App boots then crashes.** Almost always `DATABASE_URL`. It must be the
reference `${{Postgres.DATABASE_URL}}`, not a pasted value that may rotate.

**Sign-in screen with only a Microsoft button.** `AUTH_ALLOW_PASSWORD` is not
set to `true` on the app service.

**Sign-in fails for every account.** The database was never seeded — step 6.

**Everything loads but the sheet is empty.** Seeded, but into a different
database than the app is using. Check both point at the same service.
