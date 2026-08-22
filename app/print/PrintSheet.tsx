/**
 * The printed company sheet. A server component - there is no interactivity
 * on paper, so there is no client bundle here at all.
 *
 * Density is set by the display mode: the default puts actual and evaluation
 * symbol in every month cell with the target above it, which is what the
 * quarterly review reads from.
 */

import type { SheetModel, ControlItemRow, GroupRow } from "@/lib/sheet/types";
import { ALL_QUARTERS, sheetColumns } from "@/components/sheet/columns";
import { groupHeading, indentSteps } from "@/components/sheet/outline";
import { formatAchievement, formatValue } from "@/lib/calc/format";
import { EvaluationSymbol } from "@/components/sheet/EvaluationSymbol";
import "./print.css";

export function PrintSheet({
  model,
  title,
  versionLabel,
  quartersOnly,
}: {
  model: SheetModel;
  title: string;
  versionLabel: string;
  /** Condense every quarter, for a review that reads at quarter level. */
  quartersOnly?: boolean;
}) {
  const columns = sheetColumns(model.kiStartYear, {
    condensedQuarters: quartersOnly ? ALL_QUARTERS : [],
  });
  const printedAt = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="print-sheet">
      <header className="mb-1 flex items-baseline justify-between">
        <h1 className="text-[11pt] font-bold">{title}</h1>
        <p className="text-[8pt]">
          <strong>{model.kiCode}</strong> · {versionLabel} ·{" "}
          {quartersOnly ? "quarters only" : "monthly"} · printed {printedAt}
        </p>
      </header>

      <table>
        <colgroup>
          <col className="col-label" />
          <col className="col-measure" />
          <col className="col-dic" />
          {columns.map((column) => (
            <col
              key={column.key}
              className={
                column.kind === "MONTH"
                  ? "col-month"
                  : column.kind === "QUARTER"
                    ? "col-quarter"
                    : "col-ki"
              }
            />
          ))}
        </colgroup>

        <thead>
          <tr>
            <th className="col-label">Measures</th>
            <th className="col-measure">Measured as</th>
            <th className="col-dic">DIC</th>
            {columns.map((column) => (
              <th
                key={column.key}
                className={
                  column.kind === "QUARTER"
                    ? "col-quarter"
                    : column.kind === "KI"
                      ? "col-ki"
                      : "col-month"
                }
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {model.rows.map((row) => {
            if (row.kind !== "CONTROL_ITEM") {
              const group = row as GroupRow;
              return (
                <tr
                  key={group.id}
                  className={
                    group.kind === "GOAL"
                      ? "goal-row"
                      : group.kind === "THEME"
                        ? "theme-row"
                        : "objective-row"
                  }
                >
                  <td
                    colSpan={columns.length + 3}
                    style={{ paddingLeft: `${1 + indentSteps(group) * 3.5}mm` }}
                  >
                    {groupHeading(group.statement, group.ordinal)}
                    {group.laddersTo ? `  ↳ ${group.laddersTo}` : ""}
                  </td>
                </tr>
              );
            }

            const item = row as ControlItemRow;
            const cellByKey = new Map(item.cells.map((cell) => [cell.key, cell]));
            return (
              <tr key={item.id}>
                <td style={{ paddingLeft: `${1 + indentSteps(item) * 3.5}mm` }}>{item.name}</td>
                <td className="col-measure">{item.measuredAs}</td>
                <td>{item.dicCode}</td>
                {columns.map((column) => {
                  const cell = cellByKey.get(column.key)!;
                  return (
                    <td
                      key={column.key}
                      className={
                        column.kind === "QUARTER"
                          ? "col-quarter"
                          : column.kind === "KI"
                            ? "col-ki"
                            : "col-month"
                      }
                    >
                      {/* Two lines, not three: the plan figure above, the
                          result and its evaluation below. The percentage is
                          kept only in the wider summary columns, which is what
                          holds Levels 1-3 to a single A3 page. */}
                      <div className="num target-line">
                        {formatValue(cell.target, item.decimalPlaces)}
                        {cell.kind !== "MONTH" && cell.achievement !== null
                          ? `  ${formatAchievement(cell.achievement)}`
                          : ""}
                      </div>
                      <div className="num actual-line">
                        <span>{formatValue(cell.actual, item.decimalPlaces)}</span>
                        <EvaluationSymbol
                          symbol={cell.symbol}
                          label={cell.symbolLabel}
                          color="#000"
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      <footer className="mt-1 flex items-center gap-4 text-[7pt]">
        <span className="font-bold">Evaluation</span>
        {model.bands.map((band) => (
          <span key={band.symbol} className="flex items-center gap-1">
            <EvaluationSymbol symbol={band.symbol} label={band.label} color="#000" />
            <span>
              {band.label} ({bandRange(band)})
            </span>
          </span>
        ))}
      </footer>
    </div>
  );
}

function bandRange(band: SheetModel["bands"][number]): string {
  if (band.minPct === null) return `< ${Math.round(band.maxPct! * 100)}%`;
  if (band.maxPct === null) return `≥ ${Math.round(band.minPct * 100)}%`;
  return `${Math.round(band.minPct * 100)}–${Math.round(band.maxPct * 100)}%`;
}
