/**
 * The five Level 1 Goals and everything beneath them.
 *
 * One set of company Goals, three product lines deploying against them. The
 * business unit is a tag on each measure, not a plan of its own.
 *
 * Actuals cover April to July 2026 and are deliberately mixed - a demo where
 * everything is green teaches a leadership team nothing.
 *
 * The figures are invented. The market they are set against is not:
 *
 * AUTO   Targets for a distributor at roughly 5,000 units a month in a
 *        ~110,000-unit market, about 4.5% share. NVES CO2 limits of 117 g/km
 *        for passenger and 180 g/km for light commercial at A$50 per gram
 *        over. July 2026 was a record 108,577-unit month; BEVs took 21.7%.
 *
 * MC     FCAI H1 2026: 46,023 motorcycles and OHVs, up 8.2% on 42,549.
 *        Off-road 20,417, up 21.6%, with kids up 32% and light trail up 131%.
 *        OHV flat at 6,764 against 6,760. Road broadly flat. Scooters up
 *        18.8% with Honda on 39% of the segment. Honda led 2025 outright:
 *        21,901 units, 19.6% share, top in Agriculture, Fun, Trail, Scooter
 *        and Naked. Honda is up 3.6% in 2026 against a market up 8.2% -
 *        growing while losing share, which is what MC-SHARE shows.
 *
 * PP     Australian outdoor power equipment USD 407.9m in 2022 heading for
 *        USD 610.2m by 2030, a 5.2% CAGR, with mowers 40.55% of revenue and
 *        the shift running towards battery and zero-turn. Outboards are a
 *        USD 9.79bn global market growing about 5%. Australian outboard unit
 *        volumes are not published the way vehicle data is, so PP-MAR is
 *        scaled from the segment's share of the range - the softest number
 *        here.
 */

import type { Goal } from "./plan";

/** Twelve monthly targets from a yearly total, weighted to the real seasonal shape. */
const seasonal = (yearTotal: number): number[] => {
  // Apr-Mar. Australian retail peaks at June (EOFY) and at year end.
  const weights = [7.6, 8.1, 11.4, 8.0, 8.0, 8.4, 7.9, 8.3, 7.4, 6.6, 7.6, 10.7];
  return weights.map((w) => Math.round((yearTotal * w) / 100));
};

/**
 * Motorcycles and OHV. Peaks at June - end of financial year, when farms buy
 * ATVs and side-by-sides - then again through spring and the Christmas trade,
 * and once more in March as the Ki closes. The winter months are the trough.
 */
const mcSeasonal = (yearTotal: number): number[] => {
  const weights = [7.8, 7.2, 9.5, 6.4, 6.6, 7.8, 9.2, 9.6, 8.8, 9.0, 8.1, 10.0];
  return weights.map((w) => Math.round((yearTotal * w) / 100));
};

/**
 * Power products. A different shape again: mowers and trimmers wake up with
 * the grass in September and run hard to Christmas, generators sell into
 * storm season, and the winter months are close to dead.
 */
const ppSeasonal = (yearTotal: number): number[] => {
  const weights = [7.0, 5.8, 6.2, 5.4, 6.0, 9.5, 12.0, 12.5, 10.5, 9.0, 8.2, 7.9];
  return weights.map((w) => Math.round((yearTotal * w) / 100));
};

export const GOALS: Goal[] = [
  // ------------------------------------------------------------ 1. Profit and Growth
  {
    statement: "Profit and Growth",
    themes: [
      {
        statement: "Volume and share",
        objectives: [
          {
            statement: "Grow retail volume in a record market",
            items: [
              {
                code: "AU-VOL", name: "New vehicle deliveries", measuredAs: "Units delivered",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "AUTO",
                target: seasonal(60000),
                actual: [4310, 4520, 6480, 4390],
              },
              {
                code: "AU-SHARE", name: "Market share", measuredAs: "% of total VFACTS market",
                unit: "PERCENT", dp: 2, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "AUTO",
                target: 4.60,
                actual: [4.41, 4.38, 4.29, 4.04],
              },
              {
                code: "AU-PRIV", name: "Private buyer share of own sales", measuredAs: "% of own deliveries",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "AUTO",
                target: 62.0,
                actual: [60.4, 61.1, 57.8, 60.9],
              },
            ],
            sub: {
              theme: "Segment performance",
              objectives: [
                {
                  statement: "Defend share in the medium SUV segment",
                  items: [
                    {
                      code: "AU-SUVVOL", name: "Medium SUV deliveries", measuredAs: "Units delivered",
                      unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "AUTO",
                      target: seasonal(21600),
                      actual: [1584, 1642, 2298, 1547],
                    },
                    {
                      code: "AU-SUVSHR", name: "Medium SUV segment share", measuredAs: "% of the segment",
                      unit: "PERCENT", dp: 2, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "AUTO",
                      target: 6.20,
                      actual: [5.88, 5.94, 5.71, 5.42],
                    },
                  ],
                },
                {
                  statement: "Hold the light commercial position",
                  items: [
                    {
                      code: "AU-LCVVOL", name: "Light commercial deliveries", measuredAs: "Units delivered",
                      unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "AUTO",
                      target: seasonal(9600),
                      actual: [702, 738, 1046, 694],
                    },
                    {
                      code: "AU-LCVCO2", name: "Fleet average CO2 — light commercial", measuredAs: "Grams CO2 per km",
                      unit: "COUNT", dp: 1, dir: "LOWER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "AUTO-PRD",
                      target: 180.0,
                      actual: [194.2, 191.6, 188.9, 186.4],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
      {
        statement: "Electrified transition",
        objectives: [
          {
            statement: "Win our share of the electrified swing",
            items: [
              {
                code: "AU-ELEC", name: "Electrified share of own sales", measuredAs: "% BEV, PHEV and hybrid",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "AUTO-PRD",
                target: [38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60],
                actual: [35.2, 38.9, 41.6, 44.8],
              },
              {
                code: "AU-BEV", name: "Battery electric deliveries", measuredAs: "Units delivered",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "AUTO-PRD",
                target: seasonal(10200),
                actual: [612, 731, 1104, 848],
              },
            ],
          },
          {
            statement: "Stay inside the NVES CO2 target",
            items: [
              {
                code: "AU-CO2", name: "Fleet average CO2 — passenger", measuredAs: "Grams CO2 per km",
                unit: "COUNT", dp: 1, dir: "LOWER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "AUTO-PRD",
                target: 117.0,
                actual: [128.4, 125.1, 122.8, 120.6],
              },
              {
                code: "AU-NVES", name: "NVES liability accrued", measuredAs: "A$000 at $50 per gram",
                unit: "CURRENCY", dp: 0, dir: "LOWER_BETTER", method: "RATIO", agg: "SUM", dic: "FRC",
                // Budgeted to fall away as the electrified mix rises, not
                // wished to zero: the liability is real until the fleet
                // average is under 117 g/km, and it is payable in 2028.
                target: [2200, 1950, 1700, 1450, 1200, 980, 760, 560, 380, 220, 100, 0],
                actual: [2456, 1832, 1704, 1218],
              },
            ],
          },
        ],
      },
      {
        statement: "Margin and profitability",
        objectives: [
          {
            statement: "Hold margin as front-end profit tightens",
            items: [
              {
                code: "AU-GPU", name: "Gross profit per unit retailed", measuredAs: "A$ per unit",
                unit: "CURRENCY", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "FRC",
                target: 3450,
                actual: [3384, 3298, 3142, 3205],
              },
              {
                code: "AU-NPBT", name: "Net profit before tax", measuredAs: "% of revenue",
                unit: "PERCENT", dp: 2, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "FRC",
                target: 3.80,
                actual: [3.62, 3.55, 3.71, 3.44],
              },
              {
                code: "AU-SGA", name: "SG&A", measuredAs: "% of gross profit",
                unit: "PERCENT", dp: 1, dir: "LOWER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "FRC",
                target: 74.0,
                actual: [75.8, 76.2, 73.9, 76.9],
              },
            ],
            sub: {
              theme: "Used vehicles and F&I",
              objectives: [
                {
                  statement: "Make used vehicles a second profit engine",
                  items: [
                    {
                      code: "AU-UCGP", name: "Used vehicle gross profit per unit", measuredAs: "A$ per unit",
                      unit: "CURRENCY", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "AUTO",
                      target: 2900,
                      actual: [2612, 2704, 2871, 2758],
                    },
                    {
                      code: "AU-UCDAYS", name: "Used vehicle days in stock", measuredAs: "Average days to sell",
                      unit: "DAYS", dp: 0, dir: "LOWER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "AUTO",
                      target: 42,
                      actual: [54, 51, 46, 49],
                    },
                    {
                      code: "AU-FIPEN", name: "Finance penetration", measuredAs: "% of retail sales financed",
                      unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "FRC",
                      target: 48.0,
                      actual: [43.2, 44.6, 46.9, 45.1],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
      {
        statement: "Aftersales as the profit backbone",
        objectives: [
          {
            statement: "Grow parts and service gross profit",
            items: [
              {
                code: "AU-ASGP", name: "Parts and service gross profit", measuredAs: "A$000",
                unit: "CURRENCY", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "OX",
                target: seasonal(184000),
                actual: [14180, 14760, 20120, 14890],
              },
              {
                code: "AU-ABSORB", name: "Fixed absorption", measuredAs: "% of fixed cost covered by aftersales",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "OX",
                target: 82.0,
                actual: [78.4, 79.9, 83.1, 80.6],
              },
            ],
            branches: [
              {
                orgUnit: "OX-PTS", theme: "Parts operations",
                objectives: [
                  {
                    statement: "Fill a parts order first time",
                    items: [
                      {
                        code: "AU-PFILL", name: "First-pick fill rate", measuredAs: "% of lines filled first pick",
                        unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "OX-PTS",
                        target: 94.0,
                        actual: [91.8, 92.4, 93.1, 93.6],
                      },
                      {
                        code: "AU-POBS", name: "Obsolete parts stock", measuredAs: "% of stock value over 12 months",
                        unit: "PERCENT", dp: 1, dir: "LOWER_BETTER", method: "RATIO", agg: "LATEST", dic: "OX-PTS",
                        target: 4.5,
                        actual: [6.2, 5.9, 5.4, 5.1],
                      },
                    ],
                  },
                ],
              },
              {
                orgUnit: "OX-SVC", theme: "Service operations",
                objectives: [
                  {
                    statement: "Raise workshop productivity",
                    items: [
                      {
                        code: "AU-WSUTIL", name: "Workshop labour utilisation", measuredAs: "% of available hours sold",
                        unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "OX-SVC",
                        target: 88.0,
                        actual: [84.1, 85.7, 87.9, 86.2],
                      },
                      {
                        code: "AU-HRSTECH", name: "Hours sold per technician per day", measuredAs: "Billable hours",
                        unit: "RATIO", dp: 2, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "OX-SVC",
                        target: 6.80,
                        actual: [6.31, 6.44, 6.72, 6.58],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        statement: "Motorcycle volume and share",
        objectives: [
          {
            statement: "Hold the number one position in motorcycles",
            items: [
              {
                code: "MC-VOL", name: "Motorcycle and OHV deliveries", measuredAs: "Units delivered",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "PSP", bu: "MC",
                target: mcSeasonal(23400),
                actual: [1798, 1712, 2287, 1466],
              },
              {
                code: "MC-SHARE", name: "Motorcycle market share", measuredAs: "% of FCAI motorcycle and OHV market",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "PSP", bu: "MC",
                target: 19.6,
                actual: [19.1, 18.8, 19.3, 18.4],
              },
              {
                code: "MC-GP", name: "Motorcycle gross profit", measuredAs: "A$000",
                unit: "CURRENCY", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "PSP", bu: "MC",
                target: mcSeasonal(41000),
                actual: [3042, 2871, 3961, 2588],
              },
            ],
          },
          {
            statement: "Ride the off-road surge",
            items: [
              {
                code: "MC-OFFRD", name: "Off-road deliveries", measuredAs: "Units delivered",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "PSP", bu: "MC",
                target: mcSeasonal(9800),
                actual: [812, 758, 987, 671],
              },
              {
                code: "MC-KIDS", name: "Kids and light trail deliveries", measuredAs: "Units delivered",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "PSP-PP", bu: "MC",
                target: mcSeasonal(2600),
                actual: [244, 231, 298, 205],
              },
            ],
          },
          {
            statement: "Defend road, win scooters",
            items: [
              {
                code: "MC-ROAD", name: "Road motorcycle deliveries", measuredAs: "Units delivered",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "PSP-RS", bu: "MC",
                target: mcSeasonal(6900),
                actual: [486, 452, 601, 402],
              },
              {
                code: "MC-SCOOT", name: "Scooter deliveries", measuredAs: "Units delivered",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "PSP-RS", bu: "MC",
                target: mcSeasonal(2050),
                actual: [178, 165, 214, 149],
              },
              {
                code: "MC-SCSHARE", name: "Scooter segment share", measuredAs: "% of scooter segment",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "PSP-RS", bu: "MC",
                target: 39.0,
                actual: [39.4, 40.1, 38.6, 39.8],
              },
            ],
          },
          {
            statement: "Hold the farm on ATV and side-by-side",
            items: [
              {
                code: "MC-OHV", name: "ATV and side-by-side deliveries", measuredAs: "Units delivered",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "PSP-OEM", bu: "MC",
                target: mcSeasonal(4650),
                actual: [341, 318, 455, 276],
              },
              {
                code: "MC-OHVAG", name: "Agricultural OHV share", measuredAs: "% of agricultural segment",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "PSP-OEM", bu: "MC",
                target: 26.0,
                actual: [25.4, 24.9, 26.8, 25.1],
              },
            ],
          },
          {
            statement: "Make parts and accessories carry their weight",
            items: [
              {
                code: "MC-PA", name: "Motorcycle parts and accessories revenue", measuredAs: "A$000",
                unit: "CURRENCY", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "PSP-ECM", bu: "MC",
                target: mcSeasonal(18600),
                actual: [1489, 1402, 1798, 1263],
              },
            ],
          },
        ],
      },
      {
        statement: "Power Products volume and share",
        objectives: [
          {
            statement: "Grow power products against a battery-led shift",
            items: [
              {
                code: "PP-REV", name: "Power Products revenue", measuredAs: "A$000",
                unit: "CURRENCY", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "PSP", bu: "PP",
                target: ppSeasonal(96000),
                actual: [6588, 5411, 5744, 5039],
              },
              {
                code: "PP-SHARE", name: "Outdoor power equipment share", measuredAs: "% of addressable market",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "PSP", bu: "PP",
                target: 12.5,
                actual: [12.1, 11.8, 12.0, 11.6],
              },
              {
                code: "PP-BATT", name: "Battery and cordless share of own sales", measuredAs: "% of own PP units",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "PSP-PP", bu: "PP",
                target: 28.0,
                actual: [23.4, 24.1, 25.2, 26.0],
              },
            ],
          },
          {
            statement: "Sell the machines that carry the range",
            items: [
              {
                code: "PP-GEN", name: "Generator deliveries", measuredAs: "Units delivered",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "PSP-PP", bu: "PP",
                target: ppSeasonal(14200),
                actual: [1043, 878, 921, 812],
              },
              {
                code: "PP-MOW", name: "Lawn mower deliveries", measuredAs: "Units delivered",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "PSP-PP", bu: "PP",
                target: ppSeasonal(31500),
                actual: [2081, 1744, 1832, 1588],
              },
              {
                code: "PP-TRIM", name: "Line trimmer and brushcutter deliveries", measuredAs: "Units delivered",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "PSP-PP", bu: "PP",
                target: ppSeasonal(12800),
                actual: [834, 706, 748, 651],
              },
              {
                code: "PP-MAR", name: "Marine outboard deliveries", measuredAs: "Units delivered",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "PSP-MAR", bu: "PP",
                target: ppSeasonal(3900),
                actual: [288, 241, 259, 224],
              },
            ],
          },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------------ 2. Brand
  {
    statement: "Brand",
    themes: [
      {
        statement: "Brand health",
        objectives: [
          {
            statement: "Lift consideration against the Chinese entrants",
            items: [
              {
                code: "AU-AWARE", name: "Unaided brand awareness", measuredAs: "% of new-car intenders",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "BMD",
                target: 46.0,
                actual: [43.8, 44.2, 44.9, 45.3],
              },
              {
                code: "AU-CONSID", name: "Purchase consideration", measuredAs: "% who would shortlist us",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "BMD",
                target: 28.0,
                actual: [25.1, 25.8, 26.4, 26.1],
              },
            ],
          },
        ],
      },
      {
        statement: "Electrified credibility",
        objectives: [
          {
            statement: "Be shortlisted as an electrified brand",
            items: [
              {
                code: "AU-EVCON", name: "EV consideration among EV intenders", measuredAs: "% who would shortlist us",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "BMD",
                target: 22.0,
                actual: [16.4, 17.9, 19.2, 20.6],
              },
            ],
            branches: [
              {
                orgUnit: "BMD-DIGA", theme: "Electrified content programme",
                objectives: [
                  {
                    statement: "Answer the questions EV intenders actually ask",
                    items: [
                      {
                        code: "AU-EVCONT", name: "EV explainer content published", measuredAs: "Assets published",
                        unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "BMD-DIGA",
                        target: [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
                        actual: [5, 7, 9, 8],
                      },
                      {
                        code: "AU-EVDWELL", name: "Time on EV range and charging pages", measuredAs: "Average seconds",
                        unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "BMD-DIGA",
                        target: 145,
                        actual: [98, 116, 132, 141],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        statement: "Demand generation",
        objectives: [
          {
            statement: "Turn digital interest into qualified demand",
            items: [
              {
                code: "AU-LEADS", name: "Qualified digital leads", measuredAs: "Leads passed to dealers",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "BMD",
                target: seasonal(240000),
                actual: [19240, 20110, 26840, 20960],
              },
              {
                code: "AU-CPL", name: "Cost per qualified lead", measuredAs: "A$ per lead",
                unit: "CURRENCY", dp: 2, dir: "LOWER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "BMD",
                target: 42.00,
                actual: [44.80, 43.10, 38.90, 40.20],
              },
            ],
            branches: [
              {
                orgUnit: "BMD-DIGA", theme: "Digital marketing",
                objectives: [
                  {
                    statement: "Fix the online configurator funnel",
                    items: [
                      {
                        code: "AU-CFGDONE", name: "Configurator completion rate", measuredAs: "% of starts completed",
                        unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "BMD-DIGA",
                        target: 34.0,
                        actual: [28.6, 30.4, 33.8, 35.1],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        statement: "Powersports brand",
        objectives: [
          {
            statement: "Stay the bike people shortlist first",
            items: [
              {
                code: "MC-CONS", name: "Motorcycle brand consideration", measuredAs: "% of intenders shortlisting",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "BMD-MKTP", bu: "MC",
                target: 34.0,
                actual: [31.2, 32.0, 32.8, 33.5],
              },
              {
                code: "PP-CONS", name: "Power products brand consideration", measuredAs: "% of intenders shortlisting",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "BMD-DIGP", bu: "PP",
                target: 22.0,
                actual: [19.8, 20.3, 20.9, 21.4],
              },
            ],
          },
        ],
      },
    ],
  },

  // --------------------------------------------------------------------- 3. Customer
  {
    statement: "Customer",
    themes: [
      {
        statement: "Purchase experience",
        objectives: [
          {
            statement: "Deliver the car we promised, when we promised",
            items: [
              {
                code: "AU-SNPS", name: "Sales net promoter score", measuredAs: "NPS, -100 to +100",
                unit: "INDEX", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "OX",
                target: 62,
                actual: [58, 59, 57, 60],
              },
              {
                code: "AU-DOP", name: "Delivery on promised date", measuredAs: "% delivered on the promised date",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "OX",
                target: 92.0,
                actual: [86.4, 88.1, 84.9, 89.2],
              },
            ],
          },
        ],
      },
      {
        statement: "Ownership experience",
        objectives: [
          {
            statement: "Make servicing effortless",
            items: [
              {
                code: "AU-VNPS", name: "Service net promoter score", measuredAs: "NPS, -100 to +100",
                unit: "INDEX", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "OX",
                target: 55,
                actual: [51, 53, 54, 56],
              },
              {
                code: "AU-FTF", name: "First-time fix rate", measuredAs: "% fixed without a return visit",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "OX",
                target: 93.0,
                actual: [90.2, 91.4, 92.1, 92.8],
              },
            ],
            branches: [
              {
                orgUnit: "OX-CC", theme: "Customer contact centre",
                objectives: [
                  {
                    statement: "Answer the customer quickly",
                    items: [
                      {
                        code: "AU-CC30", name: "Calls answered within 30 seconds", measuredAs: "% of calls",
                        unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "OX-CC",
                        target: 85.0,
                        actual: [76.3, 79.8, 82.4, 84.9],
                      },
                      {
                        code: "AU-ONLBK", name: "Service bookings made online", measuredAs: "% of all bookings",
                        unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "OX-CC",
                        target: 45.0,
                        actual: [31.7, 35.2, 38.6, 41.4],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            statement: "Keep customers in the network",
            items: [
              {
                code: "AU-RETN", name: "Service retention to four years", measuredAs: "% still servicing with us",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "OX",
                target: 58.0,
                actual: [52.8, 53.4, 54.1, 54.7],
              },
              {
                code: "AU-COMP", name: "Customer complaints", measuredAs: "Complaints per 1,000 sales",
                unit: "RATIO", dp: 2, dir: "LOWER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "OX",
                target: 4.00,
                actual: [5.12, 4.86, 5.44, 4.61],
              },
            ],
            branches: [
              {
                orgUnit: "OX-SVC", theme: "Service retention programme",
                objectives: [
                  {
                    statement: "Bring lapsed customers back to the network",
                    items: [
                      {
                        code: "AU-LAPSE", name: "Lapsed customers recontacted", measuredAs: "Customers contacted",
                        unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "OX-SVC",
                        target: [3800, 3800, 4200, 3800, 3800, 4000, 3800, 4000, 3600, 3400, 3800, 4000],
                        actual: [3120, 3480, 4010, 3660],
                      },
                      {
                        code: "AU-LAPSERET", name: "Lapsed customers who rebooked", measuredAs: "% of those contacted",
                        unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "OX-SVC",
                        target: 18.0,
                        actual: [12.4, 14.1, 16.8, 17.2],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        statement: "Powersports ownership",
        objectives: [
          {
            statement: "Leave a rider better served than they expected",
            items: [
              {
                code: "MC-CSI", name: "Motorcycle dealer satisfaction", measuredAs: "Index, 0-100",
                unit: "INDEX", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "PSP-CSO", bu: "MC",
                target: 88.0,
                actual: [85.2, 86.0, 86.4, 87.1],
              },
              {
                code: "PP-WARR", name: "Power products warranty claim rate", measuredAs: "% of units sold",
                unit: "PERCENT", dp: 2, dir: "LOWER_BETTER", method: "INVERSE", agg: "AVERAGE", dic: "PSP-TTW", bu: "PP",
                target: 1.8,
                actual: [2.4, 2.2, 2.1, 1.9],
              },
            ],
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------- 4. Network
  {
    statement: "Network",
    themes: [
      {
        statement: "Network profitability",
        objectives: [
          {
            statement: "A network that makes money",
            items: [
              {
                code: "AU-DLRNP", name: "Average dealer net profit", measuredAs: "% of dealership revenue",
                unit: "PERCENT", dp: 2, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "AUTO",
                target: 3.50,
                actual: [3.12, 3.24, 3.48, 3.06],
              },
              {
                code: "AU-DLRLOSS", name: "Dealers trading at a loss", measuredAs: "Dealers in the month",
                unit: "COUNT", dp: 0, dir: "LOWER_BETTER", method: "RATIO", agg: "LATEST", dic: "AUTO",
                target: 6,
                actual: [14, 12, 9, 11],
              },
            ],
            branches: [
              {
                orgUnit: "AUTO-ND", theme: "Dealer performance management",
                objectives: [
                  {
                    statement: "Turn round the loss-making dealers",
                    items: [
                      {
                        code: "AU-TURNPLAN", name: "Loss-makers on an agreed turnaround plan", measuredAs: "% of loss-making dealers",
                        unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "LATEST", dic: "AUTO-ND",
                        target: 100.0,
                        actual: [57.1, 66.7, 88.9, 81.8],
                      },
                      {
                        code: "AU-DLRCONS", name: "Dealer business reviews completed", measuredAs: "Reviews completed",
                        unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "AUTO-ND",
                        target: [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
                        actual: [9, 11, 12, 10],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        statement: "Network readiness",
        objectives: [
          {
            statement: "Ready every dealer to sell and service electrified",
            items: [
              {
                code: "AU-EVCERT", name: "Dealers EV certified", measuredAs: "% of the network",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "LATEST", dic: "AUTO",
                target: [55, 60, 65, 70, 75, 80, 84, 88, 91, 94, 97, 100],
                actual: [48.6, 54.3, 59.7, 64.1],
              },
              {
                code: "AU-CHRG", name: "DC fast chargers commissioned", measuredAs: "Chargers live in the network",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "AUTO",
                target: [14, 14, 16, 16, 16, 16, 14, 14, 12, 12, 14, 12],
                actual: [9, 11, 13, 12],
              },
            ],
            branches: [
              {
                orgUnit: "AUTO-ND", theme: "Network development",
                objectives: [
                  {
                    statement: "Close the coverage gaps",
                    items: [
                      {
                        code: "AU-COVER", name: "Population within 30 minutes of a dealer", measuredAs: "% of population",
                        unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "LATEST", dic: "AUTO-ND",
                        target: 88.0,
                        actual: [84.2, 84.2, 85.6, 86.1],
                      },
                      {
                        code: "AU-NEWPT", name: "New sales points opened", measuredAs: "Points opened",
                        unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "AUTO-ND",
                        target: [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1],
                        actual: [0, 0, 1, 1],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        statement: "Powersports network",
        objectives: [
          {
            statement: "Cover the country for bikes and power products",
            items: [
              {
                code: "MC-DLR", name: "Motorcycle dealers trading", measuredAs: "Dealers",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "LATEST", dic: "PSP-ND", bu: "MC",
                target: 172,
                actual: [168, 169, 170, 170],
              },
              {
                code: "PP-DLR", name: "Power products servicing dealers", measuredAs: "Dealers",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "LATEST", dic: "PSP-ND", bu: "PP",
                target: 340,
                actual: [322, 325, 329, 331],
              },
            ],
          },
          {
            statement: "Put trained riders on the road",
            items: [
              {
                code: "MC-HART", name: "HART riders trained", measuredAs: "Riders completing a course",
                unit: "COUNT", dp: 0, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "PSP-HVIC", bu: "MC",
                target: mcSeasonal(9600),
                actual: [702, 664, 921, 618],
              },
              {
                code: "MC-HARTNSW", name: "HART NSW utilisation", measuredAs: "% of course places filled",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "PSP-HNSW", bu: "MC",
                target: 82.0,
                actual: [74.6, 76.8, 79.1, 80.4],
              },
            ],
          },
        ],
      },
    ],
  },

  // ----------------------------------------------------------------------- 5. People
  {
    statement: "People",
    themes: [
      {
        statement: "Capability for the transition",
        objectives: [
          {
            statement: "Build the skills electrification needs",
            items: [
              {
                code: "AU-HVCERT", name: "Technicians high-voltage certified", measuredAs: "% of technicians",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "LATEST", dic: "CS",
                target: [40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95],
                actual: [36.4, 41.8, 47.2, 52.9],
              },
              {
                code: "AU-TRHRS", name: "Training hours per employee", measuredAs: "Hours per employee",
                unit: "RATIO", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "SUM", dic: "CS",
                target: 3.0,
                actual: [2.4, 2.8, 3.4, 3.1],
              },
            ],
          },
        ],
      },
      {
        statement: "Engagement and retention",
        objectives: [
          {
            statement: "Be somewhere people stay",
            items: [
              {
                code: "AU-ENG", name: "Employee engagement", measuredAs: "% favourable, engagement survey",
                unit: "PERCENT", dp: 1, dir: "HIGHER_BETTER", method: "RATIO", agg: "LATEST", dic: "CS",
                target: 76.0,
                actual: [72.4, 72.4, 74.8, 74.8],
              },
              {
                code: "AU-TURN", name: "Voluntary turnover", measuredAs: "% annualised",
                unit: "PERCENT", dp: 1, dir: "LOWER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "CS",
                target: 14.0,
                actual: [17.8, 17.1, 16.4, 15.9],
              },
              {
                code: "AU-TECHVAC", name: "Technician vacancy rate", measuredAs: "% of technician roles unfilled",
                unit: "PERCENT", dp: 1, dir: "LOWER_BETTER", method: "RATIO", agg: "LATEST", dic: "CS",
                target: 5.0,
                actual: [9.4, 8.8, 8.1, 7.6],
              },
            ],
          },
        ],
      },
      {
        statement: "Group safety and systems",
        objectives: [
          {
            statement: "Send everyone home the way they arrived",
            items: [
              {
                code: "SH-LTIFR", name: "Lost-time injury frequency rate", measuredAs: "Per million hours worked",
                unit: "RATIO", dp: 2, dir: "LOWER_BETTER", method: "INVERSE", agg: "AVERAGE", dic: "CS", bu: "SHARED",
                target: 2.0,
                actual: [3.1, 2.8, 2.4, 2.2],
              },
              {
                code: "SH-ICT", name: "Core systems availability", measuredAs: "% of business hours",
                unit: "PERCENT", dp: 2, dir: "HIGHER_BETTER", method: "RATIO", agg: "AVERAGE", dic: "CS-ICT", bu: "SHARED",
                target: 99.5,
                actual: [99.2, 99.6, 98.9, 99.4],
              },
            ],
          },
        ],
      },
    ],
  },
];
