/**
 * A fictitious Australian automotive distributor's Hoshin plan, for UAT and
 * for demonstrating the platform to a leadership team.
 *
 * The company is invented. The market conditions the measures respond to are
 * not — the targets are set against the Australian new-vehicle market as it
 * actually stood in mid-2026, so a room full of automotive people recognise
 * the numbers rather than argue with them:
 *
 *   - A record market. July 2026 delivered 108,577 vehicles, past the previous
 *     July record; the June quarter set an all-time high of 330,111.
 *   - Electrification at a tipping point. BEVs took 21.7% of July 2026 and
 *     17.3% year to date; BEV, PHEV and hybrid together were 49% of the June
 *     quarter.
 *   - NVES is live and now public. From 1 July 2025 the standard sets CO2
 *     limits — 117 g/km for passenger vehicles in 2026, 180 g/km for light
 *     commercials — with a $50 liability per gram over, and manufacturers
 *     missing the target named publicly from February 2026.
 *   - Chinese brands are taking the market. 24% share across the first two
 *     months of 2026, up from 14% a year earlier; 35.5% of vehicles sold in
 *     June 2026 were China-built.
 *   - Front-end margin is thin. Australian dealers now run around 3.5% net
 *     profit, back to thirty-year averages, which is why aftersales — service
 *     retention, workshop efficiency, parts margin — carries the plan.
 *
 * Every Level 1 Goal is one of the five the business runs on: Profit and
 * Growth, Brand, Customer, Network, People.
 */

export const DIVISIONS = [
  { code: "SLS", name: "Sales & Network", sortOrder: 1 },
  { code: "AFT", name: "Aftersales", sortOrder: 2 },
  { code: "MKT", name: "Marketing & Brand", sortOrder: 3 },
  { code: "CX", name: "Customer Experience", sortOrder: 4 },
  { code: "PPD", name: "Product Planning", sortOrder: 5 },
  { code: "FIN", name: "Finance", sortOrder: 6 },
  { code: "PPL", name: "People & Culture", sortOrder: 7 },
] as const;

export const DEPARTMENTS = [
  { code: "AFT-PARTS", name: "Parts Operations", parent: "AFT" },
  { code: "AFT-SVC", name: "Service Operations", parent: "AFT" },
  { code: "SLS-NET", name: "Network Development", parent: "SLS" },
  { code: "MKT-DIG", name: "Digital Marketing", parent: "MKT" },
  { code: "CX-CC", name: "Customer Contact Centre", parent: "CX" },
] as const;

export const PEOPLE = [
  { email: "md@driveaus.example", name: "Managing Director", role: "SUPER_ADMIN", org: null },
  { email: "sales.director@driveaus.example", name: "Sales & Network Director", role: "OWNER", org: "SLS" },
  { email: "aftersales.director@driveaus.example", name: "Aftersales Director", role: "OWNER", org: "AFT" },
  { email: "marketing.director@driveaus.example", name: "Marketing Director", role: "OWNER", org: "MKT" },
  { email: "cx.director@driveaus.example", name: "Customer Experience Director", role: "OWNER", org: "CX" },
  { email: "product.director@driveaus.example", name: "Product Planning Director", role: "OWNER", org: "PPD" },
  { email: "cfo@driveaus.example", name: "Chief Financial Officer", role: "OWNER", org: "FIN" },
  { email: "hr.director@driveaus.example", name: "People & Culture Director", role: "OWNER", org: "PPL" },
  { email: "parts.manager@driveaus.example", name: "National Parts Manager", role: "OWNER", org: "AFT-PARTS" },
  { email: "service.manager@driveaus.example", name: "National Service Manager", role: "OWNER", org: "AFT-SVC" },
  { email: "network.manager@driveaus.example", name: "Network Development Manager", role: "OWNER", org: "SLS-NET" },
  { email: "digital.manager@driveaus.example", name: "Digital Marketing Manager", role: "OWNER", org: "MKT-DIG" },
  { email: "cc.manager@driveaus.example", name: "Contact Centre Manager", role: "OWNER", org: "CX-CC" },
  { email: "board@driveaus.example", name: "Board Observer", role: "VIEWER", org: null },
] as const;

export type Item = {
  code: string;
  name: string;
  measuredAs: string;
  unit: "PERCENT" | "CURRENCY" | "COUNT" | "RATIO" | "DAYS" | "INDEX";
  dp: number;
  dir: "HIGHER_BETTER" | "LOWER_BETTER";
  method: "RATIO" | "INVERSE";
  agg: "SUM" | "AVERAGE" | "LATEST";
  dic: string;
  /**
   * Business unit: AUTO, MC, PP or CORP. Optional, defaulting to AUTO -
   * the automobile plan was written before the other product lines existed
   * and every one of its measures belongs there, so tagging each of the
   * original 54 would be noise. A motorcycle or power-products measure says
   * so explicitly.
   */
  bu?: "AUTO" | "MC" | "PP" | "CORP";
  /** Monthly target on PRB. A single number is repeated across the year. */
  target: number | number[];
  /** Apr-Jul actuals. The Ki is four months old, so the rest is unkeyed. */
  actual: number[];
};

export type Objective = {
  statement: string;
  items: Item[];
  /** A Level 3 breakdown hanging off this Level 2 Objective. */
  sub?: { theme: string; objectives: Objective[] };
  /** Level 4 department branches laddering into this Objective. */
  branches?: Branch[];
};
export type Theme = { statement: string; objectives: Objective[] };
export type Branch = { orgUnit: string; theme: string; objectives: Objective[] };
export type Goal = { statement: string; themes: Theme[] };
