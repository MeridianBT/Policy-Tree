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
  { code: "AUTO", name: "Automotive", sortOrder: 1 },
  { code: "PSP", name: "Powersports & Products", sortOrder: 2 },
  { code: "BMD", name: "Brand, Marketing & Digital", sortOrder: 3 },
  { code: "OX", name: "Ownership Experience", sortOrder: 4 },
  { code: "CS", name: "Corporate Services", sortOrder: 5 },
  { code: "FRC", name: "Finance, Risk & Compliance", sortOrder: 6 },
] as const;

export const DEPARTMENTS = [
  { code: "AUTO-PRD", name: "Product", parent: "AUTO" },
  { code: "AUTO-REG", name: "Regions", parent: "AUTO" },
  { code: "AUTO-OPS", name: "Operations", parent: "AUTO" },
  { code: "AUTO-SP", name: "Sales Planning", parent: "AUTO" },
  { code: "AUTO-ND", name: "Network Development", parent: "AUTO" },
  { code: "AUTO-RET", name: "Retail Experience & Training", parent: "AUTO" },

  { code: "PSP-PP", name: "Product Planning", parent: "PSP" },
  { code: "PSP-MAR", name: "Marine", parent: "PSP" },
  { code: "PSP-EVT", name: "Events", parent: "PSP" },
  { code: "PSP-PUR", name: "Purchasing", parent: "PSP" },
  { code: "PSP-ND", name: "Network Development", parent: "PSP" },
  { code: "PSP-RS", name: "Regional Sales", parent: "PSP" },
  { code: "PSP-OEM", name: "OEM Sales", parent: "PSP" },
  { code: "PSP-ECM", name: "eCommerce & MMD", parent: "PSP" },
  { code: "PSP-CSO", name: "Customer Service Operations", parent: "PSP" },
  { code: "PSP-HVIC", name: "HART Vic", parent: "PSP" },
  { code: "PSP-HNSW", name: "HART NSW", parent: "PSP" },
  { code: "PSP-TTW", name: "Technical Training & Workshop", parent: "PSP" },

  { code: "BMD-MKTA", name: "Marketing (Auto)", parent: "BMD" },
  { code: "BMD-MKTP", name: "Marketing (MC/PP)", parent: "BMD" },
  { code: "BMD-BRD", name: "Brand", parent: "BMD" },
  { code: "BMD-INS", name: "Insights", parent: "BMD" },
  { code: "BMD-DIGA", name: "Digital (Auto)", parent: "BMD" },
  { code: "BMD-DIGP", name: "Digital (MC/PP)", parent: "BMD" },
  { code: "BMD-CRE", name: "Creative (inhouse Agency)", parent: "BMD" },
  { code: "BMD-COM", name: "Corporate Communications", parent: "BMD" },

  { code: "OX-SVC", name: "Service Experience", parent: "OX" },
  { code: "OX-CC", name: "Customer Care", parent: "OX" },
  { code: "OX-MQ", name: "Market Quality", parent: "OX" },
  { code: "OX-PTS", name: "Parts", parent: "OX" },
  { code: "OX-SC", name: "Supply Chain", parent: "OX" },
  { code: "OX-TEC", name: "Technical", parent: "OX" },

  { code: "CS-EX", name: "Employee Experience", parent: "CS" },
  { code: "CS-ICT", name: "Information & Communications Technology", parent: "CS" },
  { code: "CS-PMO", name: "Project Management Office", parent: "CS" },

  { code: "FRC-FIN", name: "Finance", parent: "FRC" },
  { code: "FRC-LRC", name: "Legal, Risk & Compliance", parent: "FRC" },
  { code: "FRC-AUD", name: "Internal Audit", parent: "FRC" },
] as const;

export const PEOPLE = [
  { email: "md@honda.example", name: "Managing Director", role: "SUPER_ADMIN", org: null },
  { email: "gm.auto@honda.example", name: "General Manager, Automotive", role: "EXECUTIVE", org: null },
  { email: "auto.director@honda.example", name: "Automotive Director", role: "OWNER", org: "AUTO" },
  { email: "psp.director@honda.example", name: "Powersports & Products Director", role: "OWNER", org: "PSP" },
  { email: "bmd.director@honda.example", name: "Brand, Marketing & Digital Director", role: "OWNER", org: "BMD" },
  { email: "ox.director@honda.example", name: "Ownership Experience Director", role: "OWNER", org: "OX" },
  { email: "cs.director@honda.example", name: "Corporate Services Director", role: "OWNER", org: "CS" },
  { email: "cfo@honda.example", name: "Chief Financial Officer", role: "OWNER", org: "FRC" },
  { email: "parts.manager@honda.example", name: "National Parts Manager", role: "OWNER", org: "OX-PTS" },
  { email: "service.manager@honda.example", name: "National Service Manager", role: "OWNER", org: "OX-SVC" },
  { email: "network.manager@honda.example", name: "Network Development Manager", role: "OWNER", org: "AUTO-ND" },
  { email: "digital.manager@honda.example", name: "Digital Manager, Auto", role: "OWNER", org: "BMD-DIGA" },
  { email: "care.manager@honda.example", name: "Customer Care Manager", role: "OWNER", org: "OX-CC" },
  { email: "board@honda.example", name: "Board Observer", role: "VIEWER", org: null },
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
   * Business unit: AUTO, MC, PP or SHARED. Optional, defaulting to AUTO -
   * the automobile plan was written before the other product lines existed
   * and every one of its measures belongs there, so tagging each of the
   * original 54 would be noise. A motorcycle or power-products measure says
   * so explicitly.
   */
  bu?: "AUTO" | "MC" | "PP" | "SHARED";
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
