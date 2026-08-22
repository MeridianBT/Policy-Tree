/**
 * The client-side permission mirror. These decide which pencils and trash
 * cans to draw; `tests/structure.test.ts` proves the server refuses anything
 * this mirror got wrong, so what matters here is that the *drawing* decision
 * matches the domain rule exactly.
 */

import { describe, expect, it } from "vitest";
import { canAddDepartmentBranch, canEditStructureAt, orgUnitCoversClient } from "@/components/sheet/permissions";
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
  it("lets ADMIN edit any level, any org unit", () => {
    expect(canEditStructureAt({ role: "ADMIN", orgUnitId: null }, DICS, 1, null)).toBe(true);
    expect(canEditStructureAt({ role: "ADMIN", orgUnitId: null }, DICS, 4, "auto-d1")).toBe(true);
  });

  it("never lets OWNER touch Levels 1-3", () => {
    const owner = { role: "OWNER" as const, orgUnitId: "auto" };
    expect(canEditStructureAt(owner, DICS, 1, null)).toBe(false);
    expect(canEditStructureAt(owner, DICS, 2, null)).toBe(false);
    expect(canEditStructureAt(owner, DICS, 3, null)).toBe(false);
  });

  it("lets a division lead edit Level 4 rows in their own division and its departments", () => {
    const owner = { role: "OWNER" as const, orgUnitId: "auto" };
    expect(canEditStructureAt(owner, DICS, 4, "auto")).toBe(true);
    expect(canEditStructureAt(owner, DICS, 4, "auto-d1")).toBe(true);
  });

  it("refuses a division lead editing a Level 4 row in a different division", () => {
    const owner = { role: "OWNER" as const, orgUnitId: "auto" };
    expect(canEditStructureAt(owner, DICS, 4, "ox")).toBe(false);
  });

  it("refuses a department lead editing their own division's other departments", () => {
    const departmentLead = { role: "OWNER" as const, orgUnitId: "auto-d1" };
    expect(canEditStructureAt(departmentLead, DICS, 4, "auto-d1")).toBe(true);
    expect(canEditStructureAt(departmentLead, DICS, 4, "auto")).toBe(false);
  });

  it("refuses everything for VIEWER", () => {
    const viewer = { role: "VIEWER" as const, orgUnitId: "auto" };
    expect(canEditStructureAt(viewer, DICS, 4, "auto")).toBe(false);
  });

  it("refuses an OWNER with no org unit assigned", () => {
    const orphan = { role: "OWNER" as const, orgUnitId: null };
    expect(canEditStructureAt(orphan, DICS, 4, "auto")).toBe(false);
  });

  it("refuses a Level 4 row with no org unit recorded", () => {
    const owner = { role: "OWNER" as const, orgUnitId: "auto" };
    expect(canEditStructureAt(owner, DICS, 4, null)).toBe(false);
  });
});

describe("canAddDepartmentBranch", () => {
  it("offers it on a Level 2 or 3 Objective, to ADMIN and OWNER alike", () => {
    const objective2 = { kind: "OBJECTIVE", level: 2 };
    const objective3 = { kind: "OBJECTIVE", level: 3 };
    expect(canAddDepartmentBranch({ role: "ADMIN", orgUnitId: null }, objective2)).toBe(true);
    expect(canAddDepartmentBranch({ role: "OWNER", orgUnitId: "auto" }, objective3)).toBe(true);
  });

  it("never offers it on a Goal, a Theme, or a Level 4 Objective", () => {
    const owner = { role: "OWNER" as const, orgUnitId: "auto" };
    expect(canAddDepartmentBranch(owner, { kind: "GOAL", level: 1 })).toBe(false);
    expect(canAddDepartmentBranch(owner, { kind: "THEME", level: 2 })).toBe(false);
    expect(canAddDepartmentBranch(owner, { kind: "OBJECTIVE", level: 4 })).toBe(false);
  });

  it("never offers it to VIEWER", () => {
    const viewer = { role: "VIEWER" as const, orgUnitId: "auto" };
    expect(canAddDepartmentBranch(viewer, { kind: "OBJECTIVE", level: 2 })).toBe(false);
  });
});
