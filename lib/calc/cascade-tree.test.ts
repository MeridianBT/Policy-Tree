/**
 * The cascade tree builder. This is a pure reconstruction of the same tree
 * `loadSheet` already walks server-side - built from nothing but the `path`
 * every row already carries - so what matters here is that reconstruction is
 * exact: every row lands under the right parent, and nothing is dropped or
 * duplicated.
 */

import { describe, expect, it } from "vitest";
import { buildCascadeTree, hasDepartmentWork } from "@/components/sheet/outline";
import { rowKey, type ControlItemRow, type GroupRow, type SheetRowModel } from "@/lib/sheet/types";

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
    businessUnitId: "bu1",
    measuredAsRaw: null,
    responsibleUserId: null,
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
    const l2 = group("l2", 2, ["goal"]);
    const l3 = group("l3", 3, ["goal", "l2"]);
    const ci = item("ci", 3, ["goal", "l2", "l3"]);

    const roots = buildCascadeTree([goal, l2, l3, ci]);

    expect(roots).toHaveLength(1);
    expect(roots[0].row.id).toBe("goal");
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].row.id).toBe("l2");
    expect(roots[0].children[0].children[0].row.id).toBe("l3");
    expect(roots[0].children[0].children[0].children[0].row.id).toBe("ci");
  });

  it("attaches a Level 4 branch as a direct child of the Objective it ladders into", () => {
    const goal = group("goal", 1, []);
    const objective = group("obj", 2, ["goal"]);
    const branch = group("l4", 4, ["goal", "obj"], { orgUnitId: "dept-1" });
    const l4item = item("l4-ci", 4, ["goal", "obj", "l4"]);

    const roots = buildCascadeTree([goal, objective, branch, l4item]);

    const objectiveNode = roots[0].children[0];
    expect(objectiveNode.row.id).toBe("obj");
    expect(objectiveNode.children).toHaveLength(1);
    expect(objectiveNode.children[0].row.id).toBe("l4");
    expect(objectiveNode.children[0].row.level).toBe(4);
    expect(objectiveNode.children[0].children[0].row.id).toBe("l4-ci");
  });

  it("gives an Objective with several Level 4 branches all of them as siblings", () => {
    const goal = group("goal", 1, []);
    const objective = group("obj", 2, ["goal"]);
    const branchA = group("branch-a", 4, ["goal", "obj"]);
    const branchB = group("branch-b", 4, ["goal", "obj"]);

    const roots = buildCascadeTree([goal, objective, branchA, branchB]);

    const objectiveNode = roots[0].children[0];
    expect(objectiveNode.children.map((c) => c.row.id).sort()).toEqual(["branch-a", "branch-b"]);
  });

  it("drops nothing and duplicates nothing across a larger tree", () => {
    const rows = [
      group("goal", 1, []),
      group("l2", 2, ["goal"]),
      group("l3", 3, ["goal", "l2"]),
      item("a", 3, ["goal", "l2", "l3"]),
      item("b", 3, ["goal", "l2", "l3"]),
      group("l4", 4, ["goal", "l2"]),
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

/*
 * The case that took the deployed app down.
 *
 * A GroupRow's id is a Node id and a ControlItemRow's is a Control Item id -
 * different tables, nothing stopping them colliding - and on every database
 * that came through the flatten migration they collide by construction. The
 * builder used to key one map by `row.id`, so the Control Item overwrote the
 * heading: the heading vanished from the tree and the item was pushed into its
 * parent twice, under a React key it now shared with itself.
 */
describe("an Objective whose id its Control Item shares", () => {
  const SHARED = "shared-id";

  const rows = [
    group("goal", 1, []),
    // The Objective's heading, and the figure kept against it. Same id.
    group(SHARED, 2, ["goal"]),
    item(SHARED, 2, ["goal", SHARED], { firstOfObjective: false, objectiveId: SHARED }),
    group("l3", 3, ["goal", SHARED]),
  ];

  it("keeps both rows, each exactly once", () => {
    const roots = buildCascadeTree(rows);
    const flat: SheetRowModel[] = [];
    const walk = (nodes: ReturnType<typeof buildCascadeTree>) => {
      for (const node of nodes) {
        flat.push(node.row);
        walk(node.children);
      }
    };
    walk(roots);
    expect(flat).toHaveLength(rows.length);
    expect(flat.filter((row) => row.kind === "CONTROL_ITEM")).toHaveLength(1);
    expect(flat.filter((row) => row.id === SHARED)).toHaveLength(2);
  });

  it("gives every row in the tree a key of its own", () => {
    const roots = buildCascadeTree(rows);
    const keys: string[] = [];
    const walk = (nodes: ReturnType<typeof buildCascadeTree>) => {
      for (const node of nodes) {
        keys.push(rowKey(node.row));
        walk(node.children);
      }
    };
    walk(roots);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("hangs the deployment off the heading, not off the figure", () => {
    const objective = buildCascadeTree(rows)[0].children[0];
    expect(objective.row.kind).not.toBe("CONTROL_ITEM");
    expect(objective.children.map((child) => child.row.id).sort()).toEqual(["l3", SHARED]);
  });
});

describe("hasDepartmentWork", () => {
  it("is false for an Objective with only company-wide children", () => {
    const goal = group("goal", 1, []);
    const objective = group("obj", 2, ["goal"]);
    const ci = item("ci", 2, ["goal", "obj"]);
    const roots = buildCascadeTree([goal, objective, ci]);
    expect(hasDepartmentWork(roots[0].children[0])).toBe(false);
  });

  it("is true the moment any direct child is a Level 4 row", () => {
    const goal = group("goal", 1, []);
    const objective = group("obj", 2, ["goal"]);
    const branch = group("l4", 4, ["goal", "obj"]);
    const roots = buildCascadeTree([goal, objective, branch]);
    expect(hasDepartmentWork(roots[0].children[0])).toBe(true);
  });

  it("is false for a leaf Objective with no children at all", () => {
    const goal = group("goal", 1, []);
    const objective = group("obj", 2, ["goal"]);
    const roots = buildCascadeTree([goal, objective]);
    expect(hasDepartmentWork(roots[0].children[0])).toBe(false);
  });
});
