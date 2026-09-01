/**
 * The client-side permission mirror. These decide which pencils and trash
 * cans to draw; `tests/structure.test.ts` proves the server refuses anything
 * this mirror got wrong, so what matters here is that the *drawing* decision
 * matches the domain rule exactly.
 */

import { describe, expect, it } from "vitest";
import {
  canAddDepartmentBranch,
  canEditStructureAt,
  canEnterFigures,
  orgUnitCoversClient,
} from "@/components/sheet/permissions";
import type { DicOption } from "@/components/sheet/StructureControls";

const DICS: DicOption[] = [
  { id: "auto", code: "AUTO", name: "Auto", type: "DIVISION", parentCode: null },
  { id: "auto-d1", code: "AUTO-D1", name: "Auto Dept 1", type: "DEPARTMENT", parentCode: "AUTO" },
  { id: "ox", code: "OX", name: "OX", type: "DIVISION", parentCode: null },
];

describe("orgUnitCoversClient", () => {
  it("covers itself", () => {
    expect(orgUnitCoversClient(DICS, "auto", "auto")).toBe(true);
  });

  it("a division covers its own department", () => {
    expect(orgUnitCoversClient(DICS, "auto", "auto-d1")).toBe(true);
  });

  it("a department does not cover its own division", () => {
    expect(orgUnitCoversClient(DICS, "auto-d1", "auto")).toBe(false);
  });

  it("a division does not cover another division's department", () => {
    expect(orgUnitCoversClient(DICS, "ox", "auto-d1")).toBe(false);
  });

  it("unrelated org units cover nothing", () => {
    expect(orgUnitCoversClient(DICS, "ox", "auto")).toBe(false);
  });
});

describe("canEditStructureAt", () => {
  it("lets SUPER_ADMIN edit any level, any org unit", () => {
    expect(canEditStructureAt({ id: "u1", role: "SUPER_ADMIN", orgUnitId: null }, DICS, 1, null)).toBe(true);
    expect(canEditStructureAt({ id: "u1", role: "SUPER_ADMIN", orgUnitId: null }, DICS, 4, "auto-d1")).toBe(true);
  });

  it("lets EXECUTIVE edit any level, in any org unit", () => {
    // A director is answerable for the whole deployment, so the structure
    // rules do not scope them - including at Level 4, and including a
    // department they have no org-unit relationship with. What separates an
    // EXECUTIVE from a SUPER_ADMIN is the lock, the admin panel and a year
    // already run, none of which this function decides.
    const exec = { id: "u1", role: "EXECUTIVE" as const, orgUnitId: null };
    for (const level of [1, 2, 3, 4]) {
      expect(canEditStructureAt(exec, DICS, level, null)).toBe(true);
    }
    expect(canEditStructureAt(exec, DICS, 4, "auto-d1")).toBe(true);
    expect(canEditStructureAt(exec, DICS, 4, "ox")).toBe(true);
  });

  it("refuses VIEWER at every level", () => {
    const viewer = { id: "u1", role: "VIEWER" as const, orgUnitId: "auto" };
    for (const level of [1, 2, 3, 4]) {
      expect(canEditStructureAt(viewer, DICS, level, "auto")).toBe(false);
    }
  });

  it("gives each role a different answer for the same row", () => {
    // The whole point of four roles: one Level 3 row, four verdicts.
    const row = (role: "SUPER_ADMIN" | "EXECUTIVE" | "OWNER" | "VIEWER") =>
      canEditStructureAt({ id: "u1", role, orgUnitId: "auto" }, DICS, 3, null);
    expect([row("SUPER_ADMIN"), row("EXECUTIVE"), row("OWNER"), row("VIEWER")]).toEqual([
      true,
      true,
      false,
      false,
    ]);

    // At Level 4 in a department the OWNER does not cover, only the two
    // company-wide roles get through.
    const strangerL4 = (role: "SUPER_ADMIN" | "EXECUTIVE" | "OWNER" | "VIEWER") =>
      canEditStructureAt({ id: "u1", role, orgUnitId: "ox" }, DICS, 4, "auto-d1");
    expect([
      strangerL4("SUPER_ADMIN"),
      strangerL4("EXECUTIVE"),
      strangerL4("OWNER"),
      strangerL4("VIEWER"),
    ]).toEqual([true, true, false, false]);
  });

  it("never lets OWNER touch Levels 1-3", () => {
    const owner = { id: "u1", role: "OWNER" as const, orgUnitId: "auto" };
    expect(canEditStructureAt(owner, DICS, 1, null)).toBe(false);
    expect(canEditStructureAt(owner, DICS, 2, null)).toBe(false);
    expect(canEditStructureAt(owner, DICS, 3, null)).toBe(false);
  });

  it("lets a division lead edit Level 4 rows in their own division and its departments", () => {
    const owner = { id: "u1", role: "OWNER" as const, orgUnitId: "auto" };
    expect(canEditStructureAt(owner, DICS, 4, "auto")).toBe(true);
    expect(canEditStructureAt(owner, DICS, 4, "auto-d1")).toBe(true);
  });

  it("refuses a division lead editing a Level 4 row in a different division", () => {
    const owner = { id: "u1", role: "OWNER" as const, orgUnitId: "auto" };
    expect(canEditStructureAt(owner, DICS, 4, "ox")).toBe(false);
  });

  it("refuses a department lead editing their own division's other departments", () => {
    const departmentLead = { id: "u1", role: "OWNER" as const, orgUnitId: "auto-d1" };
    expect(canEditStructureAt(departmentLead, DICS, 4, "auto-d1")).toBe(true);
    expect(canEditStructureAt(departmentLead, DICS, 4, "auto")).toBe(false);
  });

  it("refuses everything for VIEWER", () => {
    const viewer = { id: "u1", role: "VIEWER" as const, orgUnitId: "auto" };
    expect(canEditStructureAt(viewer, DICS, 4, "auto")).toBe(false);
  });

  it("refuses an OWNER with no org unit assigned", () => {
    const orphan = { id: "u1", role: "OWNER" as const, orgUnitId: null };
    expect(canEditStructureAt(orphan, DICS, 4, "auto")).toBe(false);
  });

  it("refuses a Level 4 row with no org unit recorded", () => {
    const owner = { id: "u1", role: "OWNER" as const, orgUnitId: "auto" };
    expect(canEditStructureAt(owner, DICS, 4, null)).toBe(false);
  });
});

describe("canAddDepartmentBranch", () => {
  it("offers it on a Level 3 Objective, to every role but VIEWER", () => {
    const objective3 = { kind: "OBJECTIVE", level: 3 };
    expect(canAddDepartmentBranch({ id: "u1", role: "SUPER_ADMIN", orgUnitId: null }, objective3)).toBe(true);
    expect(canAddDepartmentBranch({ id: "u1", role: "EXECUTIVE", orgUnitId: null }, objective3)).toBe(true);
    expect(canAddDepartmentBranch({ id: "u1", role: "OWNER", orgUnitId: "auto" }, objective3)).toBe(true);
    expect(canAddDepartmentBranch({ id: "u1", role: "VIEWER", orgUnitId: "auto" }, objective3)).toBe(false);
  });

  it("offers it nowhere else on the ladder", () => {
    // The ladder is Goal, Objective, Objective, department, and a branch takes
    // the last rung. Off a Level 2 it would skip the company's own deployment
    // - the step that says what the division was asked to do - and off a Level
    // 4 it would be laddering off another department's branch.
    const owner = { id: "u1", role: "OWNER" as const, orgUnitId: "auto" };
    expect(canAddDepartmentBranch(owner, { kind: "GOAL", level: 1 })).toBe(false);
    expect(canAddDepartmentBranch(owner, { kind: "OBJECTIVE", level: 2 })).toBe(false);
    expect(canAddDepartmentBranch(owner, { kind: "OBJECTIVE", level: 4 })).toBe(false);
  });

  it("never offers it to VIEWER", () => {
    const viewer = { id: "u1", role: "VIEWER" as const, orgUnitId: "auto" };
    expect(canAddDepartmentBranch(viewer, { kind: "OBJECTIVE", level: 3 })).toBe(false);
  });
});

/**
 * Who may key a figure, as opposed to who may move the furniture. This is a
 * different and deliberately wider rule than the structure one above, and the
 * widening is the part worth pinning: being *named responsible* for a measure
 * is enough on its own, whichever division the measure is filed under.
 */
describe("canEnterFigures", () => {
  const inAuto = { dicOrgUnitId: "auto", responsibleUserId: null };
  const inAutoDept = { dicOrgUnitId: "auto-d1", responsibleUserId: null };
  const inOx = { dicOrgUnitId: "ox", responsibleUserId: null };

  it("lets a SUPER_ADMIN and an EXECUTIVE key anything", () => {
    for (const role of ["SUPER_ADMIN", "EXECUTIVE"] as const) {
      expect(canEnterFigures({ id: "u1", role, orgUnitId: null }, DICS, inOx)).toBe(true);
    }
  });

  it("refuses a VIEWER everything, including their own division", () => {
    expect(canEnterFigures({ id: "u1", role: "VIEWER", orgUnitId: "auto" }, DICS, inAuto)).toBe(false);
  });

  it("lets an OWNER key their own division and the departments beneath it", () => {
    const lead = { id: "u1", role: "OWNER" as const, orgUnitId: "auto" };
    expect(canEnterFigures(lead, DICS, inAuto)).toBe(true);
    expect(canEnterFigures(lead, DICS, inAutoDept)).toBe(true);
  });

  it("refuses an OWNER another division's measures", () => {
    expect(canEnterFigures({ id: "u1", role: "OWNER", orgUnitId: "auto" }, DICS, inOx)).toBe(false);
  });

  it("lets a named responsible person key a measure outside their own division", () => {
    // This is how a measure owned by one division but kept by a named person
    // in another gets its numbers, without handing anyone a whole division.
    const outsider = { id: "u9", role: "OWNER" as const, orgUnitId: "auto" };
    expect(canEnterFigures(outsider, DICS, { dicOrgUnitId: "ox", responsibleUserId: "u9" })).toBe(true);
  });

  it("does not let being responsible promote a VIEWER", () => {
    const viewer = { id: "u9", role: "VIEWER" as const, orgUnitId: "ox" };
    expect(canEnterFigures(viewer, DICS, { dicOrgUnitId: "ox", responsibleUserId: "u9" })).toBe(false);
  });

  it("refuses an OWNER with no org unit and no named responsibility", () => {
    expect(canEnterFigures({ id: "u1", role: "OWNER", orgUnitId: null }, DICS, inAuto)).toBe(false);
  });
});
