/**
 * The cascade tree builder. This is a pure reconstruction of the same tree
 * `loadSheet` already walks server-side - built from nothing but the `path`
 * every row already carries - so what matters here is that reconstruction is
 * exact: every row lands under the right parent, and nothing is dropped or
 * duplicated.
 */

import { describe, expect, it } from "vitest";
import {
  buildCascadeTree,
  deploymentGap,
  emptyObjective,
  hasDepartmentWork,
  isObjectiveNode,
} from "@/components/sheet/outline";
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


/*
 * The gap markers, and the UAT report that found them wrong.
 *
 * A department branch on the Cascade printed "nothing yet ladders in here"
 * above its own measures. The test behind that line asked only whether a row
 * had a Level 4 child - so it fired on a Level 4 branch, which can never have
 * one; on a Level 2, which `addDepartmentBranch` will not attach a branch to
 * either; and never on an Objective held to a single measure, which is the
 * shape most Objectives have. Every clause below pins one of those.
 */
describe("deploymentGap", () => {
  const withParents = (...rows: SheetRowModel[]) => buildCascadeTree(rows);

  it("is true for a Level 3 Objective with measures and no branch", () => {
    const roots = withParents(
      group("goal", 1, []),
      group("l2", 2, ["goal"]),
      group("l3", 3, ["goal", "l2"]),
      item("a", 3, ["goal", "l2", "l3"]),
      item("b", 3, ["goal", "l2", "l3"]),
    );
    expect(deploymentGap(roots[0].children[0].children[0])).toBe(true);
  });

  /*
   * The half the page was silent on. An Objective held to one Control Item has
   * no heading row - that measure *is* the Objective - so a test written
   * against `kind === "OBJECTIVE"` skipped it, and with it most of the real
   * gaps in the plan.
   */
  it("is true for a Level 3 held to a single measure, which renders inline", () => {
    const roots = withParents(
      group("goal", 1, []),
      group("l2", 2, ["goal"]),
      item("only", 3, ["goal", "l2"], { objectiveId: "l3", firstOfObjective: true }),
    );
    const inline = roots[0].children[0].children[0];
    expect(inline.row.kind).toBe("CONTROL_ITEM");
    expect(isObjectiveNode(inline)).toBe(true);
    expect(deploymentGap(inline)).toBe(true);
  });

  it("is false once a department branch ladders in", () => {
    const roots = withParents(
      group("goal", 1, []),
      group("l2", 2, ["goal"]),
      group("l3", 3, ["goal", "l2"]),
      item("a", 3, ["goal", "l2", "l3"]),
      group("branch", 4, ["goal", "l2", "l3"], { orgUnitId: "org-auto" } as Partial<GroupRow>),
    );
    expect(deploymentGap(roots[0].children[0].children[0])).toBe(false);
  });

  /*
   * The row in the UAT screenshot. A branch is the bottom of the ladder, so
   * the question has one permanent answer and printing it is noise dressed as
   * a finding.
   */
  it("is false for a Level 4 department branch, which nothing can ladder into", () => {
    const roots = withParents(
      group("goal", 1, []),
      group("l2", 2, ["goal"]),
      group("l3", 3, ["goal", "l2"]),
      group("branch", 4, ["goal", "l2", "l3"], { orgUnitId: "org-auto" } as Partial<GroupRow>),
      item("bm", 4, ["goal", "l2", "l3", "branch"], { objectiveId: "branch" }),
      item("bn", 4, ["goal", "l2", "l3", "branch"], { objectiveId: "branch" }),
    );
    const branch = roots[0].children[0].children[0].children[0];
    expect(branch.row.level).toBe(4);
    expect(deploymentGap(branch)).toBe(false);
  });

  it("is false for a Level 2, which a branch cannot attach to either", () => {
    const roots = withParents(
      group("goal", 1, []),
      group("l2", 2, ["goal"]),
      item("a", 2, ["goal", "l2"]),
      item("b", 2, ["goal", "l2"]),
    );
    expect(deploymentGap(roots[0].children[0])).toBe(false);
  });

  it("is false for a Goal", () => {
    const roots = withParents(group("goal", 1, []), group("l2", 2, ["goal"]));
    expect(deploymentGap(roots[0])).toBe(false);
  });

  // The deeper hole wins: a row with nothing under it is short a measure
  // before it is short a department.
  it("defers to the empty marker when there is nothing under the row at all", () => {
    const roots = withParents(group("goal", 1, []), group("l2", 2, ["goal"]), group("l3", 3, ["goal", "l2"]));
    const l3 = roots[0].children[0].children[0];
    expect(emptyObjective(l3)).toBe(true);
    expect(deploymentGap(l3)).toBe(false);
  });
});

describe("emptyObjective", () => {
  it("is true for a department branch with no measure against it", () => {
    const roots = buildCascadeTree([
      group("goal", 1, []),
      group("l2", 2, ["goal"]),
      group("l3", 3, ["goal", "l2"]),
      group("branch", 4, ["goal", "l2", "l3"], { orgUnitId: "org-auto" } as Partial<GroupRow>),
    ]);
    expect(emptyObjective(roots[0].children[0].children[0].children[0])).toBe(true);
  });

  /*
   * Children rather than Control Items. An Objective that carries no measure
   * of its own but has departments beneath it is measured - in the branches -
   * and nagging about it would bury the rows that really are bare.
   */
  it("is false for an Objective whose measurement lives in its branches", () => {
    const roots = buildCascadeTree([
      group("goal", 1, []),
      group("l2", 2, ["goal"]),
      group("l3", 3, ["goal", "l2"]),
      group("branch", 4, ["goal", "l2", "l3"], { orgUnitId: "org-auto" } as Partial<GroupRow>),
    ]);
    expect(emptyObjective(roots[0].children[0].children[0])).toBe(false);
  });

  it("is false for an Objective rendering inline, which carries its one measure", () => {
    const roots = buildCascadeTree([
      group("goal", 1, []),
      group("l2", 2, ["goal"]),
      item("only", 3, ["goal", "l2"], { objectiveId: "l3", firstOfObjective: true }),
    ]);
    expect(emptyObjective(roots[0].children[0].children[0])).toBe(false);
  });
});
