/**
 * The cascade tree builder. This is a pure reconstruction of the same tree
 * `loadSheet` already walks server-side - built from nothing but the `path`
 * every row already carries - so what matters here is that reconstruction is
 * exact: every row lands under the right parent, and nothing is dropped or
 * duplicated.
 */

import { describe, expect, it } from "vitest";
import { buildCascadeTree, hasDepartmentWork } from "@/components/sheet/outline";
import type { ControlItemRow, GroupRow, SheetRowModel } from "@/lib/sheet/types";

function group(id: string, level: number, path: string[], overrides: Partial<GroupRow> = {}): SheetRowModel {
  return {
    id,
    kind: overrides.kind ?? (level === 1 ? "GOAL" : "OBJECTIVE"),
    level,
    statement: `Statement ${id}`,
    path,
    controlItemIds: [],
    ...overrides,
  } as SheetRowModel;
}

function item(id: string, level: number, path: string[], overrides: Partial<ControlItemRow> = {}): SheetRowModel {
  return {
    id,
    kind: "CONTROL_ITEM",
    code: id,
    name: `Item ${id}`,
    measuredAs: "Units",
    unit: "COUNT",
    decimalPlaces: 0,
    direction: "HIGHER_BETTER",
    aggregation: "SUM",
    dicCode: "AUTO",
    dicName: "Auto",
    dicOrgUnitId: "org-auto",
    responsibleUserName: null,
    level,
    path,
    laddersTo: null,
    cells: [],
    kiSymbol: null,
    ...overrides,
  } as SheetRowModel;
}

describe("buildCascadeTree", () => {
  it("nests a plain Level 1-3 chain correctly", () => {
    const goal = group("goal", 1, []);
    const theme = group("theme", 2, ["goal"], { kind: "THEME" });
    const objective = group("obj", 2, ["goal", "theme"], { kind: "OBJECTIVE" });
    const ci = item("ci", 2, ["goal", "theme", "obj"]);

    const roots = buildCascadeTree([goal, theme, objective, ci]);

    expect(roots).toHaveLength(1);
    expect(roots[0].row.id).toBe("goal");
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].row.id).toBe("theme");
    expect(roots[0].children[0].children[0].row.id).toBe("obj");
    expect(roots[0].children[0].children[0].children[0].row.id).toBe("ci");
  });

  it("attaches a Level 4 branch as a direct child of the Objective it ladders into", () => {
    const goal = group("goal", 1, []);
    const objective = group("obj", 2, ["goal"], { kind: "OBJECTIVE" });
    const l4theme = group("l4-theme", 4, ["goal", "obj"], { kind: "THEME", orgUnitId: "dept-1" });
    const l4objective = group("l4-obj", 4, ["goal", "obj", "l4-theme"], { kind: "OBJECTIVE" });
    const l4item = item("l4-ci", 4, ["goal", "obj", "l4-theme", "l4-obj"]);

    const roots = buildCascadeTree([goal, objective, l4theme, l4objective, l4item]);

    const objectiveNode = roots[0].children[0];
    expect(objectiveNode.row.id).toBe("obj");
    expect(objectiveNode.children).toHaveLength(1);
    expect(objectiveNode.children[0].row.id).toBe("l4-theme");
    expect(objectiveNode.children[0].row.level).toBe(4);
    expect(objectiveNode.children[0].children[0].row.id).toBe("l4-obj");
    expect(objectiveNode.children[0].children[0].children[0].row.id).toBe("l4-ci");
  });

  it("gives an Objective with several Level 4 branches all of them as siblings", () => {
    const goal = group("goal", 1, []);
    const objective = group("obj", 2, ["goal"], { kind: "OBJECTIVE" });
    const branchA = group("branch-a", 4, ["goal", "obj"], { kind: "THEME" });
    const branchB = group("branch-b", 4, ["goal", "obj"], { kind: "THEME" });

    const roots = buildCascadeTree([goal, objective, branchA, branchB]);

    const objectiveNode = roots[0].children[0];
    expect(objectiveNode.children.map((c) => c.row.id).sort()).toEqual(["branch-a", "branch-b"]);
  });

  it("drops nothing and duplicates nothing across a larger tree", () => {
    const rows = [
      group("goal", 1, []),
      group("theme", 2, ["goal"], { kind: "THEME" }),
      group("obj", 2, ["goal", "theme"], { kind: "OBJECTIVE" }),
      item("a", 2, ["goal", "theme", "obj"]),
      item("b", 2, ["goal", "theme", "obj"]),
      group("l4", 4, ["goal", "obj"], { kind: "THEME" }),
    ];

    function countNodes(nodes: ReturnType<typeof buildCascadeTree>): number {
      return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
    }

    expect(countNodes(buildCascadeTree(rows))).toBe(rows.length);
  });

  it("treats a row with no ancestors as a root, even if it is not first in the list", () => {
    const orphan = group("late-goal", 1, []);
    const goal = group("goal", 1, []);
    const roots = buildCascadeTree([goal, orphan]);
    expect(roots.map((r) => r.row.id).sort()).toEqual(["goal", "late-goal"]);
  });
});

describe("hasDepartmentWork", () => {
  it("is false for an Objective with only company-wide children", () => {
    const goal = group("goal", 1, []);
    const objective = group("obj", 2, ["goal"], { kind: "OBJECTIVE" });
    const ci = item("ci", 2, ["goal", "obj"]);
    const roots = buildCascadeTree([goal, objective, ci]);
    expect(hasDepartmentWork(roots[0].children[0])).toBe(false);
  });

  it("is true the moment any direct child is a Level 4 row", () => {
    const goal = group("goal", 1, []);
    const objective = group("obj", 2, ["goal"], { kind: "OBJECTIVE" });
    const l4theme = group("l4", 4, ["goal", "obj"], { kind: "THEME" });
    const roots = buildCascadeTree([goal, objective, l4theme]);
    expect(hasDepartmentWork(roots[0].children[0])).toBe(true);
  });

  it("is false for a leaf Objective with no children at all", () => {
    const goal = group("goal", 1, []);
    const objective = group("obj", 2, ["goal"], { kind: "OBJECTIVE" });
    const roots = buildCascadeTree([goal, objective]);
    expect(hasDepartmentWork(roots[0].children[0])).toBe(false);
  });
});
