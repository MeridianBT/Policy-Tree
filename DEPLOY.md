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

## 6 · Load the demo data

The database is empty until you seed it. Migrations create the tables;
they do not create a plan.

Pick a password first — see the warning below — then:

```bash
npm install -g @railway/cli
railway login
railway link            # choose the project, then the app service
railway ssh

# now inside the container:
SEED_PASSWORD='<something only your team knows>' npm run db:seed:uat
exit
```

**If `railway ssh` is not available on your plan**, run it from your own machine
against the database's *public* URL instead. In Railway, open the Postgres
service → Variables → copy `DATABASE_PUBLIC_URL` (the public one — the internal
`railway.internal` address is not reachable from your laptop):

```bash
git clone https://github.com/MeridianBT/Policy-Tree.git
cd Policy-Tree
npm install
DATABASE_URL='<the DATABASE_PUBLIC_URL you copied>' \
  SEED_PASSWORD='<something only your team knows>' \
  npm run db:seed:uat
```

Needs Node 22 locally. Nothing else from that clone is used.

## 7 · Sign in

`https://<your-domain>` — `md@honda.example` and the password you chose.

The full account list is in [prisma/uat/README.md](prisma/uat/README.md).

## Before you send the link to anyone

**The URL is public and the password is shared.** There is no IP restriction,
no MFA and no invite check on the password path — the whole lock is one
password that every demo account shares. Anyone who has it, or guesses it, sees
the plan.

That matters more than usual here, because the divisions and departments in
this dataset are your real org chart. The numbers are invented, but nothing on
the screen says so, and a reader has no way to tell.

So:

- **Set `SEED_PASSWORD`.** Do not deploy with `hoshin`, which is in this
  repository and in every document written about it.
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
