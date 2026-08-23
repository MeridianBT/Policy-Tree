# Hoshin Kanri — policy deployment platform

Replaces the linked spreadsheets and re-keyed slide decks used to run the annual
policy deployment cycle. Every target owner enters their own monthly result;
quarters, Ki totals, gaps, achievement percentages and evaluation symbols are
derived from those months and never stored.

This is Hoshin Kanri, not OKR. There are no confidence scores, no key results,
no progress sliders and no weighted roll-up between levels. A parent Objective
is never scored from its children — each Control Item is measured on its own
data.

## Running it

New here? **[QUICKSTART.md](QUICKSTART.md)** walks through getting it running,
signing in, a tour of every screen, and how to check it works. The rest of this
file is reference.

```bash
cp .env.example .env          # set AUTH_SECRET: openssl rand -base64 32
docker compose up --build     # app on :3000, Postgres on :5432
```

Migrations are applied on boot. To load a worked example — Ki 2026, the six
divisions, 25 Level 1–3 Control Items, 6 at Level 4, PRB targets for the year
and actuals through the first half:

```bash
docker compose exec app npm run db:seed
```

Seeded accounts all use the password `hoshin`:

| Email | Role |
|---|---|
| `admin@example.com` | ADMIN |
| `auto.lead@example.com` | OWNER, Auto division |
| `ox.lead@example.com` | OWNER, OX division |
| `viewer@example.com` | VIEWER |

### Local development

Needs Node 22 and a PostgreSQL 16 you can reach. The quickest way to get one is
to start just the database from Compose and run the app on the host:

```bash
docker compose up -d db                 # Postgres on localhost:5432

cp .env.example .env                    # switch DATABASE_URL to the localhost line
npm install
npm run db:migrate                      # applies migrations and generates the client
npm run db:seed
npm run dev                             # http://localhost:3000
```

Sign in with `admin@example.com` / `hoshin`, which lands on the company sheet.

### Backups

```bash
./scripts/backup.sh                                  # ./backups/hoshin-<timestamp>.dump
./scripts/backup.sh restore backups/hoshin-….dump    # replaces the database
```

Custom-format dumps (`pg_dump -Fc`), so a restore can be parallelised and single
tables can be pulled out without replaying everything.

## Domain

| Term | Meaning |
|---|---|
| **Ki** | The fiscal year, 1 April – 31 March. `Ki 2026` = Apr 2026 → Mar 2027. |
| **Quarter** | Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar. |
| **Goal** | Level 1. A company priority statement, no measurement. |
| **Theme** | A grouping heading under a Goal, at Levels 2, 3 and 4. |
| **Objective** | A statement of intent under a Theme, carrying Control Items. |
| **Control Item** | The measurement method — how a target and actual are measured ("Units sold", "% of sales"). One row on the sheet. |
| **DIC** | Division In Charge: the org unit accountable for a Control Item. |
| **Version** | A named plan snapshot: OB, PRB, 1QFC, 2QFC, 3QFC, ACT. |

Levels 1–3 form the single company page; Level 4 is the division drill-down.

## How it is put together

```
lib/domain/period.ts     fiscal calendar: Ki months, quarters, period keys
lib/calc/                the calculation module — the single source of derived numbers
  aggregate.ts             SUM / AVERAGE / LATEST roll-up
  baseline.ts              the latest-forecast resolver
  achievement.ts           direction-aware achievement, gap, gap sense
  bands.ts                 evaluation symbols and startup validation
  row.ts                   assembling one Control Item into 17 sheet columns
lib/formula/             the formula engine, behind its own interface
  tokenise.ts parse.ts     hand-written tokeniser and recursive-descent parser
  evaluate.ts              evaluation against a CellResolver (no database)
  graph.ts                 cycle detection and topological recompute order
  engine.ts                the Prisma-facing half: save, edges, recompute
lib/auth/                thin internal auth module — swap the provider, nothing else
lib/sheet/               loading a Ki into the sheet view model
lib/entries/             the write path: permissions, locks, audit
```

Two rules hold the design together:

**The month is the only grain that is stored.** Every quarter figure, Ki total,
gap, percentage and symbol is computed at read time by `lib/calc`. The single
cached value in the database is `entry.computed_value`, the result of a formula
cell, and it is invalidated by the dependency graph.

**No React component does arithmetic.** Components receive finished `SheetCell`
objects and render them. There is one definition of achievement in the codebase,
and one definition of the evaluation scale.

### The calculation rules

Roll-up excludes months with no value rather than treating them as zero. If no
month in a range holds a value the result is `null` and renders as an em dash,
which is visually distinct from a real `0`.

Achievement always reads against 100% and is always direction-aware:

```
HIGHER_BETTER  (RATIO)     actual / target
LOWER_BETTER   (RATIO)     target / actual
LOWER_BETTER   (INVERSE)   2 - (actual / target)
```

`INVERSE` is a cost-item convention — for a higher-is-better Control Item the
plain ratio is the only meaningful reading, and the admin screen refuses the
combination. Every division is guarded: a zero or missing denominator gives
`null`. The module never returns `Infinity` or `NaN` and never substitutes zero.

The comparison baseline is resolved per month: the value from the
highest-sequence non-ACT version that actually holds a value for that month. So
mid-way through 2QFC, April–September actuals sit against whatever forecast was
live then, while October–March sits against 2QFC.

Evaluation bands cover `[minPct, maxPct)` — the lower bound is inclusive, which
is what "boundaries belong to the upper band" means. Exactly 105.0% is `◎`,
exactly 95.0% is `〇`. The bands are validated for contiguity when they are
loaded and when an admin saves them; a scale with a hole or an overlap is
refused with a message naming the two bands.

### Formula cells

Any cell can hold a formula instead of a value. The two are mutually exclusive.

```
=[CI:AUTO-VOL][2026-04][PRB] * 0.85     another Control Item, month and version
=[CI:AUTO-VOL][2026-04]                 the containing cell's own version
=[2026-05] + [2026-06]                  the containing cell's own Control Item
=SUM([CI:AUTO-REV][2026-04:2026-06])    a range of months
=MAX(AVG([2026-04:2026-06]), 100)       SUM, AVG, MIN, MAX; + - * / ( )
```

The input comes from users, so there is a real tokeniser and a real
recursive-descent parser. **`eval`, `new Function` and every other form of
dynamic code execution are absent by design** — there is no path from a formula
string to executed JavaScript.

Saving a formula resolves its references, rejects a cycle by naming the cells in
it, stores the edges, caches the result and recomputes everything downstream in
topological order. A reference to a Control Item or version that does not exist,
a division by zero, or a broken upstream cell each produce a typed error stored
against the entry and shown as `#ERR` in the cell — never a crash, never a
silent zero. A cycle is refused outright rather than stored, so the sheet never
holds one.

A formula may read a locked version: the freeze is exactly what makes an old
forecast quotable.

### Permissions

Enforced server-side on every mutation, in `lib/auth/permissions.ts`. The UI
hiding a control is a courtesy, never a control.

| Role | May edit |
|---|---|
| `ADMIN` | anything unlocked; may lock and unlock versions |
| `OWNER` | Control Items they are named responsible for, plus anything whose DIC is their own org unit or a department beneath it |
| `VIEWER` | nothing |

A locked version is read-only for **every** role including `ADMIN`. There is no
override: a closed version is the record of what was committed, and editing it
would rewrite history.

This table covers *entries* — the numbers keyed into a Control Item. Editing
the *plan structure itself* (adding a Theme, a Level 4 branch, a whole Control
Item) is a separate, narrower permission, covered under "Editing the structure
from the sheet" below.

Accountability and data entry are separate fields. `dic_org_unit_id` is the
accountable Division or Department and is required; `responsible_user_id` is the
individual who keys the number in and is optional.

### Authentication

Microsoft Entra ID (Azure AD) single sign-on, with email and password kept as
a development-only fallback. Every auth call in the application goes through
`lib/auth/session.ts`; the only file that knows *how* a user proves who they
are is `lib/auth/providers.ts`. That separation is what kept adding SSO small:
no screen and no server action changed, and `lib/auth/permissions.ts` and its
tests were not touched at all.

Entra says **who you are**. This application still decides **what you may do**,
from its own `role` and `org_unit_id` — so a role change is an admin action
here, not a ticket to IT. Entra group claims are deliberately not mapped onto
application roles.

#### Signing in with Microsoft

Sign-in is **invite-only**. Holding a Microsoft account in the company tenant
is not by itself permission to use this application: an admin creates the
account first (Admin → Users, leaving the password blank), and an unrecognised
Microsoft user is refused with "ask an admin for access" rather than being
provisioned automatically. That refusal is deliberately a different message
from a wrong password — the person has signed in correctly and would otherwise
be sent to the wrong help desk.

Accounts match on the Entra `oid` claim first, falling back to email. Email is
what an admin types when inviting someone, so it has to work for the first
sign-in, but it is mutable in Entra — people change surname, mailboxes get
renamed. `oid` is immutable, so the first successful match records it in
`app_user.entra_object_id` and every later sign-in keys off that instead. The
rule lives in `lib/auth/sso.ts` as a pure function with no Prisma and no
Auth.js, so who-gets-in is exercisable in a unit test (`lib/calc/sso.test.ts`)
without an OAuth round trip.

Password sign-in is on automatically outside production so the seeded accounts
work in development, and off in production unless `AUTH_ALLOW_PASSWORD=true` is
set deliberately. A production deployment therefore has no local password to
leak or rotate. An invited SSO user has `password_hash = NULL`; the credentials
provider already compares against a dummy hash when none is present, so a
password attempt against such an account fails in constant time like any other.

#### What to ask IT for

An Entra **app registration**, single-tenant, with:

- Redirect URI `https://<host>/api/auth/callback/microsoft-entra-id`
  (add `http://localhost:3000/api/auth/callback/microsoft-entra-id` for local work)
- Delegated scopes `openid profile email`
- A client secret — **note its expiry date somewhere it will be seen.** Client
  secrets expire on a 12–24 month calendar and an expired one locks out
  everyone at once.

Then set `AUTH_MICROSOFT_ENTRA_ID_ID`, `_SECRET` and `_ISSUER` (see
`.env.example`). The issuer must name your tenant: left unset, Auth.js defaults
to `/common/`, which would let any Microsoft account in the world — personal
Outlook and Xbox accounts included — reach the sign-in step. Treat that as a
security requirement, not a config nicety.

If the credentials are missing or wrong, the sign-in screen says so and points
at an administrator, rather than bouncing the user back to a bare form with
nothing said.

#### Not built yet

Entra group → role mapping, SCIM auto-provisioning, and the Graph `@`-mention
user picker for invitations. Saviynt governs who may hold the Entra group
upstream and needs nothing on this side.

### Month-end reminders

Nothing in this application matters if the numbers never get keyed, so a
scheduled job chases the people who still owe one.

#### Who gets chased, and about what

Accountability only — never "everything in the Ki":

- the person **named responsible** for a Control Item, and
- the **lead of the org unit** the Control Item's DIC sits in, or any unit
  above it, which is what makes a division lead answerable for their
  departments' numbers.

Both the named owner and their lead can be reminded about the same measure.
That is intended: both are answerable, and a lead who never hears about it
cannot chase it.

Two exclusions stop it becoming noise, and both were found by running it
against real data rather than reasoned about in advance:

- **A VIEWER is never reminded.** They attend the review and key nothing.
- **Someone whose org unit is the company itself** is reminded only about
  measures they are *personally named* on, never by coverage. The company root
  covers every division, so coverage there would mean all 31 measures — true,
  and useless as a to-do list. This is the case a company-level ADMIN falls
  into: they administer the plan, they do not key it.

The run also reports measures **nobody active is accountable for** — a real
gap, and one an admin should want to see rather than have silently swallowed.

#### Which month

"Month end" is ambiguous and getting it wrong is expensive in trust — chase
someone for a month they already keyed and they start ignoring the mail.
Actuals are keyed *after* a month ends, so `reminderPeriod` splits it on a
grace window (default 5 days): a run in the first days of May chases April, a
run later in May prompts for May, whose close is imminent. The same scheduled
job therefore does the right thing on the 1st and on the 28th. An explicit
`period` always overrides it.

#### Running it

A `POST /api/reminders` endpoint rather than an in-process timer, because the
app runs as a container that may have zero or several replicas — a timer would
fire once per replica, or never on a platform that sleeps idle instances.
Anything that can make a scheduled HTTP call drives it (Azure Function timer,
Logic App, Kubernetes CronJob, cron with curl):

```
curl -X POST -H "Authorization: Bearer $REMINDER_TRIGGER_SECRET" \
  "https://hoshin.example.com/api/reminders"
```

`?dryRun=true` reports without sending, `?period=2026-04` targets a month,
`?force=true` re-sends deliberately. The endpoint refuses every call when
`REMINDER_TRIGGER_SECRET` is unset — an endpoint that mails the whole company
must not be the thing that discovers a missing config. It is excluded from the
session middleware, since a scheduler carries a secret and not a cookie.

Same thing from a shell, defaulting to a dry run because sending mail to real
people should have to be asked for:

```
npm run remind -- --dry-run          # who would be chased
npm run remind -- --send             # actually send
npm run remind -- --period=2026-04 --send --force
```

#### Nobody is chased twice

`reminder_log` has a unique constraint on (user, month), claimed *before*
sending, so two runs racing each other produce one mail rather than two.
Schedulers retry, deploys double-fire, people re-run jobs by hand — none of
that should cost anyone a second chasing. A run that fails mid-flight leaves an
honest `FAILED` row, which a later run retries without needing `--force`;
only a genuine `SENT` needs forcing. The table doubles as the record of what
went to whom, which is the first thing asked when someone says they were never
told.

A dry run writes **nothing at all** — otherwise it would consume the slot and
the real run afterwards would mail nobody.

#### What to ask IT for

On the same Entra app registration as SSO, the **application** permission
`Mail.Send` (not delegated — there is no signed-in user at 6am), with admin
consent, plus a mailbox for `REMINDER_FROM`.

Be ready for the obvious pushback: application `Mail.Send` lets the app send as
*any* mailbox in the tenant. Most security teams will, rightly, scope it with an
[application access policy](https://learn.microsoft.com/en-us/graph/auth-limit-mailbox-access)
so it can only send as that one shared mailbox. Have the mailbox picked before
the conversation. Reminders are sent with `saveToSentItems: false`, so the
shared mailbox does not fill with hundreds of copies nobody reads.

## Screens

| Route | What it is |
|---|---|
| `/sheet` | The company sheet — Levels 1–3 by default, with a View toggle folding every Level 4 branch in under its Objective. Virtualised, with version selector, compare mode, four display densities, condensable quarter columns, a Division/Department scope and filters by DIC, Theme and evaluation symbol. ADMIN and OWNER (division/department leads) can edit the structure directly here |
| `/division/[code]` | The same Level 4 sheet, pre-scoped to one division and its departments — a narrower, single-division view of what "+ Departments" on the company sheet shows for everyone |
| `/cascade` | A read-only, one-page alignment map from every Company Goal down to the Department work laddering into it — see below |
| `/insights` | A read-only symbol-distribution heatmap, one Division per row, one month per column — see below |
| `/my-entries` | Keyboard-driven monthly entry for everything the signed-in user owns, with an outstanding count |
| `/control-item/[id]` | Trend chart with every version overlaid, stored cells including formulas as typed, and the full audit trail |
| `/print/company` | A3 landscape, print-only |
| `/print/division/[code]` | The same, pre-scoped to one division |
| `/admin` | Ki setup and naming, version locking, emptying a year, structure builder, copy-from-previous-Ki, evaluation scale, users, departments |
| `/symbols` | Symbol rendering check for a platform you are deploying to |
| `/api/export` | Excel download of the current sheet (`?division=CODE` for a Level 4 sheet, `?version=ID` to pin the target basis) |
| `/api/reminders` | Month-end reminder trigger, called by a scheduler with a shared secret — see below |

Entry is `Tab` to move and save, `Enter` to save and drop a row, `Escape` to
revert. No modal dialogs anywhere in that flow.

The sheet outlines in both directions. Rows fold at Goal, Theme and Objective;
columns fold by quarter — tap a quarter heading to condense its three months
into the quarter figure, or use the Columns toggle to condense all four at once
and read the whole Ki at quarter level. Condensing is a view concern and
changes nothing that is computed: the quarter figure is derived from the
monthly grain whether or not the months are on screen. A condensed sheet prints
condensed — the Print view link carries the state as `?columns=quarters`, which
gives a much less dense one-pager for a board reading.

### Running more than one year

A Ki is named, not computed. Left blank the name derives from the start year
("Ki 2026"), but numbered fiscal periods — `103KI`, `104KI` — are what most
companies actually say, carry no year in them, and so have to be typed. Only
the start date decides which months the year covers; the name is a label
everywhere else.

Next year has to be built before it starts: its Goals typed in or copied from
this year, its targets loaded. Doing that by making it current would move
every user onto a half-built year mid-review. So **an admin, and only an
admin, can point themselves at another Ki** using the year selector in the
nav. The choice lives in a cookie — it is one person's view, never a property
of the year — and everyone else keeps seeing the live Ki whatever is in it.
Working on a draft year is marked with a red `DRAFT YEAR` badge, because
forgetting which year you are keying into is the mistake the control makes
possible.

Month-end reminders deliberately ignore all of this and always use the current
Ki. A scheduler has no cookie and no person, and chasing people about a draft
year would be worse than useless.

### Emptying a year

Admin → *Empty year* on any Ki that is not current. It removes every Goal,
Theme, Objective, Control Item and stored figure for that year; the year
itself and its six plan versions survive, so it is immediately ready to be
built again or copied into.

Two guards, because there is no undo and no soft delete behind it:

- **The current Ki cannot be emptied at all.** Emptying the year everyone is
  keying into is never what was meant. Make another Ki current first — a
  deliberate act with its own visible consequence.
- **You must type the year's own name back.** The first click only reports
  what would be lost ("removes 37 rows, 31 Control Items and 4,812 stored
  figures"); nothing happens until `104KI` is typed by hand. A second confirm
  button would sit where the first one was, so a double-click would sail
  through both. Typing the name cannot happen by accident, and it forces a
  look at which row was actually clicked.

### Editing the structure from the sheet

An ADMIN can add, rename and remove Goals, Themes, Objectives and Control Items
directly on the company sheet — "Edit structure" in the toolbar reveals a
`+` / rename / delete on every row, without leaving the sheet or opening the
admin structure builder. Nothing asks for a level or a kind for a plain
continuation: the server derives both from the parent (a Goal takes a Theme, a
Theme takes an Objective, a Level 2 Objective takes a Level 3 Theme), so the
only decision left is what to call the new row.

Deletion is destructive — a Goal carries every Theme, Objective, Control Item
and stored figure beneath it — so it runs in two steps. The first click reports
exactly what would be lost ("removes 7 rows beneath it, 7 Control Items, 315
stored figures"); only a second, explicit confirmation removes anything. The
same two-step confirmation guards deleting a Control Item that already has data
keyed against it.

#### Level 4, and who may touch it

`lib/structure/actions.ts` draws one hard line: **Levels 1-3 are ADMIN-only.**
They are what every division ladders into, so a local edit there would move
the ground under everyone else. **Level 4 is different** — a division or
department lead (`OWNER`, with their `org_unit_id` set to that division or
department) may build their own corner of the deployment without an admin in
the loop:

- **"L4+"** appears on every Level 2 or 3 Objective, for ADMIN and OWNER alike
  — the Objective itself is company-wide and owned by nobody, so anyone
  permitted to add Level 4 work may open the form there. What the form
  actually restricts is *which* division or department the new branch is filed
  under: an OWNER's picker only ever offers their own org unit and whatever
  sits beneath it (`assignableDics()`, scoped server-side, never merely
  hidden). "Against any of the L3 measures" is the point of this button — a
  department lead ladders their own deployment from wherever it belongs in the
  company structure, not only from rows that happen to already carry their
  division's DIC.
- Once a branch exists, its owning lead can extend it — add an Objective under
  their Theme, add a Control Item under their Objective, rename or delete any
  of it — the same way an ADMIN can, but never outside their own org unit or a
  department beneath it. `components/sheet/permissions.ts` mirrors this rule
  client-side to decide which pencils and trash cans to draw; every action
  re-derives the real answer from the database regardless of what the toolbar
  showed.
- A plain continuation from a Level 3 Objective is refused outright, even for
  an ADMIN — the next step from Level 3 is always a Level 4 branch, and that
  must carry an org unit. A Theme created by the generic "add child" path
  would belong to nobody.

#### The Division/Department view

The company sheet's **View** toggle folds Level 4 in on demand: "Company"
shows Levels 1-3 exactly as before, "+ Departments" nests every Level 4 branch
directly beneath the Level 1-3 Objective it ladders into — no separate page,
no second fetch to reconcile. Once departments are on the sheet, a **Division**
selector narrows the DIC filter to one division and everything beneath it in
one click ("Departments in a Division"), and picking a specific department
chip narrows it to just that ("just the Department"). The per-division
`/division/[code]` page still exists for a narrower, single-division view with
the same editing rights.

#### Managing the pick list

Divisions are seeded; Departments are not fixed — Admin → Departments lets an
ADMIN add one under an existing division (a code and a name) or remove one,
which is what populates the DIC picker everywhere else on the sheet. Removing
a department never cascades: Postgres's default behaviour on an optional
foreign key is to silently `SET NULL` rather than block, which for a
department would strip a Level 4 branch of the department it belongs to, or
quietly unassign a user, instead of stopping the deletion. `deleteDepartment`
counts every Level 4 row, Control Item and user still pointing at it first and
refuses outright if any exist — there is no "delete anyway" override here,
because an org unit is an identity other rows depend on, not plan content with
a value of its own.

### The cascade view

`/cascade` answers a different question than the sheet does. The sheet is
built for the quarterly PDCA review — dense, filterable, one row per Control
Item. The cascade view is built for the opposite problem: when Department
work lives on its own page or its own slide, it is easy to lose sight of
whether it genuinely ladders up to a Company Goal, or has quietly become
disconnected busy work. So this page shows nothing but structure — every
Goal, numbered, down through its Themes and Objectives, down to whichever
Departments have laddered a Level 4 branch in underneath, on one continuous
page with a connecting line the eye can follow.

It is deliberately plain: no version picker, no filters, no editing surface,
read-only for every role including VIEWER. Performance still shows — one
evaluation symbol per Control Item — but small and quiet, never the point of
the page; there is no rollup or invented "worst" verdict for a branch, which
would misrepresent a scale where the two extreme bands (□ far above, ■ far
below) are not simply good and bad ends of one line.

The one thing this page insists on showing is the gap: most Objectives in a
given Ki have no Level 4 branch yet, and rather than rendering nothing under
them, the page says so plainly — "— nothing yet ladders in here —". A blank
cascade is exactly as visible as a full one, which is the actual point of
building it: the absence of alignment is the thing a slide deck hides and
this page cannot.

Structurally there is nothing new to fetch or compute — `buildCascadeTree` in
`components/sheet/outline.ts` just re-nests the same flat `loadSheet({ levels:
[1, 2, 3, 4] })` rows the "+ Departments" sheet view already uses, keyed off
each row's existing `path` ancestry, so a Level 4 branch always renders
exactly where it structurally attaches — under the Level 2 or 3 Objective it
ladders into — with no possibility of drifting from what the sheet itself
would show.

### The Insights heatmap

`/insights` answers "where is trouble concentrating" without inventing a
number to answer it with. It is a grid — one row per Division, one column
per month of the Ki — where each cell is a small stacked bar: one segment
per evaluation band actually present that month, width proportional to how
many Control Items landed there. A Department's Control Items count toward
their parent Division's cell, so a Division's row reflects its own work and
everything laddering up into it from below.

The one rule this page will not break: no cell collapses to a single
"worst" or "average" symbol. The five evaluation bands are not one
good-to-bad scale — □ (far above target) and ■ (far below target) are
symmetric extremes, not opposite ends of a line — so picking one
representative symbol per cell would assert a verdict the data does not
actually support. A month with nothing keyed yet is a plain dashed box,
never hidden and never silently folded into a neighbouring month.

`lib/calc/heatmap.ts` (`buildSymbolHeatmap`) does the one piece of new
aggregation this page needs — grouping the same `loadSheet({ levels: [1, 2,
3, 4] })` rows the sheet and Cascade already use by Division and month,
counting symbols per cell — and nothing else on the page is computed twice:
the counts are exactly what the sheet's own month cells already carry.

### Exporting to Excel

"Export to Excel" downloads the sheet currently on screen — same rows, same
target basis, same filtering by DIC and Theme are not applied to the export
(it always contains everything you are allowed to see) but the pinned target
version travels with it. The workbook has three tabs:

- **Sheet** mirrors the screen: target above actual above achievement, quarters
  and the Ki total tinted the same as on screen, the evaluation legend at the
  foot.
- **Data** is the same figures in long format — one row per Control Item per
  period — for pivoting.
- **Evaluation** lists the band boundaries in force for this export.

Numbers are written as numbers with `decimal_places` respected exactly, never
as pre-formatted strings; an empty cell stays empty rather than becoming a
zero, matching the em-dash rule on screen. `lib/export/workbook.ts` builds the
workbook from the same `SheetModel` the grid renders — there is no second
formatting path to drift from the first.

## The evaluation symbols

□ ◎ 〇 ▲ ■ carry the entire colour budget of the sheet; everything else stays
neutral so they can be found at a glance across a full page.

They are CJK-adjacent — 〇 is U+3007 IDEOGRAPHIC NUMBER ZERO — and several have
emoji presentation forms. Two measures keep them honest:

- an explicit font stack with Japanese-capable faces ahead of the fallbacks
  (`--font-symbol` in `app/globals.css`)
- every symbol is emitted with a trailing U+FE0E VARIATION SELECTOR-15, which
  requests text presentation, so no platform substitutes an emoji

Verify a platform before deploying to it:

```bash
npm run check:symbols     # rasterises each glyph and compares against a tofu box
```

Open `/symbols` in the browser for a visual check of the stack and each
candidate face individually.

The check rasterises each glyph and compares it against a private-use codepoint
that no font covers, so a missing glyph fails rather than silently drawing a
box. It also flags a colour emoji substitution by looking for chroma in
black-filled text — but that half of the check can only fire on a machine that
actually has a colour emoji font installed, so run it on the Windows and macOS
machines you deploy to rather than only in CI. Symbol rendering has been
verified here on Linux Chromium and in the printed PDF; Windows Chrome and
macOS Safari need a run on those platforms.

## Tests

```bash
npm run lint          # ESLint, zero warnings
npm run typecheck     # tsc --noEmit
npm test              # 266 tests, about four seconds
npm run test:unit     # the pure modules only, no database needed
```

`npm run build` runs the linter and the type checker itself, so a build is the
single command that proves all three. The lint config
(`eslint.config.mjs`) carries no stylistic rules — the point is catching what
types cannot: a hook called conditionally, an unused export left by a
refactor, a `require` in the bundle. One rule is disabled at its call site
rather than in config: React Compiler cannot memoize the virtualized grid,
because TanStack Virtual returns functions whose identity changes, and the
reason is written where a reader will meet it.

- `lib/calc/calc.test.ts` — roll-up, baseline resolution, achievement, gap,
  bands, row assembly, formatting
- `lib/calc/outline.test.ts`, `lib/calc/columns.test.ts` — row/column outline
  geometry: level-based indentation, Goal numbering, quarter condensing
- `lib/calc/structure-permissions.test.ts` — the client-side permission mirror
  that decides which pencils and trash cans to draw, checked against every
  role/level/org-unit combination
- `lib/calc/cascade-tree.test.ts` — rebuilding the Level 1–4 tree from the flat
  row list, so a department branch always lands under the objective it ladders
  into and nothing is dropped or duplicated
- `lib/calc/heatmap.test.ts` — symbol distribution per division per month,
  including that a department's figures count toward its parent division and
  that a cell never collapses to one representative symbol
- `lib/calc/sso.test.ts` — who may sign in through Microsoft: invite-only,
  `oid` preferred over email, deactivated accounts refused
- `lib/calc/auth-config.test.ts` — that a half-configured Entra provider counts
  as unconfigured, so it is never registered against the `/common/` issuer
- `lib/calc/reminders.test.ts` — which month a reminder run chases, and who is
  accountable for a missing figure
- `lib/formula/formula.test.ts` — tokeniser, precedence, nesting, ranges, cycle
  detection, topological order, missing references, division by zero, and that
  a JavaScript payload is a syntax error rather than code
- `tests/engine.test.ts` — integration against a real PostgreSQL: cached
  recompute, deep recompute chains, cycle rejection by name, locked-version
  enforcement for every role, the permission matrix, and the audit trail
- `tests/structure.test.ts` — integration against a real PostgreSQL for the
  structure-edit actions: a division lead laddering a Level 4 branch off a
  company-wide Objective, scoped strictly to their own org unit; the two-step
  delete confirmation refusing even to reveal its impact to someone outside
  that scope; and department deletion refusing outright — never cascading —
  the moment anything still points at it
- `tests/reminders.test.ts` — integration against a real PostgreSQL for the one
  reminder property that cannot be unit-tested: nobody is chased twice for the
  same month, and a dry run writes nothing

The integration suites need `DATABASE_URL` and run serially against a real
database. Each creates and removes its own throwaway Ki (`tests/fixture.ts`).
`tests/structure.test.ts` mocks only the session boundary (`requireSession`/
`requireRole`), because those actions call `auth()` internally rather than
taking a user as a parameter; the permission logic itself — `canEditStructureAt`,
`assignableOrgUnitIds` — runs for real, against the real database, for every
test.

There is also a hand-verification pass, automated:

```bash
npm run db:seed && npm run check:acceptance && npm run db:seed
```

It walks the seeded Ki through the real modules and prints a pass or fail line
per check — SUM/AVERAGE/LATEST roll-up against the live sheet, an SG&A
underspend reading above 100% with a favourable gap, a zero target giving an em
dash rather than `Infinity`, the 105.0%/95.0% band boundaries, and a locked
2QFC refusing every role while still rendering in compare mode. It writes to the
current Ki, so run it on a development database and re-seed afterwards.

## Deliberately not built

Gap analysis and countermeasure text (deferred by design — the schema
accommodates a text block attached to a Control Item per quarter, and nothing is
built), SSO, approval workflow, notifications, chat integrations, weighted
roll-up or contribution scoring between levels, initiatives or task tracking
beneath Control Items, and mobile-optimised entry. The application is
desktop-first and does not break on a tablet.
