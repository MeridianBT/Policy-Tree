# Quickstart

Getting the platform running on your own machine, signing in, and checking it
actually works. About twenty minutes, most of it waiting for a Docker build.

For what the thing *is* and why it is built the way it is, read
[README.md](README.md). To put it on a real URL for a demo, read
[DEPLOY.md](DEPLOY.md). This file is only concerned with running it locally.

## What you need

A computer — not a tablet. This is a Next.js server talking to PostgreSQL, so
there is no version of it that runs in Safari on an iPad.

Either:

- **Docker Desktop** — the easy path, and the one below, or
- **Node 22 and PostgreSQL 16** if you would rather run it on the host.

## Run it

```bash
cp .env.example .env
# open .env and set AUTH_SECRET — generate one with: openssl rand -base64 32

docker compose up --build       # app on :3000, Postgres on :5432
```

Database migrations run automatically every time the container boots
(`docker/entrypoint.sh`), so there is no separate migrate step. Once it is up,
load a dataset. There are two, and which one you want depends on why you are
here:

```bash
# Showing this to a leadership team — a fictitious Australian automotive
# distributor, 5 Goals, 54 Control Items, 103KI live and 104KI ready to start.
docker compose exec app npm run db:seed:uat

# Kicking the tyres on the mechanics — the smaller worked example,
# Ki 2026, six divisions, 31 Control Items.
docker compose exec app npm run db:seed
```

Pick one. Running both leaves two sets of divisions in the DIC picker, which
looks like a bug in a demo and is not one — see
[prisma/uat/README.md](prisma/uat/README.md) if you need both.

Then open **http://localhost:3000**.

### About the two sign-in options

The Compose file is for local evaluation, so it switches email/password
sign-in on for you — otherwise the first thing you would meet is a screen you
could not get past, because the only other option is Microsoft and Microsoft
is not configured yet.

Microsoft sign-in will not work until IT issues an Entra app registration —
see *Signing in with Microsoft* in the README. Everything else works fully
offline. A real deployment sets `AUTH_ALLOW_PASSWORD=false` and signs in
through Microsoft only.

## Sign in

Every seeded account uses the password `hoshin`, in both datasets.

The demo dataset's fourteen accounts are listed in
[prisma/uat/README.md](prisma/uat/README.md) — start with
`md@driveaus.example`. The worked example uses these:

| Email | Role | Worth signing in as, to see |
|---|---|---|
| `admin@example.com` | ADMIN | Everything: structure editing at all four levels, the Admin panel |
| `auto.lead@example.com` | OWNER · AUTO division | A division lead — can key their own departments, can only add at Level 4 |
| `dealer.lead@example.com` | OWNER · AUTO-SALES dept | The same role scoped to one department, so noticeably narrower |
| `viewer@example.com` | VIEWER | Read-only. No entry screen, no edit controls, no reminders |

Signing in as the two OWNERs one after the other is the quickest way to see the
permission model rather than take the README's word for it.

## Have a look around

A walkthrough that touches every part of the platform.

**1 · The sheet** — `/sheet`

The operating grid, and where a quarterly review actually happens. Switch
**Target** between OB, PRB and 1QFC: the actuals never move, only what they are
measured against, so achievement percentages and symbols change with the
version. Tap a quarter heading to fold its three months away. Switch
**View → + Departments** to fold every Level 4 branch in under the objective it
ladders into.

**2 · The cascade** — `/cascade`

Every Company Goal down to the department work beneath it, on one page. The
thing to look at is the *gaps*: objectives showing "nothing yet ladders in
here" are the point of the page, not a rendering fault.

**3 · Insights** — `/insights`

Symbol distribution per division per month. The later months are empty because
neither dataset keys actuals for the whole Ki — the demo dataset stops after
July, the worked example after September. That is the "nothing keyed yet" state
rendering correctly, not a gap in the page.

**4 · The rationale register** — `/rationale`

What each measure counts and why its target is that number, one block per
measure. On a fresh database everything reads "Not recorded", which is the
honest state and the reason the page opens with a count of how many. Press
**Nothing recorded** to narrow to them, then write one: a definition is edited
and replaced by its newest version, a rationale is *added* as a dated entry
under your name. Nothing here is ever overwritten — a revised definition keeps
the one before it behind "earlier versions", and a note is withdrawn rather
than deleted.

**5 · Keying a number** — `/my-entries`

Sign in as `service.manager@driveaus.example` (demo dataset) or
`auto.lead@example.com` (worked example) — someone who owns a department rather
than the whole company, so the list is short and obviously theirs. Type a
figure, press `Tab` to save and move.
`Enter` saves and drops a row, `Escape` reverts. No modal dialogs anywhere in
that flow.

**6 · The audit trail** — `/control-item/[id]`

Click any measure you just edited. Trend chart with every plan version overlaid,
the stored cell including any formula as typed, the full history of who changed
what and when, and a **Rationale** tab carrying the same definition and log the
register shows — the one editable thing on an otherwise read-only page.

**7 · Admin** — `/admin`

Ki setup, version locking, the evaluation scale, users and departments. Try
removing a department that still has data: it refuses outright and tells you
what is pointing at it, rather than silently orphaning Level 4 rows.

**8 · Export** — the toolbar's *Export to Excel*

Three tabs — the sheet as rendered, the same figures in long format for
pivoting, and the evaluation bands in force. Numbers are written as numbers,
never as pre-formatted strings. Narrow the sheet first and the file comes out
narrowed the same way: the filters travel with the link, and so do Print
view's. To go the other way, **Admin › Structure › Upload a workbook** hands
out a *Download template* for the year you are uploading into.

## Check it works

```bash
npm run lint          # ESLint, expect zero warnings
npm run typecheck     # TypeScript, expect zero errors
npm test              # 266 tests, about four seconds
npm run build         # runs lint and typecheck too, so this proves all three
```

Inside Compose, prefix these with `docker compose exec app`.

The suite is split on purpose:

- `npm run test:unit` runs only the pure logic — the calculation rules,
  evaluation bands, the permission model, the cascade tree, SSO account
  matching, reminder accountability. **No database needed.** These are the
  tests worth reading, because they are where the rules live.
- The files in `tests/` need PostgreSQL running. They cover the seams that only
  exist once a database is involved, like "nobody is reminded twice".

### Two checks beyond the suite

```bash
npm run check:acceptance          # the hand-verification checklist, automated
npm run remind -- --dry-run       # who would be chased at month end
```

`check:acceptance` **writes to the database** — it clears a month, sets a zero
target, locks a version and unlocks it again. Run it against a development
database only, and re-seed afterwards:

```bash
npm run db:seed && npm run check:acceptance && npm run db:seed
```

`remind --dry-run` is safe: it resolves recipients and renders the messages but
writes nothing and sends nothing. Pass `--send` only once Graph is configured.

## Running on the host instead

If you would rather not run the app in Docker:

```bash
docker compose up -d db        # just PostgreSQL, on localhost:5432

cp .env.example .env           # switch DATABASE_URL to the localhost line
npm install
npm run db:migrate             # applies migrations and generates the Prisma client
npm run db:seed
npm run dev                    # http://localhost:3000
```

`npm run dev` is a development build, so password sign-in is on automatically —
no `AUTH_ALLOW_PASSWORD` needed.

## Useful commands

| Command | What it does |
|---|---|
| `npm run db:seed:uat` | Reload the demo dataset. Idempotent — makes 103KI current |
| `npm run db:reset:uat` | Drop everything, re-migrate, load the demo dataset alone |
| `npm run db:seed` | Reload the worked example. Idempotent — replaces the seeded Ki |
| `npm run db:reset` | Drop everything, re-migrate, re-seed the worked example |
| `npm run db:studio` | Prisma Studio, to poke at rows directly |
| `npm run backup` | `pg_dump -Fc` into `./backups/` |
| `npm run check:symbols` | Verify the five evaluation glyphs render here (needs `npx playwright install chromium` once) |

## When something is wrong

**The app cannot reach the database.** `DATABASE_URL` has two forms in
`.env.example` — the `db:5432` hostname works inside Compose, `localhost:5432`
works on the host. Using the wrong one is the usual cause.

**Sign-in fails for a seeded account.** Re-run `npm run db:seed`; the password
is only set when the user row is created.

**The five symbols render as boxes.** `〇` is U+3007 and needs a
Japanese-capable font. `npm run check:symbols` renders them in a real browser to
confirm what the machine has — it drives Playwright, so it needs the browsers
downloaded once first:

```bash
npx playwright install chromium
npm run check:symbols
```

**A test in `tests/` fails but `test:unit` passes.** PostgreSQL is not running,
or `DATABASE_URL` is not set for the shell running the tests.
