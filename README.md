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
signing in, a tour of every screen, and how to check it works.
**[DEPLOY.md](DEPLOY.md)** puts it on a real URL for a demo. The rest of this
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

There is also a **UAT dataset** — a fictitious Australian automotive
distributor with five Level 1 Goals, 83 Control Items across Levels 2 to 4 and
four months of actuals, with targets set against the real Australian market of
mid-2026. It exists to demonstrate the platform to a leadership team rather
than to test it. See [prisma/uat/README.md](prisma/uat/README.md).

```bash
npm run db:seed:uat      # additive
npm run db:reset:uat     # drops everything first, for a single-dataset demo
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

### Changing a password

```bash
npm run set-password -- --email=md@honda.example --password='…'
npm run set-password -- --all --password='…'
```

`SEED_PASSWORD` sets the password every seeded account starts with, and it only
ever applies to an *empty* database — `prisma/seed-if-empty.ts` refuses to
touch one that already has accounts, which is what makes `SEED_ON_BOOT` safe to
leave set. So on a deployment that has already been seeded, changing that
variable changes nothing; this rewrites the hash instead.

`--all` deliberately skips accounts with no password at all. Those are
invite-only through Microsoft, and issuing them one would open a second way in
that nobody asked for — the same reason password sign-in is off in production
unless `AUTH_ALLOW_PASSWORD` says otherwise. Naming an account with `--email`
applies no such skip: that is a decision rather than a sweep.

## Domain

| Term | Meaning |
|---|---|
| **Ki** | The fiscal year, 1 April – 31 March. `Ki 2026` = Apr 2026 → Mar 2027. |
| **Quarter** | Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar. |
| **Goal** | Level 1. A company priority statement, no measurement. |
| **Objective** | Levels 2, 3 and 4. A statement of intent, carrying Control Items and deploying into further Objectives beneath it. |
| **Control Item** | The measurement method — how a target and actual are measured ("Units sold", "% of sales"). One row on the sheet, with its own unit, direction, targets and actuals. An Objective may carry several. |
| **DIC** | Division In Charge: the org unit accountable for a Control Item. Shown on every screen as **Department**, since the org unit named is usually one. |
| **Version** | A named plan snapshot: OB, PRB, 1QFC, 2QFC, 3QFC, ACT. |

Levels 1–3 form the single company page; Level 4 is the division drill-down.

### What each level holds

One kind of row repeats all the way down. A **Goal** is a company priority and
is never measured; everything beneath it is an **Objective**, which carries
Control Items, deploys into further Objectives, or does both.

```
Ki 103KI
└── Goal (L1)                     statement only — no measures, ever
    └── Objective (L2)            statement · control items · targets · actuals
        ├── Control Item          unit · direction · roll-up · DIC · owner
        ├── Control Item          another target against the same statement
        └── Objective (L3)        the company breakdown, deployed from above
            ├── Control Item
            └── Objective (L4)    a department branch, carrying an org unit
                └── Control Item
```

The ladder is strictly Goal → L2 → L3 → L4, one rung at a time. A department
branch attaches to a Level 3 and only to a Level 3, so a division is always
picking up a deployment the company has already written down rather than
answering a company Objective in its own words.

So Levels **2, 3 and 4 are all the same thing** — an Objective with figures
against it — and only Level 1 is description-only. An Objective with no Control
Items yet renders as a blank row, which is how a plan gets built from nothing
and how a hole in the deployment stays visible.

On the sheet an Objective is named exactly once, and how many Control Items it
carries — nothing else — decides its shape:

| Control Items | The sheet draws |
|---|---|
| exactly 1 | **one row**: the statement beside its own figures |
| 2 or more | a heading carrying the statement, then a `└` row per Control Item |
| none | a blank row |

What is deployed *from* an Objective has no say in this. A Level 2 held to one
Control Item with a whole Level 3 branch beneath it is still a single row; the
branch simply indents under it, and the row grows a disclosure caret so it can
be folded away.

The demo data is exactly that shape: 5 Goals with no measures at all, 83
Control Items across 74 of the 82 Objectives — seven of those Objectives hold
two and one holds three — and eight Objectives with nothing measured against
them yet. Every Control Item carries a target on every forecast version and an
actual for every closed month.

A Level 4 branch is the one that differs in kind rather than depth: it hangs off
a Level 3 Objective — never higher, so a department is always picking up a
deployment the company has already made — it must carry an org unit, and it is
the only part of the tree a division or department lead can extend on their own.
Level 4 is as deep as the model goes.

#### An Objective may be held to several Control Items

An objective is usually judged on one thing, and then it carries one Control
Item and the sheet draws it as a single row: the statement in **Measures**, the
control item in **Control Item**, its figures across the months.

Sometimes it is judged on several at once. Servicing is not effortless because
of any one of an NPS, a first-time fix rate and a waiting time — it is all
three together, and the demo plan carries exactly that under "Service
experience". So an Objective holds as many Control Items as it needs, and the
split between them is deliberately uneven:

- The **Objective** carries the statement, its place in the tree and its order.
  That is all.
- Each **Control Item** carries everything else — its own code, unit,
  direction, roll-up, decimals, department, business unit, responsible person,
  targets and actuals. It is keyed, rolled up and evaluated separately, and a
  formula addresses it by its own code.

That unevenness is what keeps the filters, the permission checks, the formula
engine, the entries, the audit trail and the month-end reminder all operating
on exactly the row they always did.

On the sheet the statement is printed **once**. An Objective with one Control
Item and nothing deployed from it prints it inline, beside its own figures.
Anything more — a second Control Item, or an Objective laddering from it — and
the statement becomes the header of that group; the rows beneath leave the
Measures column to a faint `└` and are told apart by their own Control Item
text. Repeating one statement down three rows says nothing the reader did not
already know and costs the width those rows need. Away from the sheet —
`/my-entries`, the month-end review, the reminder mail — there is no grouping to
lean on, so a line reads `Service experience — Days to next available booking`.
An Objective of one is never dressed up that way (`lib/calc/item-label.ts`).

Editing follows the same rule. **CI+** on any Objective adds a Control Item to
it, seeded from the one beside it when there is one, with the statement shown
but not offered. The pencil on the row carrying the statement edits the
Objective *and* that Control Item; on any other row it edits the Control Item
only. Renaming from the row that carries it renames the Objective, so every row
beneath follows at once. Deleting a Control Item never takes the Objective with
it — an Objective is a statement of intent in its own right, and one with
nothing measuring it reads as a blank row, which is a real hole in the
deployment and better seen than hidden.

Dragging follows from what is dragged: a Control Item of an Objective that has
others moves among those, and the only Control Item of an Objective moves the
Objective among its siblings — which is what reordering the sheet has always
meant.

To add a measure, turn on **Edit** (the pencil in the toolbar) and use the
**M+** on a Goal or Level 2 Objective row — it creates the Objective and the
first Control Item measuring it together. **CI+** on any Objective adds another
Control Item to *that* Objective, which is also how a blank row gets its first
figure.

A row's buttons run left to right in the order of the job — edit this row, then
everything that can be added beneath it from the smallest step to the largest,
then delete:

| | |
|---|---|
| ✏️ | edit this row |
| **M+** | an Objective one level down, carrying its first measure |
| **CI+** | another Control Item against *this* row |
| **L4+** | a department branch (Level 4), which asks whose it is — offered on Level 3 rows and nowhere else |
| 🗑️ | delete |

The trash can sits alone at the far end, away from the three that are reached
for constantly.

There is deliberately **no button for an Objective without a measure**. There
was, beside **M+**, and the pair was a distinction nobody should have to learn:
both made an Objective one level down, and the bare one left a blank row that
was useless until a figure was added to it anyway. An Objective survives losing
its last Control Item, so a blank one is a delete away, and the admin structure
builder still makes bare rows for anyone who wants one.

A new row lands **ahead of the siblings at its own level**, so it appears
against the row it was added from. Appending is the obvious thing and it reads
as nothing having happened: a Goal on the demo plan carries thirty-one
Objectives, so a new one at the end arrived some sixty rows below the heading
that had just been clicked, off the screen entirely. Sort orders are not dense —
the seeders allocate them in blocks and a reorder renumbers only the rows it
touches — so the number is taken from the lowest sibling rather than by counting
them, which would land in a gap partway down.

The cost is that rows added to one parent accumulate newest-first. Reading order
is what dragging a row is for, and a drag renumbers densely, which also clears
the negative numbers this allocates.

### The order an Objective's children read in

Because the ladder moves one rung at a time, every Objective's children are of
a single level: a Level 2 carries Level 3s, a Level 3 carries Level 4 branches,
and nothing carries both. So `sort_order` alone decides the order, which is
what dragging a row writes. A block reads:

```
Objective                       the statement
  └ its own Control Items       what it is measured by
  the Objectives below it       one level down, in sort order
```

There was once a level-first key here, sorting Level 4 branches ahead of Level
3 Objectives so that a new branch did not land several rows down past a Level 3
and all of its measures. Restricting branches to Level 3 parents removed the
case it existed for — no parent has children of two levels any more — so the
key went with it rather than sitting there unable to fire.

### Finding a row

**Find** in the toolbar filters by free text, intersecting with the pickers and
Below target rather than replacing them. It matches a statement, a measure's
name, what it is measured as, its code and its department, ignoring case and
looking past emphasis markers — so `**Retail** volume` is found by typing
"retail volume", and `AU-VOL` pasted from a report finds its measure.

Matching a **measure** keeps that row and the chain above it, so it can be read
in context. Matching a **statement** keeps its whole branch, because somebody
typing a Goal or an Objective is asking to see what is under it. Escape clears
the box, and "Clear filters" clears it with everything else.

### Folding a branch away

Every heading has a disclosure caret, and collapsing one hides everything
laddering off it — the Level 3 deployment and the Level 4 department branches
alike, since both carry it in their ancestor chain.

Switching between **Company** and **+ Departments** forgets what was collapsed.
The point of asking for the department branches is to see them, and an
Objective somebody had collapsed earlier would otherwise swallow every Level 4
row the toggle had just loaded, leaving the button looking like it had done
nothing.

### Widening the Measures column

A statement is a sentence somebody wrote, and the ones that matter are the long
ones — at a fixed width the useful half is behind an ellipsis exactly when
somebody is trying to read it. So the Measures column has a grip on its right
edge: drag it, or focus it and use the arrow keys (Shift for bigger steps), and
double-click to put it back. It is the only resizable column — every other one
holds a figure of known width, and a sheet whose columns all move is one whose
columns no longer line up between two people reading the same plan.

The width is remembered per browser rather than per account, because it depends
on the screen in front of the reader and not on who they are. It cannot be
dragged below 180px or past 640px: a column resized to nothing is a sheet
somebody would have to clear their site data to recover from.

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

Formulas are typed wherever a figure is: into `/my-entries` for an actual, and
into a month cell on the sheet for a target once a version is pinned (see
[Keying targets on the sheet](#keying-targets-on-the-sheet)).

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
the *plan structure itself* (adding an Objective, a Level 4 branch, a whole
Control Item) is a separate, narrower permission, covered under "Editing the structure
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
| `/sheet` | The company sheet — Levels 1–3 by default, with a View toggle folding every Level 4 branch in under its Objective. Virtualised, with version selector, compare mode, three display densities, condensable quarter columns, a single-quarter view, three filters — Business unit, then Division, then Department — read outside-in, and a one-click **Below target** preset. Rows can be dragged into a new order among their own siblings, and month cells become keyable when a specific unlocked version is pinned ADMIN and OWNER (division/department leads) can edit the structure directly here |
| `/division/[code]` | The same Level 4 sheet, pre-scoped to one division and its departments — a narrower, single-division view of what "+ Departments" on the company sheet shows for everyone. Reached by URL; not linked from the nav, where it duplicated the sheet's own filters |
| `/cascade` | A read-only, one-page alignment map from every Company Goal down to the Department work laddering into it, narrowable by view, business unit and division — see below |
| `/insights` | The month-end review, anchored on one month: how much of it has reported and who owes the rest, what is below target ranked by direction of travel, and the biggest movers either way — see below |
| `/rationale` | The register: what each measure counts and why its target is that number, one block per measure, with the same filters the sheet uses and a **Nothing recorded** worklist preset. The one later screen that is written to as well as read — see below |
| `/my-entries` | Keyboard-driven monthly entry for everything the signed-in user owns, with an outstanding count |
| `/control-item/[id]` | Trend chart with every version overlaid, stored cells including formulas as typed, the full audit trail, and this measure's definition and rationale |
| `/print/company` | A3 landscape, print-only |
| `/print/division/[code]` | The same, pre-scoped to one division |
| `/admin` | Five sections, one at a time and addressable (`?section=people`): **Year** (Ki setup, version locking, emptying a year, copy-from-previous-Ki), **Structure** (workbook upload), **Organisation** (divisions, departments, business units), **People**, **Evaluation** (the band scale) |
| `/symbols` | Symbol rendering check for a platform you are deploying to. **Not on the menu** — a deployment check, not something a director needs. Reachable by typing it, like `/division/[code]` |
| `/api/export` | Excel download of the sheet as filtered (`?division=CODE` for a Level 4 sheet, `?version=ID` to pin the target basis, plus the filter parameters below) |
| `/api/template` | The upload template for a Ki (`?ki=ID`, required) |
| `/api/reminders` | Month-end reminder trigger, called by a scheduler with a shared secret — see below |

Entry is `Tab` to move and save, `Enter` to save and drop a row, `Escape` to
revert. No modal dialogs anywhere in that flow.

The sheet outlines in both directions. Rows fold at Goal and Objective;
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
Objective, Control Item and stored figure for that year; the year
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

### Keying targets on the sheet

Pin a specific forecast version in **Target** and, if it is not locked,
**Edit targets** appears beside it. Every month cell the signed-in person may
key becomes a box. The button says *targets* because that is all it keys —
actuals belong to `/my-entries`, and a button called "Enter figures" left
people asking which figures it meant.

The condition is not decoration. Left on "Latest forecast", the target column
is a *resolution* — for each month, the value from the highest-sequence version
that actually has one — so it is an answer assembled from several versions and
belongs to none of them. There is no single stored cell for a keystroke to land
in, and the sheet says so by offering nothing. Pin OB and the question has an
answer again: every box is one entry on OB. That rule is one field,
`targetEditable`, decided in `lib/calc/row.ts` and never re-derived by a
component.

Only months are keyable. Quarters and the Ki total are rolled up from the
months at read time, so there is nothing behind them to type into — the same
"the month is the only stored grain" rule that governs everything else. The
grid draws them plainly beside the boxes, and they re-derive once the typing
pauses.

Keying matches `/my-entries` exactly, because it is the same job done to a
different version: **Tab** saves and moves across, **Enter** saves and drops to
the same month on the next measure, **Escape** reverts. A value beginning with
`=` is a formula, with the whole language above available — so a forecast can
be built as `=[CI:AUTO-VOL][2026-04][OB] * 1.05` rather than as a column of
hand-multiplied numbers, and it will recompute when its source moves. A cell
already holding a formula seeds its box with the formula as written, never with
the number it last evaluated to; seeding the result would silently freeze it
into a literal the moment anyone tabbed past.

Saving goes through `saveEntry` like every other write, so the same rules
apply and none of them are re-implemented here: the role and ownership check,
the flat refusal on a locked version for every role including SUPER_ADMIN, the
append-only audit row, and the downstream recompute. Who may key which row
mirrors `canEditControlItem`, which is wider than the structure rule on
purpose — being *named responsible* for a measure is enough on its own,
whichever division it is filed under. A row somebody else keys shows its
figure greyed with the reason in its tooltip rather than showing nothing,
because "not yours" and "no target set" must not look the same.

#### Looking at one quarter

**Quarter** in the toolbar narrows the sheet to a single quarter: pick Q3 and
the columns become Oct, Nov, Dec, Q3 and the Ki total. The other three
quarters' columns are simply not drawn.

The Ki total stays deliberately. A quarter read without the year it belongs to
is the number people misjudge — 32.8% of an annual target in Q3 reads as a
disaster until the year column reminds you three quarters of it are still
outstanding.

Nothing is recomputed and nothing is filtered: a hidden month still counts
towards its quarter, its Ki total and its evaluation symbol, exactly as
condensing a quarter never changed what the quarter figure meant. It composes
with **Columns** too — Quarters plus a single quarter leaves that one quarter
figure and the year. Export and the print view are unaffected; both always
carry the whole year.

#### Comparing one version against another

**Compare with** in the toolbar puts a second plan version beside the one being
read, so "what moved between OB and 1QFC" is answered in the cell rather than
by exporting twice. A compared cell is three lines:

```
4,560       the target on the version being read
OB 4,378    the target on the version being compared, labelled
4,310       the actual
```

Three, not eight, and the reasons are worth keeping. It used to render the
whole cell twice, one block above the other — target, actual, achievement and
symbol, then all four again — and that was wrong three ways over. The row was
given exactly twice a cell's height while the content was twice a cell *plus* a
separator, so it spilled roughly 23px past the row's top and bottom edges and
collided with the rows either side. The actual appeared in both halves,
identical, because an actual is keyed against the actual version and does not
vary by plan version — a comparison printing a number twice to say it has not
changed. And achievement is measured against *a* target, so beside two of them
it is ambiguous by construction.

So a comparison shows figures and no evaluation: no percentage, no symbol,
whichever display mode is selected. The mode still governs a sheet that is not
comparing.

#### Pasting a block of figures

Copy a range out of a spreadsheet, click the cell it should start at, and
paste. The block lands from that cell — across the month columns **currently
on screen** and down the **visible** measure rows — so a paste made with a
filter on, or with quarters condensed, fills the cells the reader can see
rather than ones they cannot. A single value still pastes like typing.

This exists because there was no bulk path into targets at all: `copyStructure`
carries a new Ki's structure but no values, there is no import anywhere, and
planning a year therefore meant keying 82 measures × 12 months by hand. Pasting
the column somebody already has in their budget spreadsheet is most of an
importer's value with none of its file formats.

The rules are the ordinary ones, applied per cell. Every cell in a block goes
through `saveEntry` exactly as a hand-keyed one does — the permission check,
the refusal on a locked version, the audit row, the downstream recompute. The
block travels in one request rather than one per cell, and one cell's refusal
never aborts the rest: the paste files everything it may and then says what it
could not, by count and by reason —

```
Pasted 12 of 20 cells — 8 outside your scope.
Pasted 2 of 6 cells — 4 past the edge of the sheet.
```

A block wider or taller than the grid is **clipped, never wrapped**. A wrapped
figure would be filed against a month nobody chose, on a measure nobody
selected, and would look exactly like a successful paste. A paste is capped at
500 cells, enforced on the server as well as in the browser.

Deliberately not a CSV parser: every spreadsheet puts plain TSV on the
clipboard and only quotes a cell containing a tab, a newline or a quote — which
a figure never does. Anything that will not parse is refused per cell by
`saveEntry`, named and visible, rather than coerced.

**Actuals are not keyed here.** They belong to `/my-entries`, which is scoped
to the month being closed. Keeping "what we promised" and "what happened" on
separate screens is deliberate: they are entered by different people, at
different times, against different versions.

### Editing the structure from the sheet

An ADMIN can add, rename and remove Goals, Objectives and Control Items
directly on the company sheet — **Edit**, the pencil in the toolbar, reveals the
row buttons described above. Nothing asks for a level or a kind for a plain
continuation: the server derives both from the parent (a Goal takes a Level 2
Objective, a Level 2 Objective takes a Level 3), so the only decision left is
what to call the new row.

The sheet is now the **only** place the structure is edited by hand. Admin used
to carry a "structure builder" — a form with Kind, Level and a parent dropdown —
and it is gone. It asked for three things the sheet derives, its own Control
Item form had been broken for some time (it never sent a business unit, so every
submission was refused), and its ladder check was a looser rule than the sheet's:
it would happily create a Level 4 under a Level 2, a Level 2 under a Level 2, or
a Level 4 under a Level 4 — the shapes the sheet refuses and
`20260901090000_relink_level_4_under_level_3` exists to clean up. One way in
means one rule.

The one thing it could do that the sheet could not is now on **M+**: tick
**"nothing measures this yet"** and the form adds the Objective alone, statement
and no figures. That is a real step in building a plan — the policy is agreed
before the metric is — and it is how a blank row, the visible hole in a
deployment, gets made by hand. **CI+** on that row is how it stops being blank.
Uploading a workbook is the other way structure arrives, and it writes through
the same `addNode` / `addControlItem` the sheet uses.

Deletion is destructive — a Goal carries every Objective, Control Item
and stored figure beneath it — so it runs in two steps. The first click reports
exactly what would be lost ("removes 7 rows beneath it, 7 Control Items, 315
stored figures"); only a second, explicit confirmation removes anything. The
same two-step confirmation guards deleting a Control Item that already has data
keyed against it.

#### Who is responsible for a measure

The measure form carries an optional **Responsible** field: the individual who
keys the number. It is optional on purpose — the Department stays the required
accountability, and this names a person inside it.

Naming somebody has two consequences, and the second is the point.

They can key that measure. `canEditControlItem` already treats a named
responsible person as authorised *before* it checks org units, so they can
enter its actuals and its targets on any unlocked version whatever division it
is filed under. That is how a measure owned by one division but kept by a named
person in another gets its numbers, without handing anyone a whole division.

**The month-end reminder narrows to them.** A measure with somebody named is
chased at that person and not at their division lead; a measure with nobody
named falls back to org-unit coverage as before. Without the narrowing, naming
someone would only ever add mail rather than move responsibility, and a lead
would keep receiving a chase for every measure in their division — the surest
way to teach them to filter these to trash. The one exception is a name
pointing at a deactivated account: they are not among the candidates at all, so
the fallback applies and the lead is chased. A measure must not go quiet
because somebody left.

Who may be named is scoped server-side by `assignableUsers()`, the same shape
and the same reasoning as `assignableDics()`: a SUPER_ADMIN or EXECUTIVE may
name anyone active, an OWNER only people in their own org unit or a department
beneath it. The picker offers existing accounts only and never creates one — if
somebody has not been invited they do not appear, and the lead knows to ask an
admin. The measure's current holder is always listed even when outside the
picker's scope, so an edit cannot silently unassign someone.

#### Editing a measure

The pencil on a measure row opens its whole form, not an inline rename: a
Control Item has eight settings and only one of them is its name. Name, the
Control Item text, unit, roll-up, direction, decimal places, where it is filed
and its business unit are all editable in place. The **code** is not — a formula
addresses the measure by it, so changing it would break every formula pointing
at it silently.

**Where it is filed is asked for as the cascade reads it: Business unit, then
Division, then Department.** Picking a division re-lists the departments to
that division's own, so the second choice can only narrow the first. Level 4 is
the only level with a Department field at all — Levels 1-3 are company
measures, filed to a division and to nothing narrower, which is how the data
has always been (`prisma/uat/goals.ts`: company measures carry `AUTO`, `FRC`,
`OX`; Level 4 measures carry `AUTO-PRD`, `OX-PTS`). Before this the two were
one flat list holding divisions and departments together, which asked the
reader to know which of the eighty-odd codes was which.

Only one field still leaves the form, because one field is what is stored:
`dic_org_unit_id` is the department when one is chosen and the division when
there is not. A measure filed somewhere the editor cannot reach keeps its org
unit, shown as `current` rather than quietly re-filed to whatever happens to be
first in their own list.

Two guards beyond the usual role and year checks.

**Moving a measure to another Department needs authority over both ends.**
Filing work onto a division is the same act whether it is new work or work
being handed over, and `addControlItem` already asks permission for it, so an
edit asks the same. A division lead may move a measure of theirs down into one
of their own departments; they may not push it onto a division that never
agreed to it.

**Roll-up and direction are refused when a locked version holds figures.**
Those two are the settings that reach back through stored numbers: switch sum
to average and a closed quarter reads differently; switch higher-is-better to
lower and every achievement and evaluation symbol on that row inverts. Doing
either to a locked version rewrites what was committed, so it is refused for
every role including SUPER_ADMIN — the same rule, and the same helper, that
stops a delete taking a closed figure with it. Everything else about the
measure stays editable while the lock stands, because a name and a Department
change nothing a closed version says.

Before this existed the only thing that could change was the name, so a
measure filed against the wrong Department was stuck there for the year: the
only alternative was to delete it, and that takes every figure ever keyed
against it.

#### Reordering by dragging

In edit mode every row also grows a grip on its right-hand end. Dragging it
moves the row **among its own siblings at its own level** — an Objective moves
among the Objectives under the same Goal, a Control Item among the Control
Items of the same Objective — and a drop line shows where it will land. Drag it anywhere else
and no line appears, because there is nowhere valid to drop it.

"Within their level" is not cosmetic. A Level 2 Objective can carry Level 3
Objectives continuing the company breakdown *and* Level 4 department branches
laddering into it, side by side under one parent. Reordering the Level 3 rows
must leave those branches exactly where they were, so `lib/structure/reorder.ts`
treats the positions the same-level rows occupy as fixed slots and reshuffles
only what sits in them. Nothing else moves.

The server writes `sort_order` and nothing else — never `parent_id`, never
`org_unit_id` — so a reorder can rearrange a list and can never re-file a row
under a parent its author has no business touching. The target sibling is sent
by id rather than by index, and one that is not a sibling at the same level is
refused outright. Authority is the same as renaming, because that is what a
reorder is: it changes how the plan reads, not what it records. Locked
versions are deliberately not consulted for the same reason; `canEditInKi`
still applies, so a closed year stays closed.

#### Level 4, and who may touch it

`lib/structure/actions.ts` draws one hard line: **Levels 1-3 are ADMIN-only.**
They are what every division ladders into, so a local edit there would move
the ground under everyone else. **Level 4 is different** — a division or
department lead (`OWNER`, with their `org_unit_id` set to that division or
department) may build their own corner of the deployment without an admin in
the loop:

- **"L4+"** appears on every Level 3 Objective and nowhere else, for ADMIN and
  OWNER alike — the Objective itself is company-wide and owned by nobody, so
  anyone permitted to add Level 4 work may open the form there. What the form
  actually restricts is *which* division or department the new branch is filed
  under: an OWNER's picker only ever offers their own org unit and whatever
  sits beneath it (`assignableDics()`, scoped server-side, never merely
  hidden). Laddering from a Level 3 is the point of this button — a department
  lead picks up the company's own deployment of a Goal, not the Goal's
  Objective directly, and not another department's branch. The cost of that
  line is a two-step act where the company has not deployed to Level 3 yet:
  someone with company-wide rights has to make that Level 3 first.
- Once a branch exists, its owning lead can extend it — add a Control Item to
  it, start a second branch off the same company Objective, rename or delete
  any of it — the same way an ADMIN can, but never outside their own org unit or a
  department beneath it. `components/sheet/permissions.ts` mirrors this rule
  client-side to decide which pencils and trash cans to draw; every action
  re-derives the real answer from the database regardless of what the toolbar
  showed.
- Adding a measure to a Level 3 Objective is refused outright, even for an
  ADMIN — the next step from Level 3 is always a Level 4 branch, and that must
  carry an org unit, which is why **L4+** asks whose it is. An Objective made by
  a generic "add anything" path would belong to nobody.

#### The Division/Department view

The company sheet's **View** toggle folds Level 4 in on demand: "Company"
shows Levels 1-3 exactly as before, "+ Departments" nests every Level 4 branch
directly beneath the Level 3 Objective it ladders into — no separate page,
no second fetch to reconcile. Once departments are on the sheet, a **Division**
selector narrows the **Department** filter to one division and everything beneath it in
one click ("Departments in a Division"), and picking a specific department
chip narrows it to just that ("just the Department").

Because the two controls sit side by side, the department chips carry only what
the Division has not already said. With no division chosen they read
`AUTO-PRD — Product`; choose AUTO and the same chip reads `PRD — Product`. The
code is never dropped, only shortened, and only inside its own division:
department names repeat across divisions — Network Development is both AUTO-ND
and PSP-ND — so a list spanning divisions needs the codes to tell them apart.
Shortening is also checked rather than assumed, since Admin → Departments takes
any code an admin types: a code that does not begin with its division's is left
whole (`components/sheet/dic-label.ts`).

The per-division
`/division/[code]` page still exists for a narrower, single-division view with
the same editing rights, reachable by URL. It is deliberately **not** in the
top nav: a Divisions menu there did what the sheet's own Business unit,
Division and Department filters already do, one screen closer to the numbers.

#### Managing the pick list

Divisions are seeded; Departments are not fixed — Admin → Departments lets an
ADMIN add one under an existing division (a code and a name) or remove one,
which is what populates the Department picker everywhere else on the sheet. Removing
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
Goal, numbered, down through its Objectives, down to whichever
Departments have laddered a Level 4 branch in underneath, on one continuous
page with a connecting line the eye can follow.

It is deliberately plain: no version picker, no filters, no editing surface,
read-only for every role including VIEWER. Performance still shows — one
evaluation symbol per Control Item — but small and quiet, never the point of
the page; there is no rollup or invented "worst" verdict for a branch, which
would misrepresent a scale where the two extreme bands (□ far above, ■ far
below) are not simply good and bad ends of one line.

Each measure carries its four quarters down the right-hand side, one figure
per quarter, so a reader can see where the work stands without opening the
sheet. Which figure it is belongs to the calendar rather than to the reader:
once a quarter has closed the **actual** is shown, set in ink and carrying its
evaluation symbol; while a quarter is still running or still ahead the
**target** is shown instead, quieter and italic. A closed quarter nobody has
keyed a figure into yet falls back to its target and is marked as one — a
blank would read as "we scored nothing" rather than "nobody has told us".
The rule is `components/sheet/quarter-figures.ts`, tested in
`lib/calc/quarter-figures.test.ts`.

The one thing this page insists on showing is the gap: most Objectives in a
given Ki have no Level 4 branch yet, and rather than rendering nothing under
them, the page says so plainly — "— nothing yet ladders in here —". A blank
cascade is exactly as visible as a full one, which is the actual point of
building it: the absence of alignment is the thing a slide deck hides and
this page cannot.

#### Narrowing it

A wall chart of ninety measures is only readable a division at a time, so the
page carries the sheet's own scope controls: the **Company / + Departments**
toggle, a **Business unit** picker and a **Division** picker. They are the
sheet's in the literal sense — the same `matchRows`, so a selection means here
exactly what it means there rather than nearly.

Division behaves a little differently than it does on the sheet, where it only
narrows the Department picker beside it. There is no Department picker here, so
choosing a division *filters*, and it means the whole subtree: AUTO keeps AUTO's
own measures and every AUTO-* department's too. That is done by expanding the
division into its own code plus its departments' and handing the result to the
same filter, rather than by writing a second rule that could drift from the
first.

Worth knowing before you lean on it: `matchRows` keeps a heading only when
something under it survived, so a filtered cascade hides the Objectives that
division has not deployed into. Unfiltered — how the page opens — every gap is
still there. Narrowed, the page answers "what is this division doing", not
"where has this division not shown up".

Structurally there is nothing new to fetch or compute — `buildCascadeTree` in
`components/sheet/outline.ts` just re-nests the same flat `loadSheet({ levels:
[1, 2, 3, 4] })` rows the "+ Departments" sheet view already uses, keyed off
each row's existing `path` ancestry, so a Level 4 branch always renders
exactly where it structurally attaches — under the Level 3 Objective it
ladders into — with no possibility of drifting from what the sheet itself
would show.

### Why a measure means what it means

The definitions of Control Items and their targets get argued about, and until
`/rationale` the plan kept no trace of either. A Control Item carries
`measured_as` — a short label like "Units sold" — which names the measurement
method without defining it: whether that is retail or wholesale, invoiced or
delivered, net of cancellations, lived only in a meeting nobody minuted. And
`entry_audit` records that a figure changed, by whom and when, with no column
for why.

Two kinds of record, because they have different lifetimes.

| | **Definition** | **Target rationale** |
|---|---|---|
| Answers | What is counted, and where the figure comes from | Why the target is this number, and what it assumes |
| Belongs to | The measure | One year's targets |
| Carries a version | No | The version it explains — OB, 2QFC — so a revision reads as a revision |
| Next year | Copied forward with the measure | Stays where it was written |
| Revising it | Write a new one; the newest stands | Add an entry; the log is the history of the argument |

**Nothing is ever updated.** The table is append-only, the same rule
`entry_audit` follows and for the same reason: reasoning that can be quietly
rewritten is worth nothing in the argument it exists to settle. A revised
definition is a new row and the one it replaced stays readable behind an
"earlier versions" disclosure. A mistake — the note pasted against the wrong
measure — is **withdrawn**, by its author or a super admin, which marks the row
rather than removing it. That is deliberate: a delete button on a dispute log
would defeat the log.

The screen is a destination in the nav, like the cascade and insights, because
it is read at a different moment than the sheet — before the year starts, and
in the middle of a review when somebody disputes a definition. It is the only
one of the three you also write to, because filling ninety gaps through ninety
round trips is not a thing anybody would do. Writing is inline, at the row,
never a modal. A **Nothing recorded** preset narrows to the measures carrying
neither, which turns the page into a worklist, and every filter travels in the
URL so that worklist can be sent to whoever has to fill it in.

Nothing about it appears on the sheet. No column, no marker.

Who may write is the same rule as who may key a figure —
`canEditControlItem`, so an OWNER writes against measures they are responsible
for or whose department is their own, and a VIEWER writes nothing. Two
deliberate differences from the figure rules:

- **A locked version does not block a note.** The lock exists so a closed
  figure cannot be rewritten; a note is not a figure, and writing down after
  the fact why OB was set the way it was is the case this table exists for.
  Refusing it would leave the years that matter most as the ones nothing can
  be said about.
- **Withdrawal is the author's, not the measure owner's.** Being able to edit
  a measure is not the same as being able to take back somebody else's stated
  reasoning. Disagree by adding your own.

### The month-end review

`/insights` is the page a monthly review is held on. It replaced a
symbol-distribution heatmap — one Division per row, one month per column,
each cell a stacked bar — which was removed rather than improved, and the
reasons are worth keeping because they are the trap this page has to stay out
of:

- **The bar hid the size of the problem.** PSP carries 24 measures and FRC 5;
  both drew one bar of the same width. A five-band split of 24 measures gives
  segments under 3px.
- **It was a dead end.** No cell linked anywhere, so seeing red told you a
  division and a month and left you to start again on the sheet.
- **It hid the level that acts.** Departments counted into their Division's
  bar, so a department with everything failing was invisible inside a division
  that was mostly fine.

A monthly Hoshin review asks four questions in order, and the sheet already
answers two of them well — *what is off track* is the **Below target** preset,
and *who owns it* is the responsible person on the row, with
`/control-item/[id]` carrying the trend, every version overlaid, and the audit
trail. This page exists for the other two, which nothing answered before it:
**is the data even in**, and **what is getting worse rather than recovering**.

So it is three blocks under one anchor month:

**Reporting** — "68 of 82 actuals in", and when it is not complete, who to ask:
one line per person, most outstanding first, with their measures named and
linked on the line. One line per *person* rather than per measure is the whole
point — eighty-two measure names is a wall, and "the Automotive Director owes
twelve" is a sentence somebody can act on. A measure naming nobody groups under
its own org unit and says so, which makes the gap in responsible users visible
rather than silent. Measures with no target for the month are counted
separately and quietly: nobody planned it is a different failure from nobody
reported it, and the sheet hides both behind the same em dash.

**Needs attention** — every measure below target that month, ranked by
movement rather than by depth: worsening first, then holding, then recovering,
worst achievement first inside each. That ordering is the point. A measure at
92% falling from 110% is the meeting's business; one at 92% climbing from 80%
is somebody's plan working, and a list sorted by level alone would put the
second above the first. Each line carries the measure's own twelve-month strip
of symbols, so "it has been ■ for four months" is visible where the question is
asked rather than in a grid where it is averaged in with everything else — that
strip is what made the heatmap unnecessary.

The list is capped at fifteen, and the cap says what it cut ("48 more below
target, 10 of them still falling") with a link to the sheet. A page that lists
every below-target measure has quietly become the sheet again, and the sheet
does that better.

**Movement** — the three largest gains and falls since the previous month,
deliberately on both sides of target. A measure recovering from 60% to 85% is
still failing and is still the good news in the room; one falling from 130% to
105% is fine and still worth noticing.

Two rules the page will not break. The month it opens on is **the latest month
carrying any actual**, not the open month that `/my-entries` and the reminder
chase — those chase the month still being *keyed*, and a review looks at the
last month there is something to review; the month selector moves between them,
and picking the open month is how the chase list is read. And **movement needs
a width**: a change under one point of achievement is flat, or every row lands
in "worsening" on rounding noise.

`lib/calc/review.ts` holds all of it — pure, no React and no Prisma, tested
directly in `lib/calc/review.test.ts`, and reusing the below-target predicate
from `components/sheet/below-target.ts` rather than restating the comparison so
that direction-aware achievement keeps one definition. The page costs one
query: everything on it is derived from the same `loadSheet({ levels: [1, 2, 3,
4] })` model the sheet and Cascade already use.

### Exporting to Excel

**"Export to Excel" downloads the sheet as it is on screen** — the same rows,
narrowed the same way. Business unit, Division, Department, Below target, Find
and the Company / + Departments view all travel in the link, along with the
pinned target version and the year being worked on. The workbook has three
tabs:

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

#### The filters travel with the output

Both **Export to Excel** and **Print view** carry the toolbar's state in their
link, and the far end applies it with `matchRows` — the sheet's own filtering
function, not a second implementation per destination. Neither used to: a
reader who had narrowed to one division exported all ninety measures and had to
narrow it again in Excel, or did not notice and circulated the wrong thing.

| Parameter | Carries |
|---|---|
| `bu` | business unit codes, comma separated |
| `dic` | Division and Department codes |
| `below` | `1` for the Below target preset |
| `q` | the Find text |
| `levels` | `1234` when + Departments is on, so the print shows what the screen shows |
| `version` | the pinned target version |
| `columns` | `quarters` on the print link when the sheet is condensed |

Only what is set is written, so an unfiltered sheet still links to a bare
`/api/export` — the common case stays shareable and the query readable. The
printed page names what it was narrowed to in its title, because an A3 on a
wall showing three quarters of the plan with nothing admitting to it is worse
than no A3. `viewToParams` / `paramsToView` in `components/sheet/filters.ts` are
the two halves, and `lib/calc/search.test.ts` round-trips them: a serialiser and
a parser drift silently otherwise, and the symptom would be a link that looks
right and a file that quietly holds everything.

### Admin in five sections

Eight panels on one page had become two screens of masonry, and the two-column
layout made the reading order zig-zag between groups with nothing to do with
each other: the evaluation scale, touched twice a year, sat beside the user
list, touched weekly, at exactly the same weight.

So `/admin` is grouped by **the thing being administered** — Year, Structure,
Organisation, People, Evaluation — and shows one group at a time. Each name is
a noun somebody already uses, and the group's own line says what is in it, so
the rail answers "where would I find…" before anything is clicked.

Which section is in the URL rather than in component state, the same way the
sheet carries its columns and the review its month: `/admin?section=people` can
be sent to somebody, a refresh lands where they were, and the `router.refresh()`
that follows every action keeps the section it was performed in. An unknown
section falls back to the first rather than erroring — a stale bookmark should
land somewhere useful, not on a page about the bookmark.

Three smaller things follow from the same reading. The content column is capped
rather than full width, because a form row stretched across 1,200px puts a
label and its control at opposite ends of the screen. **Empty year** is set
apart from **Make current** by a rule instead of sitting flush against it —
adjacency is how the wrong button gets clicked. And the result banner is sticky,
because the button that produced it can be a screen and a half down a section.

### Uploading a workbook

There was a way out of the plan and no way in: `copyStructure` carries next
year's shape but no values, and the paste handler takes 500 clipboard cells at
a time. **Admin → Upload a workbook** takes a whole spreadsheet, and because a
file can change hundreds of rows at once the design is mostly about the powers
it refuses to take.

> **The upload adds and updates. It never deletes, never renames, never moves.**

- A row whose **Code** matches an existing Control Item writes that item's
  figures, and changes nothing else about it.
- A row whose Code is unknown can **create** an Objective and Control Item, and
  the Goal or parent Objective above it if either is not there yet — matched by
  statement, so a statement that matches nothing is created rather than treated
  as a rename of whatever looked closest.
- Anything the file does not mention is **left exactly as it is**. There is no
  sync and no deletion; an empty cell means "nothing to say about this month",
  never "clear it". A trimmed sheet cannot erase a year.
- An existing Code whose row points at a different Objective or Department is
  **refused and named**, not moved. Moving work between divisions is the
  both-ends-authority act `updateControlItem` guards, and a stale column must
  not perform it eighty times in one click.
- Unit, roll-up, direction and decimals on an existing Code are **left alone**
  and reported when they differ. Those reach back through closed figures, and a
  bulk path is the last place to change what a stored number means.

Creation is **opt-in per upload** — an unchecked "let this file add new rows to
the plan" — so the ordinary use cannot grow the plan on a typo in a code. New
**Level 4** rows are refused whatever the checkbox says: a department branch
carries an org unit and ladders into an Objective above it, and the file states
neither, so it is started on the sheet where both are chosen.

Every figure goes through `saveEntry` and every new row through the same
`addNode` / `addControlItem` the sheet uses. The upload is a faster way to do
what the screens do and never a second way in: the permission check, the flat
refusal on a locked version, the audit row and the formula recompute all still
happen per cell, and a cell beginning `=` is still a formula.

#### The template

**Download template** in the panel gives a workbook for the Ki selected beside
it — a real file, not a description of one. It carries the fifteen columns the
importer reads and nothing else, and it comes back two ways depending on the
year:

- a year with a plan arrives **pre-filled** with its own measures, so "edit it
  and send it back" is the round trip it always was;
- a year nobody has typed into arrives **empty** — the headings, the dropdowns
  and a Reference sheet.

That second case is why this exists. The panel used to point at the export for
a template, which cannot help the person with the most to upload: next year has
nothing to export. Two smaller reasons follow. Seven of the export's twenty-two
columns are results rather than inputs — Gap, Achievement, Evaluation,
Evaluation label, Period type, Ki, Target basis — so handing it over invites
somebody to fill in Achievement and wonder why nothing happened. And the
template is reachable from the panel that uploads it, rather than from a button
on another page mentioned in small text.

The **Department**, **Business unit**, **Unit**, **Aggregation**, **Direction**
and **Period** columns carry Excel dropdowns, pointed at a Reference sheet
listing exactly what the parser accepts — the org chart and this Ki's own
months, and the vocabulary imported from `lib/import/plan.ts` rather than
retyped, so a template cannot offer a value the upload then refuses. Reference
also says which columns a **new measure** needs as opposed to a figure update,
and carries one worked row. Nothing is pre-filled on the Upload sheet of an
empty year on purpose: an example left in place is a measure nobody meant to
create.

#### Definitions upload too

A third sheet, **Definitions**, carries what each measure counts and why its
target is that number — one row per measure, not per month. That grain is the
whole reason it is a separate sheet: the Upload grid is one row per measure per
month, so a Definition column there would ask for the same paragraph twelve
times and give it twelve chances to disagree with itself.

| Column | Read? | |
|---|---|---|
| Code | Read | Which measure. This sheet never creates one |
| Measure | Ignored | Context, so a list of codes is usable |
| Definition | Read | Pre-filled with what is stored. Edit it to revise it |
| Rationale to add | Read | **Added** as a new dated entry, never a replacement |
| Rationale recorded so far | Ignored | What has already been said, greyed, beside the box for adding to it |

Definition is pre-filled and Rationale is not, and the asymmetry is the point:
a definition is replaced by its newest version, so editing what is there is the
right gesture; a rationale entry is dated, attributed and already read by other
people, so the file offers a box to add one and shows the existing log where it
cannot be typed over.

**Sending the same file twice is safe**, which matters because the way a
template is actually used is download, fill in a few, upload, notice one more,
upload again. A definition matching what is stored writes nothing — compared
the way statements are compared, trimmed and whitespace-collapsed, so a
paragraph Excel reflowed is not a revision of itself. A rationale matching the
newest entry already on that version is skipped and reported under "differences
left alone" rather than silently. An empty cell still means "nothing to say",
never "clear it". And two rows disagreeing about one measure take the first and
say so, because taking the last would make the answer depend on row order.

Anything written this way is stamped with the uploader's name, today's date and
the version the Target column writes to — you are uploading OB's numbers and
OB's reasons in one file.

`tests/template.test.ts` sends the generated file straight back through
`readWorkbook`, and fills a blank one in and runs it through `buildImportPlan`
— the two modules that have to agree about column names live apart, so the
round trip is the only thing that catches a heading changed on one side. It
also asserts that the Definitions sheet does not become the sheet the *figures*
are read from: the reader used to take the first worksheet carrying rows, which
was right only because Upload happened to be added before Reference, and with a
third populated sheet that was one reorder away from reading definitions as a
plan. It names the sheets now.

**The Data tab of an export uploads too** — export, edit, upload back. A
hand-made sheet with just `Code`, `Period` and `Target` works as well, because
columns are found by *name*: order does not matter and extra columns are
ignored. Three details that bite in practice are handled rather than documented
away:

- Only `Period type` = **Month** rows are read. Quarters and the Ki total are
  rolled up at read time and there is nothing behind them to write into.
- The structure columns are `Goal`, `Parent objective` and `Objective` — the
  row's own statement is **Objective**, and `Parent objective` is blank on a
  Level 2 row, whose parent is the Goal itself. A workbook exported before the
  tree was flattened still carries a `Theme` column, and is refused by name
  rather than misread: its Goal/Theme/Objective columns are the ancestors of a
  row whose own name sat in a `Measure` column, so reading them as they stand
  would report a rename on every line.
- `Period` is accepted as `2026-04` **or** as a real date, because Excel turns
  the first into the second the moment somebody retypes the cell.
- The version the **Target** column writes to is chosen on the form, not in the
  file — and when the file's own basis stamp disagrees with it, the preview
  says so. An export taken on "latest forecast" carries a *resolution* across
  versions, and writing that into OB would copy it over the original budget.

Nothing is written until a second click. **Preview** reports what would happen —
"3 targets · 1,085 already matching · 1 refused" — with creations listed by name
and refusals grouped by reason; **Apply** re-plans the same file from scratch
and executes it. Re-planning rather than carrying a plan between the clicks
means there is no server-side state to go stale: what is applied is decided
against the database as it is at that moment. A figure identical to the stored
one is counted as *already matching* rather than rewritten, so re-uploading last
month's file does not fill the audit trail with writes that changed nothing.

`lib/import/read.ts` turns bytes into rows, `lib/import/plan.ts` decides what
they would do — pure, no exceljs and no Prisma, so the whole contract is tested
directly in `lib/calc/import-plan.test.ts` — and `lib/import/actions.ts` is the
only part that touches the database.

### My entries on a phone

`/my-entries` is the one screen built for a phone, because the thing that
drives it — the month-end reminder — arrives by mail, and mail is read on a
phone. A reminder somebody cannot act on where they read it is a nag rather
than a prompt.

Below the `sm` breakpoint each measure becomes a card: what it is, what was
asked for, and one large box for the figure, with the gap and the save state
underneath. From `sm` up it is the same dense table as before. Both layouts
render the *same* input through one `actualInput` helper, so there is one save
path, one keyboard contract and one set of states — a second input for the
small screen would be a second thing to keep correct.

Two numbers in that layout are stated in pixels rather than rem utilities, and
both are deliberate. The field is at least **44px** tall, because this project
sets a 13px root and `h-11` therefore lands at 36px — under a comfortable touch
target. Its text is **16px**, because iOS zooms the whole page when a focused
input is smaller than that, which on this screen slides the field you are
typing into out from under the keyboard.

The app shell changes with it. The desktop frame is a fixed-height layout with
its own scrolling panes — right for a seventeen-column grid, wrong for a phone,
where the browser chrome moves and the keyboard takes half the viewport — so
below `sm` the page scrolls the way every other page on a phone does. The nav's
links collapse behind a single menu from one shared list, so somebody arriving
cold from a reminder is never stranded on the page they landed on.

**The sheet is deliberately not part of this.** Seventeen columns belong on a
large screen, and pretending otherwise would produce something unusable on both.

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
candidate face individually. It is not linked from the menu — nobody using the
plan needs it — so type the path.

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
npm test              # 417 tests, about seven seconds
npm run test:unit     # the pure modules only, no database needed
npm run check:ui      # browser checks, against a running dev server
```

`check:ui` covers what a unit test cannot see, and every assertion in it is a
bug that was actually found rather than a hypothetical: a filter panel opening
off the right edge of the window with no way to reach the options past it; a
filter panel that would not close by pen, by touch, by tabbing past its last
option, or when the window was resized under it; `/my-entries` unusable on the
phone the month-end reminder is read on; and an edit form still holding the
previous measure's values after the pencil on a second one was clicked, under a
heading naming the second. It runs at five window widths from a
1024px laptop to 1920px, and on three phone profiles, and exits non-zero on the
first failure.

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
- `lib/calc/next-path.test.ts` — where a sign-in may send someone: every case
  is a way past a naive `startsWith("/")` guard, which is what makes them worth
  pinning — the failure is silent and only shows itself on another domain
- `lib/calc/paste.test.ts` — laying a pasted block over the grid: Excel's
  trailing newline discarded rather than clearing a row nobody selected, and a
  block wider than the year clipped rather than wrapped onto the next measure
- `lib/calc/below-target.test.ts` — what "currently below target" means, with
  the two wrong answers pinned as the thing it must not do: the Ki total (a
  year of target against a part-year of actual) and the calendar month (which
  is usually not keyed yet)
- `lib/calc/rotate.test.ts` — that a bulk password rotate never issues a
  password to a Microsoft-only account
- `lib/calc/entry-state.test.ts` — what a keyable box shows and when a blur is
  worth a write: a formula seeded as written rather than as its result, a
  plain number seeded without thousands separators, and a tab-through that
  changes nothing writing nothing
- `lib/calc/quarter-figures.test.ts` — the cascade's one-figure-per-quarter
  rule: actual once a quarter has closed, target while it is open, and the
  fallback when a closed quarter has nothing keyed into it yet
- `lib/calc/reorder.test.ts` — dragging a row among its siblings, including
  that a Level 4 department branch keeps its position when a Level 3 Objective
  beside it moves
- `lib/calc/review.test.ts` — the month-end review's rule: worsening ranked
  above holding above recovering, a lower-is-better measure staying in the same
  list as the rest, an unreported measure never counted as failing, the first
  month of the Ki reading as "new" rather than as improved, a sub-point drift
  counting as flat, and the attention cap saying how much of what it cut is
  still falling
- `lib/calc/dic-label.test.ts` — a department chip carrying only what the
  Division control has not already said, and never letting two same-named
  departments read alike
- `lib/calc/item-label.test.ts` — a Control Item named for itself only when its
  Objective carries more than one
- `lib/calc/import-plan.test.ts` — what an uploaded workbook may do: an empty
  cell never a deletion, a stale Objective column refused rather than obeyed, an
  unknown code refused unless creation was asked for, a figure that already
  matches counted rather than rewritten, and a Level 4 row sent back to the
  sheet
- `lib/calc/emphasis.test.ts` — bold and italic in a statement: an unmatched
  marker staying literal, `AUTO_ND` never turning italic, and a tooltip never
  showing an asterisk
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

Gap analysis and countermeasure text (deferred by design — `control_item_note`
now has the place for it: a third value in `NoteKind`, beside DEFINITION and
RATIONALE, rather than a third table. Nothing is built), approval workflow, notifications, chat integrations, weighted
roll-up or contribution scoring between levels, initiatives or task tracking
beneath Control Items, and mobile-optimised entry. The application is
desktop-first and does not break on a tablet.

Microsoft sign-in used to be on this list and no longer is — see
[Signing in with Microsoft](#signing-in-with-microsoft). What remains unbuilt
around it is Entra group → role mapping and SCIM provisioning, both noted
there.
