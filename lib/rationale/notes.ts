/**
 * Reading a measure's notes: which one is the definition, what the rationale
 * log says, and how much of the plan has either.
 *
 * Pure, and in its own module for the reason components/sheet/filters.ts gives:
 * these are rules worth testing directly, and a .tsx file cannot be imported by
 * the test runner.
 *
 * The one rule everything here follows from is that the table is append-only.
 * There is no "current definition" column to read - the current definition is
 * whichever DEFINITION note was written last and has not been withdrawn, and
 * every earlier one is what the measure used to say. That is the whole reason
 * the record is worth anything in an argument, so it is worth the ten lines
 * below rather than a column that can be overwritten.
 */

import { plainText } from "@/lib/text/emphasis";

export type NoteKind = "DEFINITION" | "RATIONALE";

/** One note, as every screen reads it. */
export interface NoteRow {
  id: string;
  controlItemId: string;
  kind: NoteKind;
  body: string;
  /** The version this rationale explains; null on a definition. */
  versionCode: string | null;
  /** For the withdraw check: only the author or a super admin may take one back. */
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  /** Set when it has been withdrawn, which hides it without removing it. */
  retractedAt: string | null;
  retractedByName: string | null;
}

/** Notes for one measure, newest first, as `loadNotes` returns them. */
export type NotesByItem = ReadonlyMap<string, readonly NoteRow[]>;

const live = (note: NoteRow) => note.retractedAt === null;

/**
 * The definition as it stands, or null when none has been written.
 *
 * Newest wins. A withdrawn note is not the definition even when it is the most
 * recent, which is what makes withdrawal useful: a definition typed against the
 * wrong measure is taken back by withdrawing it, and the one before it stands
 * again rather than the measure being left with nothing.
 */
export function latestDefinition(notes: readonly NoteRow[]): NoteRow | null {
  return notes.find((note) => note.kind === "DEFINITION" && live(note)) ?? null;
}

/**
 * What the definition used to say, newest first.
 *
 * Withdrawn notes are left out here rather than shown struck through: this list
 * sits behind a disclosure nobody opens often, and a withdrawn definition is
 * something its author has said was wrong. The row survives in the database
 * either way, which is what the append-only rule is actually for.
 */
export function earlierDefinitions(notes: readonly NoteRow[]): NoteRow[] {
  const definitions = notes.filter((note) => note.kind === "DEFINITION" && live(note));
  return definitions.slice(1);
}

/** The target rationale, newest first. Withdrawn entries are left out. */
export function rationaleLog(notes: readonly NoteRow[]): NoteRow[] {
  return notes.filter((note) => note.kind === "RATIONALE" && live(note));
}

export interface Completeness {
  measures: number;
  withDefinition: number;
  withRationale: number;
  /** Measures carrying neither, which is what the "Nothing recorded" filter keeps. */
  withNeither: number;
}

/**
 * How much of the plan has been written down.
 *
 * Stated at the top of the register because the gap is the point of the page,
 * the same argument the cascade makes for printing a line under an objective
 * nothing ladders into. A count nobody is forced to move is a better prompt
 * than a mandatory field, which produces "n/a" ninety times.
 */
export function completeness(
  controlItemIds: readonly string[],
  notesByItem: NotesByItem,
): Completeness {
  let withDefinition = 0;
  let withRationale = 0;
  let withNeither = 0;

  for (const id of controlItemIds) {
    const notes = notesByItem.get(id) ?? [];
    const definition = latestDefinition(notes) !== null;
    const rationale = rationaleLog(notes).length > 0;
    if (definition) withDefinition++;
    if (rationale) withRationale++;
    if (!definition && !rationale) withNeither++;
  }

  return { measures: controlItemIds.length, withDefinition, withRationale, withNeither };
}

/** Whether a measure has nothing written against it at all. */
export function hasNothingRecorded(notes: readonly NoteRow[]): boolean {
  return latestDefinition(notes) === null && rationaleLog(notes).length === 0;
}

/**
 * Whether anything written about a measure contains the needle.
 *
 * Emphasis markers are stripped first, so searching for "capacity" finds
 * "**capacity** model" - the same rule the sheet's own search follows, and the
 * reason lib/text/emphasis.ts is the single source for it.
 *
 * Withdrawn notes do not match. Searching is how somebody finds the reasoning
 * they are going to quote, and a hit on a note its author has taken back would
 * be worse than no hit.
 */
export function matchesNoteText(notes: readonly NoteRow[], needle: string): boolean {
  const wanted = needle.trim().toLowerCase();
  if (!wanted) return false;
  return notes.some((note) => live(note) && plainText(note.body).toLowerCase().includes(wanted));
}
