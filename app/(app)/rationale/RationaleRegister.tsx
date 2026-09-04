"use client";

/**
 * The register: every measure in the plan, with what it means and why its
 * target is that number.
 *
 * The sheet answers "what is the number". This page answers the two questions
 * that get argued about instead - does "units sold" include cancellations, and
 * why is the target 1,240 rather than 1,300 - which the sheet answers badly
 * because seventeen columns of figures leave no room for a paragraph.
 *
 * It is a destination in the nav rather than a row action, for the reason the
 * cascade and insights are: it is read at a different moment. You come here
 * before the year starts to write the reasoning down, and in the middle of a
 * review when somebody disputes a definition.
 *
 * Unlike those two it is **writable**, which is a deliberate departure from
 * "both are read-only" in DESIGN.md. Filling ninety gaps through ninety round
 * trips to ninety detail pages is not a thing anybody would do, and the gaps
 * are the reason the page exists. Writing is inline, at the row, in the style
 * the sheet and the entry screen already use - there are no modals anywhere in
 * this application.
 *
 * The gap is shown as plainly as the filled row, the same way the cascade
 * prints a line under an Objective nothing ladders into, and the "Nothing
 * recorded" preset turns the page into a worklist.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MultiSelect, SearchBox, Segmented, Select } from "@/components/ui/primitives";
import { RichText } from "@/components/ui/RichText";
import { RationalePanel } from "@/components/rationale/RationalePanel";
import { dicOptionLabel } from "@/components/sheet/dic-label";
import { canEnterFigures, type EditingUser } from "@/components/sheet/permissions";
import {
  EMPTY_FILTERS,
  matchRows,
  paramsToView,
  viewToParams,
  type SheetFilters,
} from "@/components/sheet/filters";
import { groupOrdinalPrefix } from "@/components/sheet/outline";
import { completeness, hasNothingRecorded, matchesNoteText, type NoteRow } from "@/lib/rationale/notes";
import { fetchSheet } from "@/lib/sheet/actions";
import { loadNotesFor } from "@/lib/rationale/actions";
import { formatValue } from "@/lib/calc/format";
import { plainText } from "@/lib/text/emphasis";
import type { ControlItemRow, GroupRow, SheetModel } from "@/lib/sheet/types";

const COMPANY_LEVELS = [1, 2, 3];
const EXPANDED_LEVELS = [1, 2, 3, 4];

export function RationaleRegister({
  model: initialModel,
  notes: initialNotes,
  currentUser,
}: {
  model: SheetModel;
  /** Notes by control item id. A plain object because it crosses from the server. */
  notes: Record<string, NoteRow[]>;
  currentUser: EditingUser;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [model, setModel] = useState(initialModel);
  const [notes, setNotes] = useState(initialNotes);
  const [pending, startTransition] = useTransition();

  /*
   * Filters open from the URL and are pushed back to it, so a narrowed
   * register can be sent to the person who has to fill it in - "here are the
   * twelve of yours with nothing written down" is a link, not an instruction.
   * The same argument /insights and the admin sections make for their own
   * state; `paramsToView` is deliberately forgiving, so a mangled link narrows
   * rather than refuses.
   */
  const opening = useMemo(() => paramsToView(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [filters, setFilters] = useState<SheetFilters>({
    businessUnits: opening.businessUnits,
    dics: opening.dics,
    belowTarget: opening.belowTarget,
    search: opening.search,
  });
  const [divisionCode, setDivisionCode] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(searchParams.get("missing") === "1");
  const [expanded, setExpanded] = useState(opening.levels?.includes(4) ?? false);

  useEffect(() => {
    const params = viewToParams({
      ...filters,
      levels: expanded ? EXPANDED_LEVELS : COMPANY_LEVELS,
    });
    if (onlyMissing) params.set("missing", "1");
    const query = params.toString();
    router.replace(query ? `/rationale?${query}` : "/rationale", { scroll: false });
  }, [filters, expanded, onlyMissing, router]);

  const divisionOptions = useMemo(
    () => initialModel.dics.filter((dic) => dic.type === "DIVISION"),
    [initialModel.dics],
  );

  const toggleExpanded = useCallback(
    (next: boolean) => {
      if (next === expanded) return;
      setExpanded(next);
      startTransition(async () => {
        setModel(await fetchSheet({ levels: next ? EXPANDED_LEVELS : COMPANY_LEVELS, kiId: model.kiId }));
      });
    },
    [expanded, model.kiId],
  );

  /*
   * A division filters here rather than narrowing a department picker beside
   * it, exactly as on the cascade: choosing AUTO means AUTO's work, so it
   * expands to itself plus every department beneath it and goes through
   * `matchRows` unchanged.
   */
  const chooseDivision = useCallback(
    (code: string) => {
      setDivisionCode(code);
      const dics = code
        ? initialModel.dics.filter((dic) => dic.code === code || dic.parentCode === code).map((dic) => dic.code)
        : [];
      setFilters((previous) => ({ ...previous, dics }));
    },
    [initialModel.dics],
  );

  /** Re-read this measure's notes after a write, without reloading the page. */
  const refresh = useCallback((controlItemId: string) => {
    startTransition(async () => {
      const fresh = await loadNotesFor(controlItemId);
      setNotes((previous) => ({ ...previous, [controlItemId]: fresh }));
    });
  }, []);

  const statements = useMemo(() => {
    // Built from group rows only. A GroupRow id is a Node id and a
    // ControlItemRow id is a ControlItem id, and on a migrated database they
    // collide by construction - see rowKey() in lib/sheet/types.ts.
    const map = new Map<string, GroupRow>();
    for (const row of model.rows) {
      if (row.kind !== "CONTROL_ITEM") map.set(row.id, row);
    }
    return map;
  }, [model.rows]);

  /*
   * Structure first, then text.
   *
   * `matchRows` is the sheet's own filter and is used unchanged for business
   * unit, division and department, so a selection means here exactly what it
   * means there. Its search is applied here instead, over what has been
   * *written* as well as what is measured - the register exists to answer
   * "who else reasoned from the capacity model?", and that question has no
   * meaning on the sheet. Adding it to `searchable()` would make the sheet
   * match rows on text it does not show, which reads as a bug.
   */
  const rows = useMemo(() => {
    const structural = matchRows(model.rows, { ...filters, search: "" }).filter(
      (row): row is ControlItemRow => row.kind === "CONTROL_ITEM",
    );
    const needle = filters.search.trim().toLowerCase();
    const searched = needle
      ? structural.filter(
          (row) =>
            plainText(row.name).toLowerCase().includes(needle) ||
            row.measuredAs.toLowerCase().includes(needle) ||
            row.code.toLowerCase().includes(needle) ||
            row.dicCode.toLowerCase().includes(needle) ||
            matchesNoteText(notes[row.id] ?? [], needle),
        )
      : structural;
    return onlyMissing ? searched.filter((row) => hasNothingRecorded(notes[row.id] ?? [])) : searched;
  }, [model.rows, filters, notes, onlyMissing]);

  const counts = useMemo(() => {
    const visible = matchRows(model.rows, filters)
      .filter((row): row is ControlItemRow => row.kind === "CONTROL_ITEM")
      .map((row) => row.id);
    return completeness(visible, new Map(Object.entries(notes)));
  }, [model.rows, filters, notes]);

  const filtered =
    filters.businessUnits.length > 0 || divisionCode || filters.search.trim() || onlyMissing;

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-paper">
      <div className="mx-auto max-w-5xl px-8 py-6">
        <header className="mb-2">
          <h1 className="text-[15px] font-semibold">Rationale</h1>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            What each measure counts, and why its target is the number it is. {model.kiCode}.
          </p>
          <p className="num mt-1 text-[11px] text-ink-faint">
            {counts.withDefinition} of {counts.measures} defined · {counts.withRationale} with a
            rationale
            {counts.withNeither > 0 && ` · ${counts.withNeither} with nothing written down`}
          </p>
        </header>

        <div className="mb-3 flex flex-wrap items-center gap-2 border border-rule bg-paper px-2 py-1.5">
          <Segmented
            label="View"
            value={expanded ? "L4" : "L3"}
            onChange={(value) => toggleExpanded(value === "L4")}
            options={[
              { value: "L3", label: "Company", hint: "Levels 1 to 3, the company spine on its own" },
              { value: "L4", label: "+ Departments", hint: "Every Level 4 branch as well" },
            ]}
          />

          <span className="mx-1 h-4 w-px bg-rule" aria-hidden />

          {initialModel.businessUnits.length > 1 && (
            <MultiSelect
              label="Business unit"
              selected={filters.businessUnits}
              options={initialModel.businessUnits.map((unit) => ({
                value: unit.code,
                label: `${unit.code} — ${unit.name}`,
              }))}
              onChange={(businessUnits) => setFilters((previous) => ({ ...previous, businessUnits }))}
            />
          )}
          {divisionOptions.length > 1 && (
            <Select
              label="Division"
              value={divisionCode}
              options={[
                { value: "", label: "All divisions" },
                ...divisionOptions.map((dic) => ({ value: dic.code, label: dicOptionLabel(dic, null) })),
              ]}
              onChange={chooseDivision}
            />
          )}
          <SearchBox
            label="Find"
            value={filters.search}
            onChange={(search) => setFilters((previous) => ({ ...previous, search }))}
            placeholder="Measure, code, or anything written"
          />

          {/*
            The worklist. Same shape as the sheet's "Below target" preset: one
            click, and it intersects with everything else rather than replacing
            it, so "my division, nothing recorded" is two selections.
          */}
          <button
            type="button"
            onClick={() => setOnlyMissing(!onlyMissing)}
            className={`rounded-sm px-2 py-1 text-[11px] ${
              onlyMissing
                ? "bg-ink text-paper"
                : "border border-rule text-ink-muted hover:bg-paper-sunken"
            }`}
          >
            Nothing recorded
          </button>

          {filtered && (
            <button
              type="button"
              onClick={() => {
                setDivisionCode("");
                setOnlyMissing(false);
                setFilters(EMPTY_FILTERS);
              }}
              className="rounded-sm border border-rule px-2 py-1 text-[11px] text-ink-muted hover:bg-paper-sunken"
            >
              Clear filters
            </button>
          )}
          {pending && <span className="text-[11px] text-ink-faint">Loading…</span>}
        </div>

        {rows.length === 0 ? (
          <p className="border border-rule px-3 py-2 text-[12px] text-ink-muted">
            {onlyMissing
              ? "Every measure in view has something written against it."
              : "No measure matches those filters."}
          </p>
        ) : (
          <ol>
            {rows.map((row) => (
              <li key={row.id} className="border-b border-rule py-4 first:border-t">
                <MeasureHeading row={row} statements={statements} />
                <div className="mt-2 sm:pl-3">
                  <RationalePanel
                    controlItemId={row.id}
                    notes={notes[row.id] ?? []}
                    versions={model.versions}
                    canEdit={canEnterFigures(currentUser, model.dics, row)}
                    currentUserId={currentUser.id}
                    isSuperAdmin={currentUser.role === "SUPER_ADMIN"}
                    onChanged={() => refresh(row.id)}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/**
 * Where the measure sits, what it is called, and what it is being held to.
 *
 * The Ki target is here because a rationale without the number it explains is
 * half a sentence. It comes off the row's own Ki Total cell, so this page and
 * the sheet cannot disagree about what the target is, and it names the version
 * it came from for the same reason the rationale entries do.
 */
function MeasureHeading({
  row,
  statements,
}: {
  row: ControlItemRow;
  statements: Map<string, GroupRow>;
}) {
  const path = row.path
    .map((id) => statements.get(id))
    .filter((group): group is GroupRow => group !== undefined)
    .map((group) => groupOrdinalPrefix(group.ordinal) + plainText(group.statement));

  const kiCell = row.cells[row.cells.length - 1];
  const target = kiCell?.target ?? null;

  return (
    <div className="flex flex-col gap-0.5">
      {path.length > 0 && (
        <p className="text-[10px] text-ink-faint">{path.join(" › ")}</p>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 className="text-[13px] font-semibold">
          <RichText text={row.name} />
          {row.measuredAs && <span className="font-normal text-ink-muted"> — {row.measuredAs}</span>}
        </h2>
        <p className="num shrink-0 text-[11px] text-ink-muted">
          {target === null ? (
            <span className="text-ink-faint">no target</span>
          ) : (
            <>
              {formatValue(target, row.decimalPlaces, row.unit, { withUnit: true })}
              {kiCell?.targetVersionCode && ` · ${kiCell.targetVersionCode}`}
            </>
          )}
        </p>
      </div>
      <p className="text-[10px] text-ink-faint">
        {row.code} · {row.dicCode} · {row.businessUnitCode}
      </p>
    </div>
  );
}
