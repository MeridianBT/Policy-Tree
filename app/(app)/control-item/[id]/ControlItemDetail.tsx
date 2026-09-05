"use client";

/**
 * Control Item detail: the trend across the Ki with every version overlaid,
 * the seventeen sheet columns for this one row, the stored cells including any
 * formula as typed, and the full audit trail.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ControlItemDetail } from "@/lib/control-item/query";
import { EM_DASH, formatAchievement, formatValue } from "@/lib/calc/format";
import { monthLabel } from "@/lib/domain/period";
import { EvaluationSymbol } from "@/components/sheet/EvaluationSymbol";
import { RichText } from "@/components/ui/RichText";
import { columnClass, columnWidth, sheetColumns } from "@/components/sheet/columns";
import { RationalePanel } from "@/components/rationale/RationalePanel";
import type { NoteRow } from "@/lib/rationale/notes";

export function ControlItemDetailView({
  detail,
  notes,
  canEdit,
  currentUserId,
  isSuperAdmin,
}: {
  detail: ControlItemDetail;
  /** Every note against this measure, newest first. */
  notes: NoteRow[];
  canEdit: boolean;
  currentUserId: string;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"TREND" | "CELLS" | "HISTORY" | "RATIONALE">("TREND");
  const columns = useMemo(() => sheetColumns(detail.kiStartYear), [detail.kiStartYear]);
  const cellByKey = useMemo(() => new Map(detail.cells.map((cell) => [cell.key, cell])), [detail.cells]);

  const actualCode = detail.versions.find((version) => version.isActual)?.code ?? "ACT";
  const forecastCodes = detail.versions.filter((version) => !version.isActual).map((v) => v.code);

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <header className="border-b border-rule pb-3">
        <p className="text-[11px] text-ink-muted">
          {detail.themePath.join(" › ")} {detail.themePath.length ? "›" : ""} {detail.objective}
        </p>
        <h1 className="mt-1 text-[16px] font-semibold">
          <RichText text={detail.name} />
          {/* One of several under one name, so the heading says which one
              rather than leaving three pages that read identically. */}
          {detail.siblings.length > 0 && (
            <span className="font-normal text-ink-muted"> — {detail.measuredAs}</span>
          )}{" "}
          <span className="text-[12px] font-normal text-ink-faint">{detail.code}</span>
        </h1>
        {detail.siblings.length > 0 && (
          <p className="mt-1 text-[11px] text-ink-muted">
            The same measure is also held to{" "}
            {detail.siblings.map((sibling, index) => (
              <span key={sibling.id}>
                {index > 0 && (index === detail.siblings.length - 1 ? " and " : ", ")}
                <Link href={`/control-item/${sibling.id}`} className="underline">
                  {sibling.measuredAs}
                </Link>
              </span>
            ))}
            .
          </p>
        )}
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
          <Meta term="Ki" value={detail.kiCode} />
          <Meta term="Level" value={`L${detail.level}`} />
          <Meta term="Control Item" value={detail.measuredAs} />
          <Meta term="DIC" value={`${detail.dicCode} — ${detail.dicName}`} />
          <Meta term="Responsible" value={detail.responsibleUserName ?? "Not assigned"} />
          <Meta term="Unit" value={detail.unit} />
          <Meta term="Aggregation" value={detail.aggregation} />
          <Meta term="Direction" value={detail.direction.replace("_", " ").toLowerCase()} />
          <Meta term="Achievement" value={detail.achievementMethod.toLowerCase()} />
          <Meta term="Decimals" value={String(detail.decimalPlaces)} />
        </dl>
      </header>

      <section className="mt-4 overflow-x-auto border border-rule-strong bg-paper">
        <div className="flex min-w-max">
          <div
            className="shrink-0 border-r border-rule-strong bg-paper-band-strong px-2 py-1 text-[11px] font-medium"
            style={{ width: 120 }}
          >
            Sheet row
          </div>
          {columns.map((column) => {
            const cell = cellByKey.get(column.key)!;
            return (
              <div
                key={column.key}
                className={`shrink-0 border-l border-rule px-1.5 py-1 ${columnClass(column.kind)}`}
                style={{ width: columnWidth(column.kind) }}
              >
                <div className="text-right text-[10px] text-ink-muted">{column.label}</div>
                <div className="num text-[10px] text-ink-muted">
                  {formatValue(cell.target, detail.decimalPlaces)}
                </div>
                <div className="num text-[12px]">{formatValue(cell.actual, detail.decimalPlaces)}</div>
                <div className="flex items-baseline justify-end gap-1">
                  <span className="num text-[10px]" style={{ color: cell.symbolColor ?? "var(--color-ink-faint)" }}>
                    {formatAchievement(cell.achievement)}
                  </span>
                  <EvaluationSymbol
                    symbol={cell.symbol}
                    label={cell.symbolLabel}
                    color={cell.symbolColor}
                    size={12}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <nav className="mt-4 flex gap-1 border-b border-rule text-[11px]">
        {(["TREND", "CELLS", "HISTORY", "RATIONALE"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-current={tab === value}
            className={`px-3 py-1.5 ${
              tab === value ? "border-b-2 border-ink font-medium" : "text-ink-muted hover:text-ink"
            }`}
          >
            {value === "TREND"
              ? "Trend"
              : value === "CELLS"
                ? "Stored cells"
                : value === "HISTORY"
                  ? "Edit history"
                  : "Definition"}
          </button>
        ))}
      </nav>

      {tab === "TREND" && (
        <section className="mt-3 border border-rule-strong bg-paper p-3">
          <h2 className="text-[12px] font-medium">
            Monthly target against actual — every version overlaid
          </h2>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Earlier forecasts sit faint behind the resolved baseline and the actual.
          </p>
          <div className="mt-3 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={detail.trend} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="var(--color-rule)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--color-ink-muted)" }}
                  width={70}
                  tickFormatter={(value: number) => formatValue(value, detail.decimalPlaces)}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderColor: "var(--color-rule-strong)" }}
                  formatter={(value: unknown) =>
                    typeof value === "number" ? formatValue(value, detail.decimalPlaces) : EM_DASH
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {forecastCodes.map((code) => (
                  <Line
                    key={code}
                    type="monotone"
                    dataKey={code}
                    stroke="var(--color-ink-faint)"
                    strokeWidth={1}
                    dot={false}
                    connectNulls
                    opacity={0.45}
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="Baseline"
                  name="Latest forecast"
                  stroke="var(--color-ink-muted)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey={actualCode}
                  name="Actual"
                  stroke="var(--color-ink)"
                  strokeWidth={2.5}
                  dot={{ r: 2 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {tab === "CELLS" && (
        <section className="mt-3 border border-rule-strong bg-paper">
          <table className="w-full border-collapse text-[12px]">
            <thead className="bg-paper-band-strong text-[11px] text-ink-muted">
              <tr>
                <Th>Month</Th>
                <Th>Version</Th>
                <Th align="right">Value</Th>
                <Th>Formula</Th>
                <Th>Error</Th>
              </tr>
            </thead>
            <tbody>
              {detail.entries.map((entry) => (
                <tr key={`${entry.period}-${entry.versionCode}`} className="hover:bg-paper-sunken">
                  <Td>{monthLabel(entry.period)} {entry.period.slice(0, 4)}</Td>
                  <Td>{entry.versionCode}</Td>
                  <Td align="right" numeric>{formatValue(entry.value, detail.decimalPlaces)}</Td>
                  <Td>{entry.formula ? <code className="num text-[11px]">{entry.formula}</code> : EM_DASH}</Td>
                  <Td>{entry.error ? <span style={{ color: "#B3261E" }}>{entry.error}</span> : EM_DASH}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "HISTORY" && (
        <section className="mt-3 border border-rule-strong bg-paper">
          {detail.audit.length === 0 ? (
            <p className="p-4 text-[12px] text-ink-muted">
              Nothing has been edited since this Control Item was created. Seeded values carry no
              audit rows.
            </p>
          ) : (
            <table className="w-full border-collapse text-[12px]">
              <thead className="bg-paper-band-strong text-[11px] text-ink-muted">
                <tr>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>Cell</Th>
                  <Th align="right">From</Th>
                  <Th align="right">To</Th>
                  <Th>Formula</Th>
                </tr>
              </thead>
              <tbody>
                {detail.audit.map((row) => (
                  <tr key={row.id} className="hover:bg-paper-sunken">
                    <Td>{new Date(row.changedAt).toLocaleString()}</Td>
                    <Td>{row.changedBy}</Td>
                    <Td>
                      {monthLabel(row.period)} {row.period.slice(0, 4)} · {row.versionCode}
                    </Td>
                    <Td align="right" numeric>{formatValue(row.oldValue, detail.decimalPlaces)}</Td>
                    <Td align="right" numeric>{formatValue(row.newValue, detail.decimalPlaces)}</Td>
                    <Td>
                      {row.newFormula ? (
                        <code className="num text-[11px]">{row.newFormula}</code>
                      ) : row.oldFormula ? (
                        <span className="text-ink-muted">formula cleared</span>
                      ) : (
                        EM_DASH
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "RATIONALE" && (
        <section className="mt-3 border border-rule-strong bg-paper p-3">
          {/*
            The only editable thing on this page, which until now was purely a
            reading surface. It is here because this is where somebody lands
            from the sheet asking "what is this measure?", and the answer to
            that question and the answer to "why is the target this" are the
            same paragraph. The register at /rationale is the same panel over
            every measure at once, for filling the gaps in one sitting.
          */}
          <RationalePanel
            controlItemId={detail.id}
            notes={notes}
            versions={detail.versions}
            canEdit={canEdit}
            currentUserId={currentUserId}
            isSuperAdmin={isSuperAdmin}
            onChanged={() => router.refresh()}
          />
        </section>
      )}

      <p className="mt-4 text-[11px] text-ink-faint">
        <Link href="/sheet" className="hover:underline">
          ← Back to the company sheet
        </Link>
      </p>
    </div>
  );
}

function Meta({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-ink-faint">{term}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th className={`border-b border-rule-strong px-2 py-1.5 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  numeric,
}: {
  children: React.ReactNode;
  align?: "right";
  numeric?: boolean;
}) {
  return (
    <td
      className={`border-b border-rule px-2 py-1 ${align === "right" ? "text-right" : ""} ${numeric ? "num" : ""}`}
    >
      {children}
    </td>
  );
}
