"use client";

/**
 * The screen that decides whether the system gets used.
 *
 * Entry is keyboard-driven: tab moves between cells, the value saves on blur,
 * Enter saves and drops to the next row, Escape reverts. There are no modal
 * dialogs anywhere in this flow.
 *
 * The one screen built for a phone. A month-end reminder arrives by mail and
 * is read on a phone, so the journey from that mail to a keyed figure has to
 * work there or the reminder is just a nag. Below `sm` each measure becomes a
 * card and the page scrolls normally; from `sm` up it is the same dense table
 * as before. The sheet is deliberately not part of this - seventeen columns
 * belong on a large screen.
 *
 * Both layouts render the *same* input through `actualInput`, so there is one
 * save path, one keyboard contract and one set of states. A second input for
 * the small screen would be a second thing to keep correct.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { monthLabel } from "@/lib/domain/period";
import { formatValue, EM_DASH } from "@/lib/calc/format";
import { achievement, gap, gapSense } from "@/lib/calc/achievement";
import type { OutstandingEntry } from "@/lib/entries/query";
import { saveEntryAction } from "@/lib/entries/actions";

type SaveState = "IDLE" | "SAVING" | "SAVED" | "ERROR";

export function MyEntries({
  rows,
  kiCode,
  months,
  period,
  canEdit,
}: {
  rows: OutstandingEntry[];
  kiCode: string;
  months: string[];
  period: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((row) => [row.controlItemId, row.formula ?? formatForInput(row.value, row.decimalPlaces)]),
    ),
  );
  const [saved, setSaved] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(rows.map((row) => [row.controlItemId, row.value])),
  );
  const [states, setStates] = useState<Record<string, SaveState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const outstanding = useMemo(
    () => rows.filter((row) => saved[row.controlItemId] === null).length,
    [rows, saved],
  );

  const commit = useCallback(
    async (row: OutstandingEntry, raw: string) => {
      const unchanged =
        raw.trim() === (row.formula ?? formatForInput(saved[row.controlItemId], row.decimalPlaces)).trim();
      if (unchanged) return;

      setStates((previous) => ({ ...previous, [row.controlItemId]: "SAVING" }));
      const outcome = await saveEntryAction({
        controlItemId: row.controlItemId,
        period: row.period,
        planVersionId: row.planVersionId,
        input: raw.trim() === "" ? null : raw,
      });

      if (outcome.ok) {
        setSaved((previous) => ({ ...previous, [row.controlItemId]: outcome.value }));
        setStates((previous) => ({ ...previous, [row.controlItemId]: outcome.error ? "ERROR" : "SAVED" }));
        setErrors((previous) => ({ ...previous, [row.controlItemId]: outcome.error ?? "" }));
        // A formula elsewhere may now hold a different number.
        if (outcome.recomputed.length) router.refresh();
      } else {
        setStates((previous) => ({ ...previous, [row.controlItemId]: "ERROR" }));
        setErrors((previous) => ({ ...previous, [row.controlItemId]: outcome.message }));
      }
    },
    [router, saved],
  );

  /**
   * The editable figure. Defined once and called from both layouts.
   *
   * 16px on the card is not a style choice: iOS zooms the whole page when a
   * focused input is smaller than that, which on this screen means the field
   * you are typing into slides out from under the keyboard.
   */
  function actualInput(row: OutstandingEntry, index: number, className: string) {
    return (
      <input
        ref={(element) => {
          inputs.current[index] = element;
        }}
        value={values[row.controlItemId] ?? ""}
        disabled={!canEdit || row.locked}
        inputMode="decimal"
        aria-label={`${row.name} actual for ${monthLabel(row.period)}`}
        onChange={(event) =>
          setValues((previous) => ({ ...previous, [row.controlItemId]: event.target.value }))
        }
        onBlur={(event) => commit(row, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(row, (event.target as HTMLInputElement).value);
            inputs.current[index + 1]?.focus();
          }
          if (event.key === "Escape") {
            setValues((previous) => ({
              ...previous,
              [row.controlItemId]:
                row.formula ?? formatForInput(saved[row.controlItemId], row.decimalPlaces),
            }));
            (event.target as HTMLInputElement).blur();
          }
        }}
        className={`num border border-rule bg-paper disabled:bg-paper-sunken disabled:text-ink-faint ${className}`}
        placeholder={EM_DASH}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[15px] font-semibold">My entries</h1>
          <p className="text-[11px] text-ink-muted">
            {kiCode} · {monthLabel(period)} {period.slice(0, 4)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            Month
            <select
              value={period}
              onChange={(event) => router.push(`/my-entries?period=${event.target.value}`)}
              className="border border-rule bg-paper px-1.5 py-1 text-[11px]"
            >
              {months.map((month) => (
                <option key={month} value={month}>
                  {monthLabel(month)} {month.slice(0, 4)}
                </option>
              ))}
            </select>
          </label>

          <p
            className={`border px-2 py-1 text-[12px] ${
              outstanding > 0 ? "border-rule-strong bg-paper-band-strong" : "border-rule bg-paper"
            }`}
          >
            <span className="num font-semibold">{outstanding}</span> outstanding
            <span className="text-ink-muted"> of {rows.length}</span>
          </p>
        </div>
      </header>

      {rows.length === 0 && (
        <p className="border border-rule bg-paper p-4 text-[12px] text-ink-muted">
          Nothing is assigned to you for this month.
        </p>
      )}

      {rows.length > 0 && (
        <div className="hidden min-h-0 flex-1 overflow-auto border border-rule-strong bg-paper sm:block">
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 z-10 bg-paper-band-strong text-[11px] text-ink-muted">
              <tr>
                <th className="border-b border-rule-strong px-2 py-1.5 text-left font-medium">Control Item</th>
                <th className="border-b border-rule-strong px-2 py-1.5 text-left font-medium">Objective</th>
                <th className="border-b border-rule-strong px-2 py-1.5 text-left font-medium">Department</th>
                <th className="border-b border-rule-strong px-2 py-1.5 text-right font-medium">Target</th>
                <th className="border-b border-rule-strong px-1 py-1.5 text-left font-medium">Actual</th>
                <th className="border-b border-rule-strong px-2 py-1.5 text-right font-medium">Gap</th>
                <th className="border-b border-rule-strong px-2 py-1.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const value = saved[row.controlItemId];
                const gapValue = gap(value, row.target);
                const sense = gapSense(gapValue, row.direction);
                const state = states[row.controlItemId] ?? "IDLE";
                return (
                  <tr key={row.controlItemId} className="hover:bg-paper-sunken">
                    <td className="border-b border-rule px-2 py-1">
                      <Link href={`/control-item/${row.controlItemId}`} className="hover:underline">
                        {row.name}
                      </Link>
                      <span className="ml-1 text-[10px] text-ink-faint">{row.code}</span>
                    </td>
                    <td className="max-w-72 truncate border-b border-rule px-2 py-1 text-ink-muted" title={row.objective}>
                      {row.objective}
                    </td>
                    <td className="border-b border-rule px-2 py-1 text-[11px] text-ink-muted">{row.dicCode}</td>
                    <td className="num border-b border-rule px-2 py-1 text-ink-muted">
                      {formatValue(row.target, row.decimalPlaces)}
                    </td>
                    <td className="border-b border-rule px-1 py-0.5">
                      {actualInput(row, index, "w-28 px-1.5 py-1")}
                    </td>
                    <td
                      className="num border-b border-rule px-2 py-1"
                      style={{ color: senseColor(sense) }}
                    >
                      {gapValue === null ? EM_DASH : formatValue(gapValue, row.decimalPlaces, undefined, { signed: true })}
                    </td>
                    <td className="border-b border-rule px-2 py-1 text-[11px]">
                      <StatusCell
                        state={state}
                        error={errors[row.controlItemId]}
                        locked={row.locked}
                        empty={value === null}
                        achievement={achievement({
                          actual: value,
                          target: row.target,
                          direction: row.direction,
                          achievementMethod: "RATIO",
                        })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/*
        The same rows as the table above, laid out for a thumb. Everything the
        table puts in seven columns is here in three lines, in the order
        somebody keying actually needs it: what the measure is, what was asked
        for, and the box.
      */}
      {rows.length > 0 && (
        <div className="flex flex-col gap-2 sm:hidden">
          {rows.map((row, index) => {
            const value = saved[row.controlItemId];
            const gapValue = gap(value, row.target);
            const sense = gapSense(gapValue, row.direction);
            const state = states[row.controlItemId] ?? "IDLE";
            return (
              <div key={row.controlItemId} className="border border-rule-strong bg-paper p-3">
                <Link
                  href={`/control-item/${row.controlItemId}`}
                  className="block text-[14px] font-medium hover:underline"
                >
                  {row.name}
                </Link>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  {row.code} · {row.dicCode}
                </p>
                <p className="mt-1 text-[12px] text-ink-muted">{row.objective}</p>

                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="text-[11px] text-ink-muted">
                    <div className="uppercase tracking-wide text-ink-faint">Target</div>
                    <div className="num text-[15px] text-ink">
                      {formatValue(row.target, row.decimalPlaces)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-right text-[11px] uppercase tracking-wide text-ink-faint">
                      Actual
                    </div>
                    {/*
                      44px and 16px are both stated in pixels rather than rem
                      utilities: this project sets a smaller root font size, so
                      `h-11` lands at 36px - under the comfortable touch target
                      - and a sub-16px input makes iOS zoom the page on focus.
                    */}
                    {actualInput(row, index, "mt-0.5 min-h-[44px] w-full px-2 text-right text-[16px]")}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-[12px]">
                  <span className="num" style={{ color: senseColor(sense) }}>
                    {gapValue === null
                      ? EM_DASH
                      : `${formatValue(gapValue, row.decimalPlaces, undefined, { signed: true })} gap`}
                  </span>
                  <StatusCell
                    state={state}
                    error={errors[row.controlItemId]}
                    locked={row.locked}
                    empty={value === null}
                    achievement={achievement({
                      actual: value,
                      target: row.target,
                      direction: row.direction,
                      achievementMethod: "RATIO",
                    })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Keyboard shortcuts are a desktop affordance; on a phone they are
          instructions for hardware nobody has to hand. */}
      <p className="hidden text-[11px] text-ink-faint sm:block">
        Tab moves between cells and saves. Enter saves and moves down. Escape reverts. A value
        beginning with <code className="num">=</code> is treated as a formula.
      </p>
    </div>
  );
}

function StatusCell({
  state,
  error,
  locked,
  empty,
}: {
  state: SaveState;
  error?: string;
  locked: boolean;
  empty: boolean;
  achievement: number | null;
}) {
  if (locked) return <span className="text-ink-faint">Locked</span>;
  if (state === "SAVING") return <span className="text-ink-muted">Saving…</span>;
  if (state === "ERROR") return <span style={{ color: "#B3261E" }}>{error || "Could not save"}</span>;
  if (state === "SAVED") return <span style={{ color: "#2F8F5B" }}>Saved</span>;
  if (empty) return <span className="text-ink-faint">Outstanding</span>;
  return <span className="text-ink-faint">Entered</span>;
}

function senseColor(sense: ReturnType<typeof gapSense>): string | undefined {
  if (sense === "FAVOURABLE") return "#2F8F5B";
  if (sense === "UNFAVOURABLE") return "#B3261E";
  return undefined;
}

function formatForInput(value: number | null, decimalPlaces: number): string {
  if (value === null || value === undefined) return "";
  return value.toFixed(decimalPlaces);
}
