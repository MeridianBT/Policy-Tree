"use client";

/**
 * Uploading a workbook.
 *
 * Two clicks, never one. Preview writes nothing and says exactly what would
 * happen - how many figures, what would be created, what is refused and why -
 * and only then is Apply offered. A file can bring hundreds of rows into the
 * plan at once, and the difference between a good upload and a bad one is
 * usually one stale column that a summary makes obvious and a spinner does not.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";
import { applyImport, previewImport, type ImportOutcome } from "@/lib/import/actions";

interface KiOption {
  id: string;
  code: string;
  isCurrent: boolean;
  versions: Array<{ id: string; code: string; isActual: boolean; lockedAt: string | null }>;
}

const REFUSAL_HEADINGS: Record<string, string> = {
  UNKNOWN_CODE: "No measure with that code",
  OUTSIDE_KI: "Not a month of this Ki",
  WOULD_MOVE: "Would move the measure",
  INCOMPLETE_NEW_ROW: "Not enough to create a measure",
  LEVEL_4_NEEDS_THE_SHEET: "Level 4 branches start on the sheet",
  UNKNOWN_DIC: "No such department",
  UNKNOWN_BUSINESS_UNIT: "No such business unit",
  UNKNOWN_SETTING: "Unit, roll-up or direction not recognised",
};

export function ImportPanel({ kis }: { kis: KiOption[] }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [applied, setApplied] = useState(false);
  const [kiId, setKiId] = useState(kis.find((ki) => ki.isCurrent)?.id ?? kis[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  const ki = kis.find((candidate) => candidate.id === kiId);
  // Locked versions are read-only for every role including this one, so
  // offering them would only produce a file's worth of refusals.
  const versions = (ki?.versions ?? []).filter((version) => !version.isActual && !version.lockedAt);

  function submit(action: typeof previewImport, isApply: boolean) {
    const element = form.current;
    if (!element) return;
    const data = new FormData(element);
    startTransition(async () => {
      const result = await action(null, data);
      setOutcome(result);
      setApplied(isApply);
      if (isApply && result.ok) router.refresh();
    });
  }

  const plan = outcome?.plan;
  const hasWork = Boolean(plan && (plan.figures.length || plan.measures.length || plan.nodes.length));

  return (
    <form ref={form} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-[9px] uppercase tracking-wide text-ink-faint">
          Workbook
          <input
            name="file"
            type="file"
            accept=".xlsx"
            onChange={() => {
              setOutcome(null);
              setApplied(false);
            }}
            className="border border-rule bg-paper px-1.5 py-1 text-[11px]"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[9px] uppercase tracking-wide text-ink-faint">
          Into Ki
          <select
            name="kiId"
            value={kiId}
            onChange={(event) => setKiId(event.target.value)}
            className="border border-rule bg-paper px-1.5 py-1 text-[11px]"
          >
            {kis.map((option) => (
              <option key={option.id} value={option.id}>
                {option.code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[9px] uppercase tracking-wide text-ink-faint">
          Target column writes to
          <select name="targetVersionId" className="border border-rule bg-paper px-1.5 py-1 text-[11px]">
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 pb-1 text-[11px] text-ink-muted">
          <input name="allowCreate" type="checkbox" /> let this file add new rows to the plan
        </label>
        {/*
          Beside the Ki picker rather than in the help text, and carrying that
          picker's own choice: a template for one year uploaded into another is
          the mismatch the two-step preview exists to catch, and the shortest
          way not to hand somebody the makings of it is to download the file
          for the year they have already chosen.
        */}
        <a
          href={`/api/template?ki=${encodeURIComponent(kiId)}`}
          className="rounded-sm border border-rule bg-paper px-2 py-1 text-[11px] text-ink hover:bg-paper-sunken"
        >
          Download template
        </a>
        <Button type="button" onClick={() => submit(previewImport, false)}>
          {pending ? "Reading…" : "Preview"}
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!hasWork || applied || pending}
          onClick={() => submit(applyImport, true)}
        >
          Apply
        </Button>
      </div>

      <p className="text-[11px] text-ink-faint">
        <strong>Download template</strong> gives you a workbook for the Ki above, carrying only the
        columns this reads — pre-filled with that year&rsquo;s measures when it has any, and empty
        with the headings and dropdowns when it does not. Its Reference sheet says which columns a
        new measure needs. The Data tab of an <strong>Export to Excel</strong> uploads too. The
        Actual column always writes to the actuals version. Empty cells are left alone, never
        cleared.
      </p>

      {outcome && (
        <div className="border border-rule bg-paper-sunken px-3 py-2 text-[11px]">
          <p className={outcome.ok ? "font-medium" : "font-medium text-ink"}>
            {applied ? "" : "Nothing has been written. "}
            {outcome.message}
            {outcome.versionCode ? ` · targets on ${outcome.versionCode}` : ""}
          </p>

          {outcome.basisWarning && (
            <p className="mt-1 text-ink">⚠ {outcome.basisWarning}</p>
          )}

          {plan && plan.nodes.length > 0 && (
            <Detail title={`${plan.nodes.length} new rows in the structure`}>
              {plan.nodes.map((node) => (
                <li key={node.key}>
                  {node.kind.toLowerCase()}: {node.statement}
                </li>
              ))}
            </Detail>
          )}

          {plan && plan.measures.length > 0 && (
            <Detail title={`${plan.measures.length} new measures`}>
              {plan.measures.map((measure) => (
                <li key={measure.key}>
                  {measure.name} — {measure.measuredAs || measure.unit.toLowerCase()} ({measure.dicCode})
                </li>
              ))}
            </Detail>
          )}

          {plan && plan.refusals.length > 0 && <Refusals plan={plan} />}

          {plan && plan.notes.length > 0 && (
            <Detail title={`${plan.notes.length} differences left alone`}>
              {plan.notes.map((note, index) => (
                <li key={index}>
                  row {note.row} · {note.code}: {note.note}
                </li>
              ))}
            </Detail>
          )}

          {outcome.applied && outcome.applied.failures.length > 0 && (
            <Detail title={`${outcome.applied.failures.length} could not be applied`}>
              {outcome.applied.failures.map((failure, index) => (
                <li key={index}>
                  {failure.row ? `row ${failure.row}: ` : ""}
                  {failure.message}
                </li>
              ))}
            </Detail>
          )}

          {outcome.problems && outcome.problems.length > 0 && (
            <Detail title={`${outcome.problems.length} rows could not be read`}>
              {outcome.problems.map((problem, index) => (
                <li key={index}>
                  row {problem.row}: {problem.reason}
                </li>
              ))}
            </Detail>
          )}

          {outcome.skippedNonMonth ? (
            <p className="mt-1 text-ink-faint">
              {outcome.skippedNonMonth} quarter and Ki-total rows ignored — those are rolled up from
              the months, so there is nothing behind them to write into.
            </p>
          ) : null}
        </div>
      )}
    </form>
  );
}

/** Long lists collapse: the summary is the point, the detail is on demand. */
function Detail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-ink-muted">{title}</summary>
      <ul className="ml-4 mt-0.5 list-disc space-y-0.5 text-ink-muted">{children}</ul>
    </details>
  );
}

function Refusals({ plan }: { plan: NonNullable<ImportOutcome["plan"]> }) {
  const byReason = new Map<string, typeof plan.refusals>();
  for (const refusal of plan.refusals) {
    const group = byReason.get(refusal.reason) ?? [];
    group.push(refusal);
    byReason.set(refusal.reason, group);
  }
  return (
    <>
      {[...byReason.entries()].map(([reason, group]) => (
        <Detail key={reason} title={`${group.length} refused — ${REFUSAL_HEADINGS[reason] ?? reason}`}>
          {group.slice(0, 50).map((refusal, index) => (
            <li key={index}>
              row {refusal.row}
              {refusal.code ? ` · ${refusal.code}` : ""}: {refusal.detail}
            </li>
          ))}
          {group.length > 50 && <li>…and {group.length - 50} more.</li>}
        </Detail>
      ))}
    </>
  );
}
