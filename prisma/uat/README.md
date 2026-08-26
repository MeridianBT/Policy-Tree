# UAT dataset — Honda Australia

The real Honda Australia org structure - six divisions and thirty-eight
departments, as supplied - carrying **invented** targets and actuals, for user
acceptance testing and for demonstrating the platform to a leadership team.

Say that second part out loud when demonstrating it. The company, the
divisions and the departments are real, which makes the numbers beside them
look real too. They are not: no figure in this dataset came from Honda. What
is real is the market the targets are set against - see below.

## Loading it

```bash
npm run db:seed:uat      # additive — leaves any other Ki in place
npm run db:reset:uat     # drops everything first, for a single-dataset demo
```

`db:seed:uat` is additive and idempotent, so it can be re-run. It makes 103KI
current, so the app opens on it. Note that any previously seeded demo data
stays in the database — the Divisions menu will still list the old divisions,
and the sheet's DIC picker will still offer them. For a clean demo with nothing
but this dataset, use `db:reset:uat`, which drops the database first.

## What it contains

| | |
|---|---|
| **103KI** | Apr 2026 – Mar 2027, current. 82 Control Items, 2,296 figures |
| **104KI** | Apr 2027 – Mar 2028, created empty so the multi-year workflow can be shown |
| Structure | 5 Goals, 13 Level 2 Themes, 15 Level 2 Objectives, 2 Level 3 Themes, 3 Level 3 Objectives, 8 Level 4 department branches |
| Org | 6 divisions, 38 departments — AUTO, PSP, BMD, OX, CS, FRC |
| Business units | AUTO 54 measures · MC 16 · PP 10 · SHARED 2 |
| Data | PRB targets for all twelve months, OB targets a little under them, actuals keyed April–July |
| People | 14 accounts, password `hoshin` — see below |

The five Level 1 Goals are Profit and Growth, Brand, Customer, Network and
People.

## Business units

One plan, four tags. The five Goals are the company's, and each business unit
deploys against the same five rather than keeping a plan of its own.

| Tag | What it covers |
|---|---|
| `AUTO` | Automobiles — the original 54 measures |
| `MC` | Motorcycles, scooters, ATV and side-by-side |
| `PP` | Power products — generators, mowers, trimmers, marine outboards |
| `SHARED` | Measures that span every unit: safety, core systems |

Nothing is ever summed across them. Filtering to MC shows motorcycle rows
only; selecting nothing shows all 82 side by side, which is the consolidated
company view. A motorcycle volume and a car volume are not addable, and the
sheet never pretends otherwise.

## The market it is set in

Targets are set against the Australian new-vehicle market as it stood in
mid-2026, so the numbers survive contact with people who know the industry:

- **A record market.** July 2026 delivered 108,577 vehicles, past the previous
  July record; the June quarter set an all-time high of 330,111.
- **Electrification at a tipping point.** BEVs took 21.7% of July 2026 and
  17.3% year to date. BEV, PHEV and hybrid together were 49% of the June
  quarter.
- **NVES is live and now public.** CO2 limits of 117 g/km for passenger
  vehicles in 2026 and 180 g/km for light commercials, at a $50 liability per
  gram over, with manufacturers missing the target named publicly from
  February 2026 and penalties issued from 2028.
- **Chinese brands are taking share.** 24% across the first two months of 2026,
  up from 14% a year earlier; 35.5% of June 2026 sales were China-built.
- **Front-end margin is thin.** Australian dealers run around 3.5% net profit,
  back to thirty-year averages — which is why aftersales carries this plan.

### Motorcycles and off-highway vehicles

- **A market growing on off-road.** 46,023 units in the first half of 2026,
  up 8.2% on the 42,549 of H1 2025.
- **Off-road is carrying it.** 20,417 units in H1 2026, up 21.6% — and inside
  that, kids' bikes up 32% and light trail up 131%. Road was broadly flat and
  OHV almost exactly flat (6,764 against 6,760).
- **Honda leads.** 21,901 units and 19.6% share across 2025, the top brand,
  and top in five segments: Agriculture, Fun, Trail, Scooter and Naked.
- **Scooters are a Honda stronghold.** The segment climbed 18.8% in H1 2026
  with Honda holding 39% of it, against Vespa on 15.25%.
- **Share is the pressure point.** Honda's own sales are up 3.6% in 2026
  against a market up 8.2% — growing, and losing share while doing it. That is
  the story the MC measures tell.

### Power products

- **A market worth about A$600m and growing.** Australian outdoor power
  equipment was USD 407.9m in 2022, forecast to USD 610.2m by 2030 — a 5.2%
  CAGR. Australia is 0.8% of the global market.
- **Mowers are the biggest slice**, 40.55% of revenue.
- **The shift is to battery.** Cordless and zero-turn are taking residential
  share from petrol, which is why `PP-BATT` is the measure furthest behind
  plan and climbing fastest.
- **Outboards are a global mid-single-digit market**, USD 9.79bn in 2026 at a
  5.0% CAGR, with dealers still 67% of the channel. Australian outboard unit
  data is not published the way vehicle data is, so the marine target is
  scaled from the segment's share of the range rather than from a market
  total. It is the softest number in the dataset.

## The story the data tells

Deliberately mixed. A demo where everything is green teaches a leadership team
nothing, and one where everything is red is not credible.

- **Under pressure**: market share drifting below plan in cars *and* bikes,
  NVES CO2 above the 117 g/km limit with a liability accruing against it,
  dealers still trading at a loss, technician vacancies, road motorcycle
  volume, and mowers and trimmers losing ground to battery rivals.
- **Recovering**: contact centre answer rates, EV consideration, high-voltage
  certification, lapsed-customer recovery, battery share of power products,
  motorcycle brand consideration and the power products warranty rate — all
  moving the right way month on month.
- **Ahead**: digital cost per lead, configurator completion, off-road and
  kids' bikes, scooters, generators, marine outboards and motorcycle parts.

Kids' and light trail bikes sit in the top band, above 120% of plan. That is
deliberate and it is real: it is the segment that grew 131% in the half.

## Accounts

Password for all of them is `hoshin`.

| Email | Role | Sees |
|---|---|---|
| `md@honda.example` | SUPER_ADMIN | Everything, plus the year selector and Admin |
| `gm.auto@honda.example` | EXECUTIVE | The whole plan and the year selector, but no Admin and no locking |
| `auto.director@honda.example` | OWNER · AUTO | Automotive and its departments |
| `ox.director@honda.example` | OWNER · OX | Ownership Experience, parts and service |
| `service.manager@honda.example` | OWNER · OX-SVC | One department only — the narrowest view |
| `board@honda.example` | VIEWER | Read-only, no entry screen |

Signing in as the Ownership Experience director and then the service manager
is the quickest way to show scoping without explaining it.

## Reading the sheet mid-year

Two things look alarming at first glance and are not:

- **Quarter columns for a part-finished quarter.** Q2 holds July only, so a
  summed measure reads about a third of its quarterly target. The month
  columns beside it are the honest view.
- **Ki totals for summed measures.** Four months of actual against twelve
  months of target lands near 33%. That is year-to-date against a full year,
  which is how a Hoshin sheet is normally read — but it is worth saying out
  loud before someone in the room says it for you.
