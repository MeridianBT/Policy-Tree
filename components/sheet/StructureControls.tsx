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

import { useMemo, useState, useTransition } from "react";
import { Check, GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import type { DeletionImpact, StructureResult } from "@/lib/structure/actions";
import { shortDicCode } from "./dic-label";

export interface DicOption {
  id: string;
  code: string;
  name: string;
  type: "DIVISION" | "DEPARTMENT";
  parentCode: string | null;
}

const ICON_BUTTON =
  "flex size-5 shrink-0 items-center justify-center rounded-sm text-ink-faint hover:bg-rule hover:text-ink";

export function RowActions({
  canAddChild,
  childLabel,
  canAddDepartment,
  canAddMeasure,
  canAddControlItem,
  canRename,
  renameLabel = "Rename",
  canDelete,
  onAddChild,
  onAddDepartment,
  onAddMeasure,
  onAddControlItem,
  onRename,
  onDelete,
}: {
  canAddChild: boolean;
  childLabel: string;
  /** Level 2/3 Objective rows only: start a Level 4 branch here. */
  canAddDepartment?: boolean;
  canAddMeasure: boolean;
  /** Measure rows only: add another Control Item under the same name. */
  canAddControlItem?: boolean;
  canRename: boolean;
  /** A group row is renamed; a measure opens its whole form. */
  renameLabel?: string;
  canDelete: boolean;
  onAddChild: () => void;
  onAddDepartment?: () => void;
  onAddMeasure: () => void;
  onAddControlItem?: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  if (
    !canAddChild &&
    !canAddDepartment &&
    !canAddMeasure &&
    !canAddControlItem &&
    !canRename &&
    !canDelete
  ) {
    return null;
  }
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {canAddChild && (
        <button type="button" className={ICON_BUTTON} onClick={onAddChild} title={`Add ${childLabel.toLowerCase()}`}>
          <Plus size={12} />
        </button>
      )}
      {canAddDepartment && (
        <button
          type="button"
          className={`${ICON_BUTTON} text-[8px] font-medium`}
          onClick={onAddDepartment}
          title="Add department branch (Level 4)"
        >
          L4+
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
      {canAddControlItem && (
        <button
          type="button"
          className={`${ICON_BUTTON} text-[9px] font-medium`}
          onClick={onAddControlItem}
          title="Add another Control Item to this measure"
        >
          CI+
        </button>
      )}
      {canRename && (
        <button type="button" className={ICON_BUTTON} onClick={onRename} title={renameLabel}>
          <Pencil size={11} />
        </button>
      )}
      {canDelete && (
        <button type="button" className={ICON_BUTTON} onClick={onDelete} title="Delete">
          <Trash2 size={11} />
        </button>
      )}
    </span>
  );
}

/**
 * The grip a row is dragged by.
 *
 * Only the grip is draggable, not the whole row: the row carries a link to the
 * Control Item detail screen and inline text, and making either of those a
 * drag source means every attempt to click through or select a name starts a
 * drag instead. A grip is also the only honest way to say a row is movable at
 * all - nothing else on the row looks any different.
 */
export function DragHandle({
  label,
  onDragStart,
  onDragEnd,
}: {
  label: string;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <span
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      role="button"
      aria-label={label}
      title={label}
      className={`${ICON_BUTTON} cursor-grab active:cursor-grabbing`}
    >
      <GripVertical size={11} />
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
 * A new Level 4 branch: which org unit it belongs to, plus its statement.
 * This is the one form an OWNER can open on a company-wide Level 2 or 3
 * Objective - the org unit picker is what the server actually scopes, and
 * `dics` here has already been narrowed to what the signed-in user may choose.
 */
export function InlineAddDepartment({
  indent,
  dics,
  onCommit,
  onCancel,
  pending,
}: {
  indent: number;
  dics: DicOption[];
  onCommit: (values: { orgUnitId: string; statement: string }) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [orgUnitId, setOrgUnitId] = useState(dics[0]?.id ?? "");
  const [statement, setStatement] = useState("");

  return (
    <div
      className="flex flex-wrap items-end gap-2 border-b border-rule bg-paper-sunken py-2 pr-3"
      style={{ paddingLeft: indent }}
    >
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-faint">Add department</span>
      <Labelled label="Division / department">
        <select
          value={orgUnitId}
          onChange={(event) => setOrgUnitId(event.target.value)}
          className="border border-rule bg-paper px-1.5 py-1 text-[11px]"
        >
          {dics.map((dic) => (
            <option key={dic.id} value={dic.id}>
              {dic.code} · {dic.name}
            </option>
          ))}
        </select>
      </Labelled>
      <Labelled label="Statement">
        <input
          autoFocus
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          placeholder="What this division/department is deploying here"
          className="w-72 border border-rule bg-paper px-1.5 py-1 text-[11px]"
          onKeyDown={(event) => {
            if (event.key === "Enter" && statement.trim() && orgUnitId) {
              onCommit({ orgUnitId, statement: statement.trim() });
            }
            if (event.key === "Escape") onCancel();
          }}
        />
      </Labelled>
      <button
        type="button"
        disabled={!statement.trim() || !orgUnitId || pending}
        onClick={() => onCommit({ orgUnitId, statement: statement.trim() })}
        className="rounded-sm bg-ink px-2.5 py-1 text-[11px] text-paper disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add"}
      </button>
      <button type="button" onClick={onCancel} className="px-2 py-1 text-[11px] text-ink-muted underline">
        Cancel
      </button>
    </div>
  );
}

/** The value standing for "leave this measure filed where it already is". */
const CURRENT = "__current__";

interface DivisionOption {
  code: string;
  name: string;
  /** Null when the division itself is out of this user's reach. */
  id: string | null;
}

/**
 * The divisions to offer, from the flat org-unit list the sheet already
 * carries.
 *
 * The second loop is the case worth naming: an OWNER scoped to a single
 * department gets that department in `dics` but not its division, and a
 * Division select that showed nothing above their own department would read as
 * though the department belonged to no division at all. The parent is listed
 * from its code, with no id - it is there to be read, not to be filed to.
 */
function divisionsFrom(dics: DicOption[]): DivisionOption[] {
  const byCode = new Map<string, DivisionOption>();
  for (const dic of dics) {
    if (dic.type === "DIVISION") byCode.set(dic.code, { code: dic.code, name: dic.name, id: dic.id });
  }
  for (const dic of dics) {
    if (dic.type !== "DEPARTMENT" || !dic.parentCode) continue;
    if (!byCode.has(dic.parentCode)) {
      byCode.set(dic.parentCode, { code: dic.parentCode, name: dic.parentCode, id: null });
    }
  }
  return [...byCode.values()];
}

function divisionCodeOf(dic: DicOption | null, divisions: DivisionOption[]): string {
  if (!dic) return divisions[0]?.code ?? "";
  return dic.type === "DIVISION" ? dic.code : dic.parentCode ?? "";
}

function firstDepartmentIn(dics: DicOption[], divisionCode: string): string {
  const first = dics.find((dic) => dic.type === "DEPARTMENT" && dic.parentCode === divisionCode);
  return first?.id ?? "";
}

/**
 * The compact form for a new Control Item. Only the fields that cannot be
 * derived are asked for; `achievement_method` follows from the direction and
 * the code is generated from the name.
 */
export interface UserOption {
  id: string;
  name: string;
  orgUnitCode: string | null;
}

export interface MeasureValues {
  name: string;
  measuredAs: string;
  unit: string;
  direction: string;
  aggregation: string;
  decimalPlaces: number;
  dicOrgUnitId: string;
  businessUnitId: string;
  /** Who keys the number. Null means nobody in particular - the org unit answers. */
  responsibleUserId: string | null;
}

/**
 * The measure form, used both to add one and to edit one in place.
 *
 * One component for both because they are the same eight decisions, and a
 * second form would be a second place for the two to drift apart - which on
 * this screen would mean an edit that silently could not express something the
 * add form could.
 */
export function InlineMeasureForm({
  indent,
  level,
  fixedMeasureName,
  dics,
  businessUnits,
  users,
  initial,
  submitLabel = "Add measure",
  pendingLabel = "Adding…",
  onCommit,
  onCancel,
  pending,
}: {
  indent: number;
  /**
   * The measure's own level, which decides whether a Department is asked for
   * at all. Levels 1-3 are company measures and are filed to a Division;
   * only Level 4 lives inside a Department. The server draws the same line at
   * lib/structure/actions.ts, where a Level 4 add is scope-checked against the
   * chosen org unit and a company-level one against the role.
   */
  level: number;
  /**
   * The Measure's name when it is not this form's to change: adding a second
   * Control Item to a measure, or editing one that is not the measure's first.
   * A measure is named once, so the field is shown as text rather than offered
   * twice - and the two rows cannot drift apart by being edited separately.
   */
  fixedMeasureName?: string;
  dics: DicOption[];
  businessUnits: Array<{ id: string; code: string; name: string }>;
  /** People this user may hand the measure to, scoped server-side. */
  users: UserOption[];
  /** Absent when adding; the measure as it stands when editing. */
  initial?: MeasureValues;
  submitLabel?: string;
  pendingLabel?: string;
  onCommit: (values: MeasureValues) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [name, setName] = useState(fixedMeasureName ?? initial?.name ?? "");
  const [measuredAs, setMeasuredAs] = useState(initial?.measuredAs ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "COUNT");
  const [direction, setDirection] = useState(initial?.direction ?? "HIGHER_BETTER");
  const [aggregation, setAggregation] = useState(initial?.aggregation ?? "SUM");
  const [decimalPlaces, setDecimalPlaces] = useState(initial?.decimalPlaces ?? 0);
  const [businessUnitId, setBusinessUnit] = useState(
    initial?.businessUnitId ?? businessUnits[0]?.id ?? "",
  );
  const [responsibleUserId, setResponsible] = useState(initial?.responsibleUserId ?? "");

  /*
    Where the measure is filed, asked for the way the cascade reads:
    business unit, then division, then - at Level 4 only - the department
    inside it. One field still leaves this form, `dicOrgUnitId`, because one
    field is what the server stores: the department when there is one, the
    division when there is not.
  */
  const divisions = useMemo(() => divisionsFrom(dics), [dics]);
  const initialDic = initial ? dics.find((dic) => dic.id === initial.dicOrgUnitId) ?? null : null;
  /**
   * A measure already filed somewhere this user cannot reach. Its org unit is
   * kept and shown as `current` rather than quietly re-filed to whatever
   * happens to be first in their own list - the server would allow that move
   * only if they had authority at both ends, but the form must not propose it.
   */
  const keptDic = Boolean(initial) && initialDic === null;

  const [divisionCode, setDivisionCode] = useState(() => {
    if (keptDic) return CURRENT;
    if (initialDic) return initialDic.type === "DIVISION" ? initialDic.code : initialDic.parentCode ?? "";
    return divisions[0]?.code ?? "";
  });
  const [departmentId, setDepartment] = useState(() =>
    initialDic?.type === "DEPARTMENT"
      ? initialDic.id
      : firstDepartmentIn(dics, divisionCodeOf(initialDic, divisions)),
  );

  const departments = useMemo(
    () => dics.filter((dic) => dic.type === "DEPARTMENT" && dic.parentCode === divisionCode),
    [dics, divisionCode],
  );
  const showDepartment = level === 4 && !keptDic;
  /**
   * Whether "division level" is a filing this user could actually make. A
   * division that is in the list only as a department's parent has no id to
   * store, so offering it would put a choice in front of somebody that could
   * only ever leave Save greyed out.
   */
  const divisionIsFilable = Boolean(divisions.find((division) => division.code === divisionCode)?.id);

  function chooseDivision(code: string) {
    setDivisionCode(code);
    // The department that was selected belongs to the division being left, so
    // it cannot survive the change. Land on the first one inside the new
    // division rather than on nothing, which is what the single flat list did.
    setDepartment(firstDepartmentIn(dics, code));
  }

  const dicOrgUnitId = keptDic
    ? initial?.dicOrgUnitId ?? ""
    : showDepartment && departmentId
      ? departmentId
      : divisions.find((division) => division.code === divisionCode)?.id ?? "";

  const field = "border border-rule bg-paper px-1.5 py-1 text-[11px]";

  return (
    <div
      className="flex flex-wrap items-end gap-2 border-b border-rule bg-paper-sunken py-2 pr-3"
      style={{ paddingLeft: indent }}
    >
      <Labelled label="Measure">
        {fixedMeasureName ? (
          <span
            className="flex h-[26px] w-52 items-center truncate px-1.5 text-[11px] text-ink-muted"
            title="Named once, on the measure. Edit it from the measure's own row."
          >
            {fixedMeasureName}
          </span>
        ) : (
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Vehicle sales volume"
            className={`${field} w-52`}
          />
        )}
      </Labelled>
      <Labelled label="Control Item">
        <input
          autoFocus={Boolean(fixedMeasureName)}
          value={measuredAs}
          onChange={(event) => setMeasuredAs(event.target.value)}
          placeholder="Units sold"
          className={`${field} w-44`}
        />
      </Labelled>
      {/* Business unit, then Division, then Department: the cascade in the
          order it is read on the sheet. */}
      <Labelled label="Business unit">
        <select
          value={businessUnitId}
          onChange={(e) => setBusinessUnit(e.target.value)}
          className={field}
        >
          {businessUnits.map((businessUnit) => (
            <option key={businessUnit.id} value={businessUnit.id}>
              {businessUnit.code}
            </option>
          ))}
        </select>
      </Labelled>
      <Labelled label="Division">
        <select value={divisionCode} onChange={(e) => chooseDivision(e.target.value)} className={field}>
          {keptDic && <option value={CURRENT}>current</option>}
          {divisions.map((division) => (
            <option key={division.code} value={division.code}>{division.code}</option>
          ))}
        </select>
      </Labelled>
      {/* Levels 1-3 are company measures, filed to a Division and to nothing
          narrower, so the field is not asked for there at all. */}
      {showDepartment && (
        <Labelled label="Department">
          <select
            value={departmentId}
            onChange={(e) => setDepartment(e.target.value)}
            className={field}
          >
            {divisionIsFilable && <option value="">— division level —</option>}
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {shortDicCode(department.code, department.parentCode)}
              </option>
            ))}
          </select>
        </Labelled>
      )}
      <Labelled label="Responsible">
        {/* Optional on purpose: the Department is the accountability, and
            this names the individual inside it who keys the number. Naming
            somebody narrows the month-end reminder to them. */}
        <select
          value={responsibleUserId}
          onChange={(e) => setResponsible(e.target.value)}
          className={`${field} w-40`}
        >
          <option value="">— nobody —</option>
          {/* The current holder is listed even when outside this user's own
              scope, so an edit can never silently unassign someone they
              cannot see. */}
          {initial?.responsibleUserId &&
            !users.some((person) => person.id === initial.responsibleUserId) && (
              <option value={initial.responsibleUserId}>current</option>
            )}
          {users.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
              {person.orgUnitCode ? ` · ${person.orgUnitCode}` : ""}
            </option>
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
        disabled={!name.trim() || !dicOrgUnitId || !businessUnitId || pending}
        onClick={() =>
          onCommit({
            name: name.trim(),
            measuredAs: measuredAs.trim(),
            unit,
            direction,
            aggregation,
            decimalPlaces,
            dicOrgUnitId,
            businessUnitId,
            responsibleUserId: responsibleUserId || null,
          })
        }
        className="rounded-sm bg-ink px-2.5 py-1 text-[11px] text-paper disabled:opacity-50"
      >
        {pending ? pendingLabel : submitLabel}
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
