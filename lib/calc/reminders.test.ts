/**
 * The reminder rules that decide who gets chased, about what, and for which
 * month.
 *
 * Two of these matter more than the rest. Chasing someone for a month they
 * have already keyed, or for measures that are not theirs, is how a reminder
 * system teaches everyone to ignore it - so the period boundary and the
 * accountability match are pinned here.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRACE_DAYS,
  reminderPeriod,
  reminderPeriodForKi,
} from "@/lib/reminders/period";
import {
  assignRecipients,
  subtreeOf,
  type CandidateUser,
  type UnkeyedItem,
} from "@/lib/reminders/match";
import { buildReminderMessage, periodTitle } from "@/lib/reminders/message";

const utc = (iso: string) => new Date(`${iso}T09:00:00Z`);

describe("reminderPeriod", () => {
  it("chases last month during the grace window, when its actuals are still being keyed", () => {
    expect(reminderPeriod(utc("2026-05-01"))).toBe("2026-04");
    expect(reminderPeriod(utc("2026-05-05"))).toBe("2026-04");
  });

  it("prompts for the current month once the grace window has passed", () => {
    expect(reminderPeriod(utc("2026-05-06"))).toBe("2026-05");
    expect(reminderPeriod(utc("2026-05-31"))).toBe("2026-05");
  });

  it("rolls back across a year boundary", () => {
    expect(reminderPeriod(utc("2026-01-03"))).toBe("2025-12");
  });

  it("honours a custom grace window", () => {
    expect(reminderPeriod(utc("2026-05-08"), 10)).toBe("2026-04");
    expect(reminderPeriod(utc("2026-05-11"), 10)).toBe("2026-05");
  });

  it("reads the date in UTC, so a run just after midnight cannot slip a month", () => {
    // 23:30 on 5 May in UTC+2 is still 21:30 on the 5th in UTC - inside the
    // grace window either way. The point is that only UTC is consulted.
    expect(reminderPeriod(new Date("2026-05-05T21:30:00Z"))).toBe("2026-04");
    expect(reminderPeriod(new Date("2026-05-06T00:30:00Z"))).toBe("2026-05");
  });

  it("has a documented default grace window", () => {
    expect(DEFAULT_GRACE_DAYS).toBe(5);
    expect(reminderPeriod(utc("2026-05-05"))).toBe(reminderPeriod(utc("2026-05-05"), DEFAULT_GRACE_DAYS));
  });
});

describe("reminderPeriodForKi", () => {
  // Ki 2026 runs Apr 2026 - Mar 2027.
  it("clamps to the first month before the Ki opens", () => {
    expect(reminderPeriodForKi(2026, utc("2026-02-10"))).toBe("2026-04");
  });

  it("clamps to the last month after the Ki closes", () => {
    expect(reminderPeriodForKi(2026, utc("2027-08-10"))).toBe("2027-03");
  });

  it("passes a month inside the Ki straight through", () => {
    expect(reminderPeriodForKi(2026, utc("2026-09-10"))).toBe("2026-09");
  });

  it("still applies the grace window inside the Ki", () => {
    expect(reminderPeriodForKi(2026, utc("2026-09-02"))).toBe("2026-08");
  });
});

describe("subtreeOf", () => {
  const units = [
    { id: "co", parentId: null },
    { id: "auto", parentId: "co" },
    { id: "auto-sales", parentId: "auto" },
    { id: "auto-stock", parentId: "auto" },
    { id: "ox", parentId: "co" },
  ];

  it("includes the unit itself and everything beneath it", () => {
    expect(subtreeOf("auto", units).sort()).toEqual(["auto", "auto-sales", "auto-stock"]);
  });

  it("is just the unit when it has no children", () => {
    expect(subtreeOf("auto-sales", units)).toEqual(["auto-sales"]);
  });

  it("reaches the whole tree from the company", () => {
    expect(subtreeOf("co", units)).toHaveLength(5);
  });

  it("terminates on a cycle rather than hanging the run", () => {
    const cyclic = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    expect(subtreeOf("a", cyclic).sort()).toEqual(["a", "b"]);
  });
});

describe("assignRecipients", () => {
  const item = (overrides: Partial<UnkeyedItem> = {}): UnkeyedItem => ({
    controlItemId: "ci-1",
    code: "AUTO-VOL",
    name: "Vehicle sales volume",
    dicCode: "AUTO",
    objective: "Expand unit sales",
    dicOrgUnitId: "auto",
    responsibleUserId: null,
    ...overrides,
  });

  const user = (overrides: Partial<CandidateUser> = {}): CandidateUser => ({
    id: "u-1",
    name: "Dealer Sales Lead",
    email: "dealer.lead@example.com",
    role: "OWNER",
    orgUnitId: "auto-sales",
    atCompanyRoot: false,
    covers: ["auto-sales"],
    ...overrides,
  });

  it("reminds the person named responsible, whatever org unit they sit in", () => {
    const recipients = assignRecipients(
      [item({ responsibleUserId: "u-1", dicOrgUnitId: "somewhere-else" })],
      [user({ covers: [] })],
    );
    expect(recipients).toHaveLength(1);
    expect(recipients[0].items[0].controlItemId).toBe("ci-1");
  });

  it("reminds the lead of the org unit the measure sits in", () => {
    const recipients = assignRecipients([item({ dicOrgUnitId: "auto-sales" })], [user()]);
    expect(recipients).toHaveLength(1);
  });

  it("reminds a division lead about a department beneath them", () => {
    const divisionLead = user({ id: "u-div", covers: ["auto", "auto-sales", "auto-stock"] });
    const recipients = assignRecipients([item({ dicOrgUnitId: "auto-stock" })], [divisionLead]);
    expect(recipients).toHaveLength(1);
  });

  it("does not remind a lead about a sibling division's measures", () => {
    const recipients = assignRecipients([item({ dicOrgUnitId: "ox" })], [user()]);
    expect(recipients).toEqual([]);
  });

  it("reminds both the named owner and the covering lead - both are answerable", () => {
    const owner = user({ id: "owner", covers: [] });
    const lead = user({ id: "lead", email: "lead@example.com", covers: ["auto", "auto-sales"] });
    const recipients = assignRecipients(
      [item({ responsibleUserId: "owner", dicOrgUnitId: "auto-sales" })],
      [owner, lead],
    );
    expect(recipients.map((r) => r.userId).sort()).toEqual(["lead", "owner"]);
  });

  it("leaves out anyone with nothing outstanding, rather than mailing an empty list", () => {
    const recipients = assignRecipients([], [user()]);
    expect(recipients).toEqual([]);
  });

  it("never reaches a user who covers nothing and owns nothing", () => {
    const admin = user({ id: "admin", role: "ADMIN", orgUnitId: null, covers: [] });
    const recipients = assignRecipients([item(), item({ controlItemId: "ci-2" })], [admin]);
    expect(recipients).toEqual([]);
  });

  it("never reminds a VIEWER, who has nothing to key", () => {
    const viewer = user({ id: "v", role: "VIEWER", covers: ["auto-sales"] });
    expect(assignRecipients([item({ dicOrgUnitId: "auto-sales" })], [viewer])).toEqual([]);
  });

  it("does not remind a VIEWER even when named responsible", () => {
    // The assignment is a data error rather than a reason to mail them; a
    // VIEWER cannot key a figure, so chasing one is a dead end.
    const viewer = user({ id: "v", role: "VIEWER", covers: [] });
    expect(assignRecipients([item({ responsibleUserId: "v" })], [viewer])).toEqual([]);
  });

  it("does not chase a company-level admin about every measure by coverage", () => {
    // The company root covers every division, so coverage there would mean
    // the whole Ki - true, and useless as a to-do list.
    const admin = user({
      id: "admin",
      role: "ADMIN",
      orgUnitId: "co",
      atCompanyRoot: true,
      covers: ["co", "auto", "auto-sales", "ox"],
    });
    const recipients = assignRecipients(
      [item({ dicOrgUnitId: "auto" }), item({ controlItemId: "ci-2", dicOrgUnitId: "ox" })],
      [admin],
    );
    expect(recipients).toEqual([]);
  });

  it("still reminds a company-level person about measures they personally own", () => {
    const admin = user({
      id: "admin",
      role: "ADMIN",
      orgUnitId: "co",
      atCompanyRoot: true,
      covers: ["co", "auto"],
    });
    const recipients = assignRecipients(
      [
        item({ controlItemId: "mine", responsibleUserId: "admin", dicOrgUnitId: "auto" }),
        item({ controlItemId: "theirs", dicOrgUnitId: "auto" }),
      ],
      [admin],
    );
    expect(recipients).toHaveLength(1);
    expect(recipients[0].items.map((i) => i.controlItemId)).toEqual(["mine"]);
  });

  it("gives each person only their own measures", () => {
    const a = user({ id: "a", covers: ["auto-sales"] });
    const b = user({ id: "b", email: "b@example.com", covers: ["ox"] });
    const recipients = assignRecipients(
      [
        item({ controlItemId: "ci-a", dicOrgUnitId: "auto-sales" }),
        item({ controlItemId: "ci-b", dicOrgUnitId: "ox" }),
      ],
      [a, b],
    );
    expect(recipients.find((r) => r.userId === "a")!.items.map((i) => i.controlItemId)).toEqual(["ci-a"]);
    expect(recipients.find((r) => r.userId === "b")!.items.map((i) => i.controlItemId)).toEqual(["ci-b"]);
  });
});

describe("buildReminderMessage", () => {
  const recipient = {
    userId: "u-1",
    name: "Dealer Sales Lead",
    email: "dealer.lead@example.com",
    items: [
      {
        controlItemId: "ci-1",
        code: "AUTO-VOL",
        name: "Vehicle sales volume",
        dicCode: "AUTO",
        objective: "Expand unit sales in priority segments",
      },
    ],
  };
  const context = { period: "2026-04", kiCode: "Ki 2026", appUrl: "https://hoshin.example.com" };

  it("names the month the way a person would say it", () => {
    expect(periodTitle("2026-04")).toBe("Apr 2026");
    expect(periodTitle("2027-01")).toBe("Jan 2027");
  });

  it("puts the month, the count and the Ki in the subject", () => {
    const message = buildReminderMessage(recipient, context);
    expect(message.subject).toContain("Apr 2026");
    expect(message.subject).toContain("1 figure");
    expect(message.subject).toContain("Ki 2026");
  });

  it("says figures, not figure, for more than one", () => {
    const message = buildReminderMessage(
      { ...recipient, items: [recipient.items[0], { ...recipient.items[0], controlItemId: "ci-2" }] },
      context,
    );
    expect(message.subject).toContain("2 figures");
  });

  it("addresses the person by first name", () => {
    expect(buildReminderMessage(recipient, context).text).toContain("Hello Dealer,");
  });

  it("lists every outstanding measure in both the text and the html", () => {
    const message = buildReminderMessage(recipient, context);
    expect(message.text).toContain("Vehicle sales volume");
    expect(message.html).toContain("Vehicle sales volume");
    expect(message.html).toContain("Expand unit sales in priority segments");
  });

  it("links straight to the entry screen, with no double slash", () => {
    const message = buildReminderMessage(recipient, { ...context, appUrl: "https://hoshin.example.com/" });
    expect(message.html).toContain("https://hoshin.example.com/my-entries");
    expect(message.html).not.toContain("com//my-entries");
  });

  it("escapes html in a measure name, so a stray angle bracket cannot break the mail", () => {
    const message = buildReminderMessage(
      {
        ...recipient,
        items: [{ ...recipient.items[0], name: 'Margin <b>"core"</b> & mix' }],
      },
      context,
    );
    expect(message.html).toContain("&lt;b&gt;");
    expect(message.html).toContain("&quot;core&quot;");
    expect(message.html).toContain("&amp;");
    expect(message.html).not.toContain("<b>");
  });

  it("sends to the recipient's own address", () => {
    expect(buildReminderMessage(recipient, context).to).toBe("dealer.lead@example.com");
  });
});
