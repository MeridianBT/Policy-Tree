/**
 * The alignment map: every Company Goal down to the Department work laddering
 * into it, on one page, with a continuous line the eye can follow.
 *
 * This is deliberately not the sheet. There is no editing surface, no target
 * version picker, no filter bar - it renders once and is meant to be read,
 * the same way a wall chart is read. A gap in the cascade (an Objective with
 * nothing yet laddering in under it) is shown exactly as plainly as a filled
 * one; that gap is the thing this page exists to surface.
 */
import { EvaluationSymbol } from "@/components/sheet/EvaluationSymbol";
import { buildCascadeTree, groupHeading, hasDepartmentWork, indentPx, type CascadeNode } from "@/components/sheet/outline";
import type { ControlItemRow, SheetModel, SheetRowModel } from "@/lib/sheet/types";
import { formatAchievement } from "@/lib/calc/format";

export function CascadeView({ model }: { model: SheetModel }) {
  const roots = buildCascadeTree(model.rows);
  const dicsById = new Map(model.dics.map((dic) => [dic.id, dic]));

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-paper">
      <div className="mx-auto max-w-4xl px-8 py-6">
        <header className="mb-4">
          <h1 className="text-[15px] font-semibold">Cascade</h1>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Every Company Goal, down through the Departments laddering their work into it.
          </p>
        </header>

        <div className="divide-y divide-rule">
          {roots.map((root) => (
            <div key={root.row.id} className="py-4">
              <Branch node={root} parentRow={null} dicsById={dicsById} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Branch({
  node,
  parentRow,
  dicsById,
}: {
  node: CascadeNode;
  parentRow: SheetRowModel | null;
  dicsById: Map<string, SheetModel["dics"][number]>;
}) {
  const delta = parentRow ? indentPx(node.row) - indentPx(parentRow) : 0;
  const nested = delta > 0;
  const showGap = node.row.kind === "OBJECTIVE" && !hasDepartmentWork(node);

  return (
    <div
      style={nested ? { marginLeft: delta } : undefined}
      className={nested ? "border-l border-rule pl-3" : undefined}
    >
      <Row row={node.row} dicsById={dicsById} />
      {showGap && <GapLine />}
      {node.children.map((child) => (
        <Branch key={child.row.id} node={child} parentRow={node.row} dicsById={dicsById} />
      ))}
    </div>
  );
}

function Row({
  row,
  dicsById,
}: {
  row: SheetRowModel;
  dicsById: Map<string, SheetModel["dics"][number]>;
}) {
  if (row.kind === "CONTROL_ITEM") return <ControlItemLine row={row as ControlItemRow} dicsById={dicsById} />;

  const isGoal = row.kind === "GOAL";
  const isDepartmentBranch = row.level === 4;
  const dic = isDepartmentBranch && row.orgUnitId ? dicsById.get(row.orgUnitId) : undefined;
  // Same weight convention as the sheet grid: Goal is boldest, Theme carries
  // some weight, Objective sits quietest of the three - the one visual cue
  // telling apart rows that otherwise share an indent step.
  const tone =
    row.kind === "GOAL"
      ? "text-[14px] font-semibold"
      : row.kind === "THEME"
        ? "text-[13px] font-medium"
        : "text-[13px] text-ink-muted";

  return (
    <div className={`flex items-baseline gap-2 py-1 ${tone}`}>
      <span>{isGoal ? groupHeading(row.statement, row.ordinal) : row.statement}</span>
      {dic && (
        <span
          className="shrink-0 rounded-sm border border-rule px-1 text-[10px] font-normal text-ink-muted"
          title={`Division in charge: ${dic.name}`}
        >
          {dic.code}
        </span>
      )}
    </div>
  );
}

function ControlItemLine({
  row,
  dicsById,
}: {
  row: ControlItemRow;
  dicsById: Map<string, SheetModel["dics"][number]>;
}) {
  const kiCell = row.cells.find((cell) => cell.kind === "KI") ?? null;
  const dic = dicsById.get(row.dicOrgUnitId);

  return (
    <div className="flex items-baseline gap-2 py-0.5 text-[12px] text-ink-muted">
      <EvaluationSymbol symbol={kiCell?.symbol ?? null} label={kiCell?.symbolLabel} color={kiCell?.symbolColor} size={12} />
      <span className="text-ink">{row.name}</span>
      <span className="text-[11px] text-ink-faint">({row.measuredAs})</span>
      {dic && (
        <span
          className="shrink-0 rounded-sm border border-rule px-1 text-[10px] text-ink-muted"
          title={`Division in charge: ${dic.name}`}
        >
          {dic.code}
        </span>
      )}
      {/*
        The business unit sits beside the DIC as a second, equally quiet badge.
        It is a tag on the measure rather than a level in the tree, so it never
        becomes a grouping here: a Level 4 branch renders where it structurally
        attaches, and nesting by business unit would contradict the sheet.
      */}
      <span
        className="shrink-0 rounded-sm border border-rule px-1 text-[10px] text-ink-faint"
        title={`Business unit: ${row.businessUnitName}`}
      >
        {row.businessUnitCode}
      </span>
      {kiCell && (
        <span className="num ml-auto shrink-0 text-[11px] text-ink-faint">{formatAchievement(kiCell.achievement)}</span>
      )}
    </div>
  );
}

/** The quiet, always-visible marker for an Objective nothing has deployed against yet. */
function GapLine() {
  return (
    <div className="border-l border-dashed border-rule py-1 pl-3 text-[12px] italic text-ink-faint">
      — nothing yet ladders in here —
    </div>
  );
}
