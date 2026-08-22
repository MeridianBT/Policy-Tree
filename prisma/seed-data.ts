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
              { code: "AUTO-VOL", name: "Vehicle sales volume", unit: "COUNT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "SUM", decimalPlaces: 0, dic: "AUTO", monthlyTarget: 4200 },
              { code: "AUTO-REV", name: "Vehicle sales revenue", unit: "CURRENCY", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "SUM", decimalPlaces: 0, dic: "AUTO", monthlyTarget: 186000 },
            ],
            children: [
              {
                statement: "Lift the share of high-grade trims sold",
                controlItems: [
                  { code: "AUTO-MIX", name: "High-grade trim mix", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "AUTO", monthlyTarget: 34.5 },
                ],
              },
              {
                statement: "Hold discount discipline across the dealer network",
                controlItems: [
                  { code: "AUTO-DISC", name: "Average discount per unit", unit: "CURRENCY", direction: "LOWER_BETTER", achievementMethod: "INVERSE", aggregation: "AVERAGE", decimalPlaces: 0, dic: "AUTO", monthlyTarget: 1150 },
                ],
              },
            ],
          },
          {
            statement: "Grow the parts and service revenue stream",
            childTheme: "Workshop throughput",
            controlItems: [
              { code: "PSP-REV", name: "Parts and service revenue", unit: "CURRENCY", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "SUM", decimalPlaces: 0, dic: "PSP", monthlyTarget: 41500 },
              { code: "PSP-ATT", name: "Service plan attachment rate", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "PSP", monthlyTarget: 62.0 },
            ],
            children: [
              {
                statement: "Shorten the workshop turnaround",
                controlItems: [
                  { code: "PSP-TAT", name: "Workshop turnaround time", unit: "DAYS", direction: "LOWER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "PSP", monthlyTarget: 2.4 },
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
              { code: "FRC-SGA", name: "SG&A spend", unit: "CURRENCY", direction: "LOWER_BETTER", achievementMethod: "INVERSE", aggregation: "SUM", decimalPlaces: 0, dic: "FRC", monthlyTarget: 28400 },
              { code: "FRC-OPM", name: "Operating profit margin", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "FRC", monthlyTarget: 8.4 },
            ],
            children: [
              {
                statement: "Reduce unit material cost through design and sourcing",
                controlItems: [
                  { code: "AUTO-MTL", name: "Material cost per unit", unit: "CURRENCY", direction: "LOWER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 0, dic: "AUTO", monthlyTarget: 21800 },
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
              { code: "OX-PPM", name: "Customer-detected defects", unit: "COUNT", direction: "LOWER_BETTER", achievementMethod: "RATIO", aggregation: "SUM", decimalPlaces: 0, dic: "OX", monthlyTarget: 42 },
              { code: "OX-FTQ", name: "First time quality", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "OX", monthlyTarget: 96.5 },
            ],
            children: [
              {
                statement: "Close every quality escalation within the standard",
                controlItems: [
                  { code: "OX-8D", name: "8D closure within 30 days", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "OX", monthlyTarget: 90.0 },
                ],
              },
            ],
          },
          {
            statement: "Deliver to the customer promise date",
            controlItems: [
              { code: "OX-OTD", name: "On-time delivery", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "OX", monthlyTarget: 97.0 },
              { code: "OX-INV", name: "Finished goods inventory", unit: "COUNT", direction: "LOWER_BETTER", achievementMethod: "RATIO", aggregation: "LATEST", decimalPlaces: 0, dic: "OX", monthlyTarget: 3100 },
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
              { code: "BMD-MIG", name: "Processes migrated to platform", unit: "COUNT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "SUM", decimalPlaces: 0, dic: "BMD", monthlyTarget: 2 },
              { code: "BMD-ADO", name: "Platform weekly active usage", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "LATEST", decimalPlaces: 1, dic: "BMD", monthlyTarget: 72.0 },
            ],
          },
          {
            statement: "Keep the operating systems available to the plants",
            controlItems: [
              { code: "BMD-UPT", name: "Core system availability", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 2, dic: "BMD", monthlyTarget: 99.5 },
              { code: "BMD-INC", name: "Severity 1 incidents", unit: "COUNT", direction: "LOWER_BETTER", achievementMethod: "INVERSE", aggregation: "SUM", decimalPlaces: 0, dic: "BMD", monthlyTarget: 1 },
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
              { code: "CS-NPS", name: "Net promoter score", unit: "INDEX", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 0, dic: "CS", monthlyTarget: 48 },
              { code: "CS-RES", name: "First contact resolution", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "CS", monthlyTarget: 78.0 },
            ],
            children: [
              {
                statement: "Answer the customer inside the service standard",
                controlItems: [
                  { code: "CS-AHT", name: "Average response time", unit: "DAYS", direction: "LOWER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 2, dic: "CS", monthlyTarget: 0.5 },
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
              { code: "FRC-ENG", name: "Employee engagement", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "FRC", monthlyTarget: 74.0 },
              { code: "FRC-TRN", name: "Voluntary turnover", unit: "PERCENT", direction: "LOWER_BETTER", achievementMethod: "INVERSE", aggregation: "AVERAGE", decimalPlaces: 1, dic: "FRC", monthlyTarget: 8.5 },
              { code: "FRC-HC", name: "Headcount", unit: "COUNT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "LATEST", decimalPlaces: 0, dic: "FRC", monthlyTarget: 2450 },
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
    theme: "Dealer network performance",
    objectives: [
      {
        statement: "Raise showroom conversion in the top twenty dealers",
        laddersToControlItem: "AUTO-VOL",
        controlItems: [
          { code: "AUTO-CONV", name: "Showroom conversion rate", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "AUTO", monthlyTarget: 21.0 },
          { code: "AUTO-TEST", name: "Test drives booked", unit: "COUNT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "SUM", decimalPlaces: 0, dic: "AUTO", monthlyTarget: 9800 },
        ],
      },
      {
        statement: "Hold dealer stock inside the agreed days of supply",
        laddersToControlItem: "AUTO-VOL",
        controlItems: [
          { code: "AUTO-DOS", name: "Dealer days of supply", unit: "DAYS", direction: "LOWER_BETTER", achievementMethod: "RATIO", aggregation: "LATEST", decimalPlaces: 0, dic: "AUTO", monthlyTarget: 45 },
        ],
      },
    ],
  },
  {
    division: "OX",
    theme: "Plant operating discipline",
    objectives: [
      {
        statement: "Sustain standard work adherence on every line",
        laddersToControlItem: "OX-FTQ",
        controlItems: [
          { code: "OX-SWA", name: "Standard work adherence", unit: "PERCENT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "OX", monthlyTarget: 93.0 },
          { code: "OX-KAI", name: "Kaizen suggestions implemented", unit: "COUNT", direction: "HIGHER_BETTER", achievementMethod: "RATIO", aggregation: "SUM", decimalPlaces: 0, dic: "OX", monthlyTarget: 120 },
        ],
      },
    ],
  },
  {
    division: "CS",
    theme: "Contact centre capability",
    objectives: [
      {
        statement: "Reduce repeat contacts on the same case",
        laddersToControlItem: "CS-RES",
        controlItems: [
          { code: "CS-RPT", name: "Repeat contact rate", unit: "PERCENT", direction: "LOWER_BETTER", achievementMethod: "RATIO", aggregation: "AVERAGE", decimalPlaces: 1, dic: "CS", monthlyTarget: 14.0 },
        ],
      },
    ],
  },
];
