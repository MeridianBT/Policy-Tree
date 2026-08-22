"use client";

/**
 * Inline structure editing on the sheet.
 *
 * The affordances appear only in edit mode, and only for an ADMIN — and the
 * server checks the role again on every call, because a hidden button is a
 * courtesy and not a control.
 *
 * Nothing here asks for a level or a kind: the server derives both from the
 * parent, so a Goal offers "Add theme", a Theme offers "Add objective" and an
 * Objective offers "Add theme" or "Add measure". That is the whole point of the
 * screen — the admin structure builder could already do this, tediously.
 */

import { useState, useTransition } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { DeletionImpact, StructureResult } from "@/lib/structure/actions";

export interface DicOption {
  id: string;
  code: string;
  name: string;
}

const ICON_BUTTON =
  "flex size-5 shrink-0 items-center justify-center rounded-sm text-ink-faint hover:bg-rule hover:text-ink";

export function RowActions({
  canAddChild,
  childLabel,
  canAddMeasure,
  onAddChild,
  onAddMeasure,
  onRename,
  onDelete,
}: {
  canAddChild: boolean;
  childLabel: string;
  canAddMeasure: boolean;
  onAddChild: () => void;
  onAddMeasure: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {canAddChild && (
        <button type="button" className={ICON_BUTTON} onClick={onAddChild} title={`Add ${childLabel.toLowerCase()}`}>
          <Plus size={12} />
        </button>
      )}
      {canAddMeasure && (
        <button
          type="button"
          className={`${ICON_BUTTON} text-[9px] font-medium`}
          onClick={onAddMeasure}
          title="Add measure"
        >
          M+
        </button>
      )}
      <button type="button" className={ICON_BUTTON} onClick={onRename} title="Rename">
        <Pencil size={11} />
      </button>
      <button type="button" className={ICON_BUTTON} onClick={onDelete} title="Delete">
        <Trash2 size={11} />
      </button>
    </span>
  );
}

/** In-place rename. Enter commits, Escape abandons, blur commits. */
export function InlineRename({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => (value.trim() && value !== initial ? onCommit(value.trim()) : onCancel())}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (value.trim()) onCommit(value.trim());
        }
        if (event.key === "Escape") onCancel();
      }}
      aria-label="Row statement"
      className="min-w-0 flex-1 border border-ink bg-paper px-1 py-0.5 text-[12px]"
    />
  );
}

/** A new row being typed in place, before it exists. */
export function InlineAdd({
  label,
  indent,
  onCommit,
  onCancel,
}: {
  label: string;
  indent: number;
  onCommit: (statement: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div
      className="flex h-7 items-center gap-1.5 border-b border-rule bg-paper-sunken pr-2"
      style={{ paddingLeft: indent }}
    >
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-faint">New {label}</span>
      <input
        autoFocus
        value={value}
        placeholder={`${label} statement`}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && value.trim()) onCommit(value.trim());
          if (event.key === "Escape") onCancel();
        }}
        className="min-w-0 flex-1 border border-ink bg-paper px-1 py-0.5 text-[12px]"
      />
      <button
        type="button"
        className={ICON_BUTTON}
        disabled={!value.trim()}
        onClick={() => value.trim() && onCommit(value.trim())}
        title="Add"
      >
        <Check size={12} />
      </button>
      <button type="button" className={ICON_BUTTON} onClick={onCancel} title="Cancel">
        <X size={12} />
      </button>
    </div>
  );
}

/**
 * The compact form for a new Control Item. Only the fields that cannot be
 * derived are asked for; `achievement_method` follows from the direction and
 * the code is generated from the name.
 */
export function InlineAddMeasure({
  indent,
  dics,
  onCommit,
  onCancel,
  pending,
}: {
  indent: number;
  dics: DicOption[];
  onCommit: (values: {
    name: string;
    measuredAs: string;
    unit: string;
    direction: string;
    aggregation: string;
    decimalPlaces: number;
    dicOrgUnitId: string;
  }) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [measuredAs, setMeasuredAs] = useState("");
  const [unit, setUnit] = useState("COUNT");
  const [direction, setDirection] = useState("HIGHER_BETTER");
  const [aggregation, setAggregation] = useState("SUM");
  const [decimalPlaces, setDecimalPlaces] = useState(0);
  const [dicOrgUnitId, setDic] = useState(dics[0]?.id ?? "");

  const field = "border border-rule bg-paper px-1.5 py-1 text-[11px]";

  return (
    <div
      className="flex flex-wrap items-end gap-2 border-b border-rule bg-paper-sunken py-2 pr-3"
      style={{ paddingLeft: indent }}
    >
      <Labelled label="Measure">
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Vehicle sales volume"
          className={`${field} w-52`}
        />
      </Labelled>
      <Labelled label="Control Item">
        <input
          value={measuredAs}
          onChange={(event) => setMeasuredAs(event.target.value)}
          placeholder="Units sold"
          className={`${field} w-44`}
        />
      </Labelled>
      <Labelled label="DIC">
        <select value={dicOrgUnitId} onChange={(e) => setDic(e.target.value)} className={field}>
          {dics.map((dic) => (
            <option key={dic.id} value={dic.id}>{dic.code}</option>
          ))}
        </select>
      </Labelled>
      <Labelled label="Unit">
        <select value={unit} onChange={(e) => setUnit(e.target.value)} className={field}>
          {["COUNT", "CURRENCY", "PERCENT", "RATIO", "DAYS", "INDEX"].map((option) => (
            <option key={option} value={option}>{option.toLowerCase()}</option>
          ))}
        </select>
      </Labelled>
      <Labelled label="Roll-up">
        <select value={aggregation} onChange={(e) => setAggregation(e.target.value)} className={field}>
          <option value="SUM">sum</option>
          <option value="AVERAGE">average</option>
          <option value="LATEST">latest</option>
        </select>
      </Labelled>
      <Labelled label="Better when">
        <select value={direction} onChange={(e) => setDirection(e.target.value)} className={field}>
          <option value="HIGHER_BETTER">higher</option>
          <option value="LOWER_BETTER">lower</option>
        </select>
      </Labelled>
      <Labelled label="Decimals">
        <input
          type="number"
          min={0}
          max={4}
          value={decimalPlaces}
          onChange={(event) => setDecimalPlaces(Number(event.target.value))}
          className={`${field} w-14`}
        />
      </Labelled>

      <button
        type="button"
        disabled={!name.trim() || !dicOrgUnitId || pending}
        onClick={() =>
          onCommit({
            name: name.trim(),
            measuredAs: measuredAs.trim(),
            unit,
            direction,
            aggregation,
            decimalPlaces,
            dicOrgUnitId,
          })
        }
        className="rounded-sm bg-ink px-2.5 py-1 text-[11px] text-paper disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add measure"}
      </button>
      <button type="button" onClick={onCancel} className="px-2 py-1 text-[11px] text-ink-muted underline">
        Cancel
      </button>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-[9px] uppercase tracking-wide text-ink-faint">
      {label}
      {children}
    </label>
  );
}

/**
 * Deletion confirmation. It names exactly what will be lost, because the
 * counts are the whole basis on which someone decides.
 */
export function DeleteConfirm({
  message,
  impact,
  onConfirm,
  onCancel,
  pending,
}: {
  message: string;
  impact: DeletionImpact | null;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border border-rule-strong bg-paper px-3 py-2">
      <span className="text-[12px]" style={{ color: "#B3261E" }}>
        {message}
      </span>
      {impact && impact.entries > 0 && (
        <span className="num text-[11px] text-ink-muted">
          {impact.controlItems} measure{impact.controlItems === 1 ? "" : "s"} · {impact.entries} figures
        </span>
      )}
      <span className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="rounded-sm px-2.5 py-1 text-[11px] text-paper disabled:opacity-50"
          style={{ background: "#B3261E" }}
        >
          {pending ? "Deleting…" : "Delete anyway"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm border border-rule px-2.5 py-1 text-[11px]"
        >
          Keep it
        </button>
      </span>
    </div>
  );
}

/** Shared runner so every structure call reports the same way. */
export function useStructureAction() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<StructureResult | null>(null);

  function run(action: () => Promise<StructureResult>, onSuccess?: () => void) {
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) onSuccess?.();
    });
  }

  return { pending, result, setResult, run };
}
