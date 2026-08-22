/**
 * The seeded Ki 2026 plan: the Level 1-3 structure, the Control Items that hang
 * off it, and the division set. Kept as data so the admin "copy structure from
 * previous Ki" path and the seed share one shape.
 */

export const DIVISIONS = [
  { code: "AUTO", name: "Auto" },
  { code: "PSP", name: "PSP" },
  { code: "OX", name: "OX" },
  { code: "BMD", name: "BMD" },
  { code: "CS", name: "CS" },
  { code: "FRC", name: "FRC" },
] as const;

/**
 * Departments sit beneath a Division. A Level 4 branch may be filed against
 * either - a Division deploying something itself, or one of its Departments -
 * which is what the Division/Department filter on the sheet narrows between.
 */
export const DEPARTMENTS = [
  { code: "AUTO-SALES", name: "Dealer Sales", division: "AUTO" },
  { code: "AUTO-STOCK", name: "Stock & Logistics", division: "AUTO" },
  { code: "OX-ASSY", name: "Final Assembly", division: "OX" },
  { code: "OX-PAINT", name: "Paint Shop", division: "OX" },
  { code: "CS-CONTACT", name: "Contact Centre", division: "CS" },
] as const;

export const PLAN_VERSIONS = [
  { code: "OB", label: "Original Budget", sequence: 1, isActual: false },
  { code: "PRB", label: "Press Release Budget", sequence: 2, isActual: false },
  { code: "1QFC", label: "1st Quarter Forecast", sequence: 3, isActual: false },
  { code: "2QFC", label: "2nd Quarter Forecast", sequence: 4, isActual: false },
  { code: "3QFC", label: "3rd Quarter Forecast", sequence: 5, isActual: false },
  { code: "ACT", label: "Actual", sequence: 99, isActual: true },
] as const;

export type SeedControlItem = {
  code: string;
  name: string;
  /** How the target and actual are measured, in the reviewer's own words. */
  measuredAs: string;
  unit: "PERCENT" | "CURRENCY" | "COUNT" | "RATIO" | "DAYS" | "INDEX";
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
  achievementMethod: "RATIO" | "INVERSE";
  aggregation: "SUM" | "AVERAGE" | "LATEST";
  decimalPlaces: number;
  dic: string;
  /** Monthly plan figure used to generate the seeded PRB targets. */
  monthlyTarget: number;
};

export type SeedObjective = {
  statement: string;
  controlItems: SeedControlItem[];
  /** Heading for the Level 3 theme that carries the children. */
  childTheme?: string;
  /** Level 3 objectives laddering into this one. */
  children?: SeedObjective[];
};

export type SeedTheme = {
  statement: string;
  objectives: SeedObjective[];
};

export type SeedGoal = {
  statement: string;
  themes: SeedTheme[];
};

export const GOALS: SeedGoal[] = [
  {
    statement: "Grow profitable revenue in the core vehicle business",
    themes: [
      {
        statement: "Volume and mix",
        objectives: [
          {
            statement: "Expand unit sales in priority segments",
            childTheme: "Grade mix and pricing discipline",
            controlItems: [
              { code: "AUTO-VOL", name: "Vehicle sales volume", measuredAs: "Units sold", unit: "COUNT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "SUM", decimalPlaces: 0, dic: "AUTO", monthlyTarget: 4200 },
              { code: "AUTO-REV", name: "Vehicle sales revenue", measuredAs: "US$ 000, net of discount", unit: "CURRENCY", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "SUM", decimalPlaces: 0, dic: "AUTO", monthlyTarget: 186000 },
            ],
            children: [
              {
                statement: "Lift the share of high-grade trims sold",
                controlItems: [
                  { code: "AUTO-MIX", name: "High-grade trim mix", measuredAs: "% of units sold", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "AUTO", monthlyTarget: 34.5 },
                ],
              },
              {
                statement: "Hold discount discipline across the dealer network",
                controlItems: [
                  { code: "AUTO-DISC", name: "Average discount per unit", measuredAs: "US$ per unit", unit: "CURRENCY", direction: "LOWER_BETTER", achievementMethod: "INVERSE", aggregation: "AVERAGE", decimalPlaces: 0, dic: "AUTO", monthlyTarget: 1150 },
                ],
              },
            ],
          },
          {
            statement: "Grow the parts and service revenue stream",
            childTheme: "Workshop throughput",
            controlItems: [
              { code: "PSP-REV", name: "Parts and service revenue", measuredAs: "US$ 000", unit: "CURRENCY", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "SUM", decimalPlaces: 0, dic: "PSP", monthlyTarget: 41500 },
              { code: "PSP-ATT", name: "Service plan attachment rate", measuredAs: "% of vehicles delivered", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "PSP", monthlyTarget: 62.0 },
            ],
            children: [
              {
                statement: "Shorten the workshop turnaround",
                controlItems: [
                  { code: "PSP-TAT", name: "Workshop turnaround time", measuredAs: "Working days, job in to job out", unit: "DAYS", direction: "LOWER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "PSP", monthlyTarget: 2.4 },
                ],
              },
            ],
          },
        ],
      },
      {
        statement: "Cost and margin",
        objectives: [
          {
            statement: "Hold SG&A within the committed envelope",
            childTheme: "Unit cost reduction",
            controlItems: [
              { code: "FRC-SGA", name: "SG&A spend", measuredAs: "US$ 000", unit: "CURRENCY", direction: "LOWER_BETTER", achievementMethod: "INVERSE", aggregation: "SUM", decimalPlaces: 0, dic: "FRC", monthlyTarget: 28400 },
              { code: "FRC-OPM", name: "Operating profit margin", measuredAs: "% of net sales", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "FRC", monthlyTarget: 8.4 },
            ],
            children: [
              {
                statement: "Reduce unit material cost through design and sourcing",
                controlItems: [
                  { code: "AUTO-MTL", name: "Material cost per unit", measuredAs: "US$ per unit built", unit: "CURRENCY", direction: "LOWER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 0, dic: "AUTO", monthlyTarget: 21800 },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    statement: "Build the operating capability to deliver without waste",
    themes: [
      {
        statement: "Quality and delivery",
        objectives: [
          {
            statement: "Eliminate defects reaching the customer",
            childTheme: "Quality escalation control",
            controlItems: [
              { code: "OX-PPM", name: "Customer-detected defects", measuredAs: "Defects per million delivered", unit: "COUNT", direction: "LOWER_BETTER", achievementMethod: "RATIO", aggregation: "SUM", decimalPlaces: 0, dic: "OX", monthlyTarget: 42 },
              { code: "OX-FTQ", name: "First time quality", measuredAs: "% of units passing first time", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "OX", monthlyTarget: 96.5 },
            ],
            children: [
              {
                statement: "Close every quality escalation within the standard",
                controlItems: [
                  { code: "OX-8D", name: "8D closure within 30 days", measuredAs: "% of escalations closed in 30 days", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "OX", monthlyTarget: 90.0 },
                ],
              },
            ],
          },
          {
            statement: "Deliver to the customer promise date",
            controlItems: [
              { code: "OX-OTD", name: "On-time delivery", measuredAs: "% of orders on the promise date", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "OX", monthlyTarget: 97.0 },
              { code: "OX-INV", name: "Finished goods inventory", measuredAs: "Units on hand at month end", unit: "COUNT", direction: "LOWER_BETTER", achievementMethod: "RATIO", aggregation: "LATEST", decimalPlaces: 0, dic: "OX", monthlyTarget: 3100 },
            ],
          },
        ],
      },
      {
        statement: "Digital operating platform",
        objectives: [
          {
            statement: "Move core planning processes off spreadsheets",
            controlItems: [
              { code: "BMD-MIG", name: "Processes migrated to platform", measuredAs: "Processes live on the platform", unit: "COUNT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "SUM", decimalPlaces: 0, dic: "BMD", monthlyTarget: 2 },
              { code: "BMD-ADO", name: "Platform weekly active usage", measuredAs: "% of named users active weekly", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "LATEST", decimalPlaces: 1, dic: "BMD", monthlyTarget: 72.0 },
            ],
          },
          {
            statement: "Keep the operating systems available to the plants",
            controlItems: [
              { code: "BMD-UPT", name: "Core system availability", measuredAs: "% of scheduled hours available", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 2, dic: "BMD", monthlyTarget: 99.5 },
              { code: "BMD-INC", name: "Severity 1 incidents", measuredAs: "Severity 1 incidents raised", unit: "COUNT", direction: "LOWER_BETTER", achievementMethod: "INVERSE", aggregation: "SUM", decimalPlaces: 0, dic: "BMD", monthlyTarget: 1 },
            ],
          },
        ],
      },
    ],
  },
  {
    statement: "Earn the loyalty of customers and people",
    themes: [
      {
        statement: "Customer experience",
        objectives: [
          {
            statement: "Raise satisfaction across the ownership life",
            childTheme: "Service standard adherence",
            controlItems: [
              { code: "CS-NPS", name: "Net promoter score", measuredAs: "Net promoter score, -100 to +100", unit: "INDEX", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 0, dic: "CS", monthlyTarget: 48 },
              { code: "CS-RES", name: "First contact resolution", measuredAs: "% resolved on first contact", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "CS", monthlyTarget: 78.0 },
            ],
            children: [
              {
                statement: "Answer the customer inside the service standard",
                controlItems: [
                  { code: "CS-AHT", name: "Average response time", measuredAs: "Working days to first response", unit: "DAYS", direction: "LOWER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 2, dic: "CS", monthlyTarget: 0.5 },
                ],
              },
            ],
          },
        ],
      },
      {
        statement: "People and capability",
        objectives: [
          {
            statement: "Build an engaged and stable workforce",
            controlItems: [
              { code: "FRC-ENG", name: "Employee engagement", measuredAs: "% favourable, engagement survey", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "FRC", monthlyTarget: 74.0 },
              { code: "FRC-TRN", name: "Voluntary turnover", measuredAs: "% of headcount, annualised", unit: "PERCENT", direction: "LOWER_BETTER", achievementMethod: "INVERSE", aggregation: "AVERAGE", decimalPlaces: 1, dic: "FRC", monthlyTarget: 8.5 },
              { code: "FRC-HC", name: "Headcount", measuredAs: "Employees at month end", unit: "COUNT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "LATEST", decimalPlaces: 0, dic: "FRC", monthlyTarget: 2450 },
            ],
          },
        ],
      },
    ],
  },
];

/** Level 4 structure, one division sheet, laddering into Level 1-3 objectives. */
export type SeedLevel4 = {
  division: string;
  /** Files the branch under a Department rather than the Division itself. */
  department?: string;
  theme: string;
  objectives: Array<{
    statement: string;
    /** Control item code whose objective this ladders into. */
    laddersToControlItem: string;
    controlItems: SeedControlItem[];
  }>;
};

export const LEVEL_4: SeedLevel4[] = [
  {
    division: "AUTO",
    department: "AUTO-SALES",
    theme: "Dealer network performance",
    objectives: [
      {
        statement: "Raise showroom conversion in the top twenty dealers",
        laddersToControlItem: "AUTO-VOL",
        controlItems: [
          { code: "AUTO-CONV", name: "Showroom conversion rate", measuredAs: "% of showroom visits converted", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "AUTO", monthlyTarget: 21.0 },
          { code: "AUTO-TEST", name: "Test drives booked", measuredAs: "Test drives booked", unit: "COUNT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "SUM", decimalPlaces: 0, dic: "AUTO", monthlyTarget: 9800 },
        ],
      },
      {
        statement: "Hold dealer stock inside the agreed days of supply",
        laddersToControlItem: "AUTO-VOL",
        controlItems: [
          { code: "AUTO-DOS", name: "Dealer days of supply", measuredAs: "Days of supply at month end", unit: "DAYS", direction: "LOWER_BETTER", achievementMethod: "RATIO", aggregation: "LATEST", decimalPlaces: 0, dic: "AUTO", monthlyTarget: 45 },
        ],
      },
    ],
  },
  {
    division: "OX",
    department: "OX-ASSY",
    theme: "Plant operating discipline",
    objectives: [
      {
        statement: "Sustain standard work adherence on every line",
        laddersToControlItem: "OX-FTQ",
        controlItems: [
          { code: "OX-SWA", name: "Standard work adherence", measuredAs: "% of audited operations compliant", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "OX", monthlyTarget: 93.0 },
          { code: "OX-KAI", name: "Kaizen suggestions implemented", measuredAs: "Suggestions implemented", unit: "COUNT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "SUM", decimalPlaces: 0, dic: "OX", monthlyTarget: 120 },
        ],
      },
    ],
  },
  {
    division: "CS",
    department: "CS-CONTACT",
    theme: "Contact centre capability",
    objectives: [
      {
        statement: "Reduce repeat contacts on the same case",
        laddersToControlItem: "CS-RES",
        controlItems: [
          { code: "CS-RPT", name: "Repeat contact rate", measuredAs: "% of cases contacted again", unit: "PERCENT", direction: "LOWER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "CS", monthlyTarget: 14.0 },
        ],
      },
    ],
  },
];
