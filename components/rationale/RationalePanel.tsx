"use client";

/**
 * A measure's definition and its target rationale, read and written in one
 * place.
 *
 * One component for the register and for the Control Item detail page, the
 * same argument InlineMeasureForm makes for serving both add and edit: they
 * are the same two questions, and a second component would be a second place
 * for them to drift apart.
 *
 * Both halves are written inline - a textarea opening where the text will sit,
 * never a modal. That is the rule the entry screen and the sheet's structure
 * editing already follow, and it matters more here than there: a modal over a
 * list of ninety measures loses your place in the list you were working down.
 */

import { useState, useTransition } from "react";
import { RichText } from "@/components/ui/RichText";
import { addNote, withdrawNote, type NoteResult } from "@/lib/rationale/actions";
import {
  earlierDefinitions,
  latestDefinition,
  rationaleLog,
  type NoteRow,
} from "@/lib/rationale/notes";
import type { VersionSpec } from "@/lib/calc/types";

export function RationalePanel({
  controlItemId,
  notes,
  versions,
  canEdit,
  currentUserId,
  isSuperAdmin,
  onChanged,
}: {
  controlItemId: string;
  /** Every note for this measure, newest first, withdrawn ones included. */
  notes: readonly NoteRow[];
  /** This Ki's versions, for tagging a rationale with the one it explains. */
  versions: VersionSpec[];
  canEdit: boolean;
  currentUserId: string | null;
  /** Withdrawal is the author's or a super admin's; editing the measure is not enough. */
  isSuperAdmin: boolean;
  onChanged: () => void;
}) {
  const [editingDefinition, setEditingDefinition] = useState(false);
  const [addingRationale, setAddingRationale] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const definition = latestDefinition(notes);
  const earlier = earlierDefinitions(notes);
  const log = rationaleLog(notes);

  function run(action: () => Promise<NoteResult>, done: () => void) {
    setProblem(null);
    startTransition(async () => {
      const outcome = await action();
      if (outcome.ok) {
        done();
        onChanged();
      } else {
        setProblem(outcome.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 text-[12px]">
      {problem && (
        <p role="status" className="border px-2 py-1 text-[11px]" style={{ borderColor: "#B3261E", color: "#B3261E" }}>
          {problem}
        </p>
      )}

      {/* ------------------------------------------------------- Definition */}
      <section className="grid gap-1 sm:grid-cols-[110px_1fr]">
        <h3 className="text-[11px] text-ink-muted">Definition</h3>
        <div className="flex flex-col gap-1">
          {editingDefinition ? (
            <NoteForm
              initial={definition?.body ?? ""}
              placeholder="What exactly is counted, and where the figure comes from. Anything the number could be argued about: what is included, what is excluded, which report it is pulled from and when."
              submitLabel={definition ? "Save definition" : "Record definition"}
              pending={pending}
              onCancel={() => setEditingDefinition(false)}
              onSubmit={(body) =>
                run(() => addNote({ controlItemId, kind: "DEFINITION", body, planVersionId: null }), () =>
                  setEditingDefinition(false),
                )
              }
            />
          ) : definition ? (
            <>
              <p className="whitespace-pre-wrap">
                <RichText text={definition.body} />
              </p>
              <Attribution note={definition} />
            </>
          ) : (
            <p className="text-ink-faint">Not recorded.</p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            {canEdit && !editingDefinition && (
              <button type="button" className="text-ink-muted underline" onClick={() => setEditingDefinition(true)}>
                {definition ? "Edit" : "Record a definition"}
              </button>
            )}
            {earlier.length > 0 && !editingDefinition && (
              <button type="button" className="text-ink-faint underline" onClick={() => setShowEarlier(!showEarlier)}>
                {showEarlier ? "Hide" : `${earlier.length} earlier version${earlier.length === 1 ? "" : "s"}`}
              </button>
            )}
          </div>

          {/*
            What it used to say. Kept behind a disclosure rather than shown:
            it is read once, in the argument that made somebody open it, and
            printing every revision inline would bury the definition that
            actually stands.
          */}
          {showEarlier && (
            <ol className="flex flex-col gap-2 border-l border-rule pl-3">
              {earlier.map((note) => (
                <li key={note.id} className="flex flex-col gap-0.5">
                  <p className="whitespace-pre-wrap text-ink-muted">
                    <RichText text={note.body} />
                  </p>
                  <Attribution note={note} />
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------- Rationale */}
      <section className="grid gap-1 sm:grid-cols-[110px_1fr]">
        <h3 className="text-[11px] text-ink-muted">Target rationale</h3>
        <div className="flex flex-col gap-2">
          {log.length === 0 && !addingRationale && <p className="text-ink-faint">Not recorded.</p>}

          <ol className="flex flex-col gap-2">
            {log.map((note) => (
              <li key={note.id} className="flex flex-col gap-0.5">
                <Attribution note={note} />
                <p className="whitespace-pre-wrap">
                  <RichText text={note.body} />
                </p>
                {canWithdraw(note, currentUserId, isSuperAdmin) && (
                  <Withdraw
                    pending={pending}
                    onConfirm={() => run(() => withdrawNote({ noteId: note.id }), () => undefined)}
                  />
                )}
              </li>
            ))}
          </ol>

          {addingRationale ? (
            <NoteForm
              initial=""
              placeholder="Why the target is this number. What it was derived from, and what it assumes - the assumption is what a forecast conversation needs three months later."
              submitLabel="Record rationale"
              pending={pending}
              versions={versions}
              onCancel={() => setAddingRationale(false)}
              onSubmit={(body, planVersionId) =>
                run(() => addNote({ controlItemId, kind: "RATIONALE", body, planVersionId }), () =>
                  setAddingRationale(false),
                )
              }
            />
          ) : (
            canEdit && (
              <button
                type="button"
                className="self-start text-[11px] text-ink-muted underline"
                onClick={() => setAddingRationale(true)}
              >
                Add a note
              </button>
            )
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * Who wrote it, when, and against which version.
 *
 * The version code is the part that does the work: "1,240 because of the
 * capacity model" means something different written at OB than written at
 * 2QFC, and without it the log is a pile of undated opinions.
 */
function Attribution({ note }: { note: NoteRow }) {
  const when = new Date(note.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <p className="text-[10px] text-ink-faint">
      {note.authorName ?? "Unknown"} · {when}
      {note.versionCode && ` · ${note.versionCode}`}
      {note.retractedAt && ` · withdrawn by ${note.retractedByName ?? "unknown"}`}
    </p>
  );
}

function canWithdraw(note: NoteRow, currentUserId: string | null, isSuperAdmin: boolean): boolean {
  if (note.retractedAt) return false;
  if (isSuperAdmin) return true;
  return currentUserId !== null && note.authorId === currentUserId;
}

/** Two clicks, inline, in the style DeleteConfirm sets. No modal. */
function Withdraw({ pending, onConfirm }: { pending: boolean; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        type="button"
        className="self-start text-[10px] text-ink-faint underline"
        onClick={() => setAsking(true)}
      >
        Withdraw
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-[10px]">
      <span className="text-ink-muted">It stays on the record, marked as withdrawn by you.</span>
      <button type="button" disabled={pending} onClick={onConfirm} className="underline disabled:opacity-50" style={{ color: "#B3261E" }}>
        {pending ? "Withdrawing…" : "Withdraw it"}
      </button>
      <button type="button" onClick={() => setAsking(false)} className="text-ink-muted underline">
        Keep it
      </button>
    </span>
  );
}

/**
 * One textarea, and a version picker when there is a version to pick.
 *
 * Cmd/Ctrl+Enter saves. Plain Enter does not: this is a paragraph, and the
 * single most annoying thing a note field can do is submit halfway through
 * one.
 */
function NoteForm({
  initial,
  placeholder,
  submitLabel,
  pending,
  versions,
  onSubmit,
  onCancel,
}: {
  initial: string;
  placeholder: string;
  submitLabel: string;
  pending: boolean;
  versions?: VersionSpec[];
  onSubmit: (body: string, planVersionId: string | null) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initial);
  /*
   * Defaults to the latest forecast rather than the first version, because
   * that is the one being argued about at the moment somebody writes. "Not
   * tied to a version" stays available above it - some reasoning is about the
   * measure in general and pinning it to a quarter would be a small lie.
   */
  const forecasts = (versions ?? []).filter((version) => !version.isActual);
  const [planVersionId, setPlanVersionId] = useState(
    forecasts.length ? forecasts[forecasts.length - 1].id : "",
  );

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        autoFocus
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && body.trim()) {
            onSubmit(body, planVersionId || null);
          }
          if (event.key === "Escape") onCancel();
        }}
        rows={4}
        placeholder={placeholder}
        className="w-full resize-y border border-rule bg-paper px-2 py-1.5 text-[12px] leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-2">
        {forecasts.length > 0 && (
          <label className="flex items-center gap-1 text-[11px] text-ink-muted">
            Explains
            <select
              value={planVersionId}
              onChange={(event) => setPlanVersionId(event.target.value)}
              className="border border-rule bg-paper px-1 py-0.5 text-[11px]"
            >
              <option value="">Not tied to a version</option>
              {forecasts.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.code}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          disabled={pending || !body.trim()}
          onClick={() => onSubmit(body, planVersionId || null)}
          className="rounded-sm bg-ink px-2.5 py-1 text-[11px] text-paper disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm border border-rule px-2.5 py-1 text-[11px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
