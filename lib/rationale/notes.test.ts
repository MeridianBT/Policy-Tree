/**
 * Reading an append-only record.
 *
 * Every case here is a way "the newest one wins" could go wrong and leave a
 * measure showing a definition somebody has already taken back, or a count
 * claiming the plan is better documented than it is.
 */

import { describe, expect, it } from "vitest";
import {
  completeness,
  earlierDefinitions,
  hasNothingRecorded,
  latestDefinition,
  matchesNoteText,
  rationaleLog,
  type NoteRow,
} from "@/lib/rationale/notes";

/** Notes arrive newest first, the way `loadNotes` orders them. */
function note(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: "n1",
    controlItemId: "item-1",
    kind: "DEFINITION",
    body: "Retail units invoiced, net of cancellations.",
    versionCode: null,
    authorId: "u1",
    authorName: "J. Smith",
    createdAt: "2026-03-12T00:00:00.000Z",
    retractedAt: null,
    retractedByName: null,
    ...overrides,
  };
}

describe("which definition stands", () => {
  it("takes the newest", () => {
    const notes = [
      note({ id: "new", body: "Including fleet." }),
      note({ id: "old", body: "Excluding fleet." }),
    ];
    expect(latestDefinition(notes)?.body).toBe("Including fleet.");
  });

  /*
   * The reason withdrawal exists. A definition typed against the wrong measure
   * is taken back, and the one before it stands again rather than the measure
   * being left showing nothing.
   */
  it("skips a withdrawn one and falls back to the one before it", () => {
    const notes = [
      note({ id: "wrong", body: "Pasted onto the wrong row.", retractedAt: "2026-03-13T00:00:00.000Z" }),
      note({ id: "right", body: "Excluding fleet." }),
    ];
    expect(latestDefinition(notes)?.body).toBe("Excluding fleet.");
  });

  it("is null when nothing has been written", () => {
    expect(latestDefinition([])).toBeNull();
    expect(latestDefinition([note({ kind: "RATIONALE" })])).toBeNull();
  });

  it("counts everything before the newest as history", () => {
    const notes = [note({ id: "c" }), note({ id: "b" }), note({ id: "a" })];
    expect(earlierDefinitions(notes).map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

describe("the rationale log", () => {
  it("keeps only live rationale entries, newest first", () => {
    const notes = [
      note({ id: "r2", kind: "RATIONALE", body: "Cut to 1,180." }),
      note({ id: "gone", kind: "RATIONALE", retractedAt: "2026-08-05T00:00:00.000Z" }),
      note({ id: "r1", kind: "RATIONALE", body: "Set at 1,240." }),
      note({ id: "d1", kind: "DEFINITION" }),
    ];
    expect(rationaleLog(notes).map((entry) => entry.id)).toEqual(["r2", "r1"]);
  });
});

describe("how much of the plan is written down", () => {
  const notes = new Map<string, NoteRow[]>([
    ["both", [note({ kind: "RATIONALE" }), note()]],
    ["definition-only", [note()]],
    ["rationale-only", [note({ kind: "RATIONALE" })]],
    ["withdrawn-only", [note({ retractedAt: "2026-03-13T00:00:00.000Z" })]],
  ]);

  it("counts each kind, and the measures carrying neither", () => {
    const result = completeness(
      ["both", "definition-only", "rationale-only", "withdrawn-only", "never-touched"],
      notes,
    );
    expect(result).toEqual({
      measures: 5,
      withDefinition: 2,
      withRationale: 2,
      // A measure whose only note has been withdrawn is undocumented again,
      // which is the honest answer and the one that keeps it on the worklist.
      withNeither: 2,
    });
  });

  it("puts a measure back on the worklist when its only note is withdrawn", () => {
    expect(hasNothingRecorded(notes.get("withdrawn-only") ?? [])).toBe(true);
    expect(hasNothingRecorded(notes.get("definition-only") ?? [])).toBe(false);
  });
});

describe("finding what somebody wrote", () => {
  it("matches through emphasis markers", () => {
    // The stored text carries **bold** markers; searching for the word inside
    // them has to work, or Find disagrees with what the page shows.
    const notes = [note({ body: "The **capacity** model gives 4,700." })];
    expect(matchesNoteText(notes, "capacity model")).toBe(true);
  });

  it("ignores case and surrounding space", () => {
    expect(matchesNoteText([note({ body: "Net of cancellations." })], "  CANCELLATIONS ")).toBe(true);
  });

  it("does not match a withdrawn note", () => {
    const notes = [note({ body: "Wrong figure.", retractedAt: "2026-03-13T00:00:00.000Z" })];
    expect(matchesNoteText(notes, "wrong figure")).toBe(false);
  });

  it("an empty needle matches nothing rather than everything", () => {
    expect(matchesNoteText([note()], "   ")).toBe(false);
  });
});
