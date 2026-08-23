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

Local email and password via Auth.js with bcrypt. Every auth call in the
application goes through `lib/auth/session.ts`; the only file that knows *how* a
user proves who they are is `lib/auth/providers.ts`. Dropping in Entra, Okta or
LDAP later means adding a provider there and mapping its claims onto
`AuthenticatedUser` — no screen and no server action changes. SSO is not built.

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
| `/admin` | Ki setup, version locking, structure builder, copy-from-previous-Ki, evaluation scale, users |
| `/symbols` | Symbol rendering check for a platform you are deploying to |
| `/api/export` | Excel download of the current sheet (`?division=CODE` for a Level 4 sheet, `?version=ID` to pin the target basis) |

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
npm test              # 192 tests
npm run test:unit     # the pure modules only, no database needed
```

- `lib/calc/calc.test.ts` — roll-up, baseline resolution, achievement, gap,
  bands, row assembly, formatting
- `lib/calc/outline.test.ts`, `lib/calc/columns.test.ts` — row/column outline
  geometry: level-based indentation, Goal numbering, quarter condensing
- `lib/calc/structure-permissions.test.ts` — the client-side permission mirror
  that decides which pencils and trash cans to draw, checked against every
  role/level/org-unit combination
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
