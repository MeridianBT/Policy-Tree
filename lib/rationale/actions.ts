"use server";

/**
 * Writing down why a measure means what it means, and why its target is that
 * number.
 *
 * Two actions, because there are only two things that can happen: a note is
 * written, or a note is withdrawn. Nothing is ever updated. A revised
 * definition is a new DEFINITION note and the newest one wins; a revised
 * rationale is a new entry in the log, which is what makes the log a history of
 * the argument rather than its latest position.
 *
 * One action serves both kinds rather than a `saveDefinition` and an
 * `addRationale`, for the reason InlineMeasureForm gives for serving both add
 * and edit: they are the same decision - who may write against this measure -
 * and a second path would be a second place for that decision to drift.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canEditControlItem, canEditInKi, requireSession } from "@/lib/auth/session";
import { loadNotes } from "./query";
import type { NoteRow } from "./notes";

export type NoteResult = { ok: true; message: string; id?: string } | { ok: false; message: string };

class NotPermitted extends Error {}

function fail(error: unknown): NoteResult {
  if (error instanceof NotPermitted) {
    return { ok: false, message: error.message || "You do not have permission to do that." };
  }
  if (error instanceof z.ZodError) {
    return { ok: false, message: error.issues[0]?.message ?? "That input is not valid." };
  }
  return { ok: false, message: error instanceof Error ? error.message : "That did not work." };
}

function revalidate() {
  revalidatePath("/rationale");
  revalidatePath("/control-item", "layout");
}

const addNoteSchema = z.object({
  controlItemId: z.string().min(1),
  kind: z.enum(["DEFINITION", "RATIONALE"]),
  body: z
    .string()
    .trim()
    .min(1, "Write something, or leave what is there as it is.")
    .max(
      2000,
      "Keep it under 2000 characters. The register is read at a glance, and the argument this " +
        "settles fits in a paragraph - anything longer belongs in a document this can point at.",
    ),
  /**
   * The version this reasoning explains. Null is a real answer rather than a
   * missing one: a definition is never about a version, and a rationale is
   * sometimes general rather than tied to one forecast.
   */
  planVersionId: z.string().min(1).nullable().default(null),
});

/**
 * Write a note against a measure.
 *
 * Deliberately *not* checked against `PlanVersion.lockedAt`. The lock exists so
 * a closed figure cannot be rewritten - "a closed version is the record of what
 * was committed" - and a note is not a figure. Writing down after the fact why
 * OB was set the way it was is precisely what this table is for, and refusing
 * it would leave the years that matter most as the ones nothing can be said
 * about. renameNode and reorderRow pass through on locked versions for the same
 * reason.
 *
 * The year is a different matter and is checked: a prior Ki stays closed to
 * everyone but a super admin, like every other write.
 */
export async function addNote(input: unknown): Promise<NoteResult> {
  try {
    const user = await requireSession();
    const data = addNoteSchema.parse(input);

    const item = await prisma.controlItem.findUnique({
      where: { id: data.controlItemId },
      select: { id: true, node: { select: { kiId: true } } },
    });
    if (!item) return { ok: false, message: "That measure no longer exists." };

    if (!(await canEditControlItem(user, item.id))) {
      throw new NotPermitted(
        "You can only write against measures you are responsible for, or whose department is " +
          "your own.",
      );
    }
    if (!(await canEditInKi(user, item.node.kiId))) {
      throw new NotPermitted("That year is closed. Only a super admin can change it.");
    }

    // A version from another year would put a rationale beside targets it was
    // never about. Checked here rather than trusted, because the id arrives
    // from a form.
    if (data.planVersionId) {
      const version = await prisma.planVersion.findFirst({
        where: { id: data.planVersionId, kiId: item.node.kiId },
        select: { id: true },
      });
      if (!version) return { ok: false, message: "That version is not part of this year." };
    }

    const created = await prisma.controlItemNote.create({
      data: {
        controlItemId: item.id,
        kind: data.kind,
        body: data.body,
        // A definition is about the measure, not about any one set of targets.
        planVersionId: data.kind === "DEFINITION" ? null : data.planVersionId,
        authorId: user.id,
      },
      select: { id: true },
    });

    revalidate();
    return {
      ok: true,
      id: created.id,
      message: data.kind === "DEFINITION" ? "Definition recorded." : "Rationale recorded.",
    };
  } catch (error) {
    return fail(error);
  }
}

const withdrawNoteSchema = z.object({ noteId: z.string().min(1) });

/**
 * Take a note back.
 *
 * Not a delete. The row stays and the screen says who withdrew it, because the
 * table is the record of an argument and a record with silent holes in it is
 * not one. What withdrawal is actually for is the note typed against the wrong
 * measure - without it people write cautiously, which is worse than an
 * occasional struck-through line.
 *
 * The author may withdraw their own; a super admin may withdraw any. Being
 * able to edit the *measure* is not enough: taking back somebody else's stated
 * reasoning is a different act from correcting a figure.
 */
export async function withdrawNote(input: unknown): Promise<NoteResult> {
  try {
    const user = await requireSession();
    const { noteId } = withdrawNoteSchema.parse(input);

    const note = await prisma.controlItemNote.findUnique({
      where: { id: noteId },
      select: {
        id: true,
        authorId: true,
        retractedAt: true,
        controlItem: { select: { node: { select: { kiId: true } } } },
      },
    });
    if (!note) return { ok: false, message: "That note no longer exists." };
    if (note.retractedAt) return { ok: false, message: "That note has already been withdrawn." };

    if (user.role !== "SUPER_ADMIN" && note.authorId !== user.id) {
      throw new NotPermitted(
        "Only the person who wrote a note can withdraw it. Add your own saying why you disagree.",
      );
    }
    if (!(await canEditInKi(user, note.controlItem.node.kiId))) {
      throw new NotPermitted("That year is closed. Only a super admin can change it.");
    }

    await prisma.controlItemNote.update({
      where: { id: note.id },
      data: { retractedAt: new Date(), retractedById: user.id },
    });

    revalidate();
    return { ok: true, message: "Note withdrawn." };
  } catch (error) {
    return fail(error);
  }
}

/**
 * This measure's notes, re-read after a write.
 *
 * The register refreshes one measure rather than reloading a page carrying
 * ninety of them and their whole plan. `revalidatePath` above still fires, so a
 * navigation back to the page is current either way; this is what keeps the
 * reader's place in the list they are working down.
 *
 * Read-only, and guarded like the page it serves: any signed-in user may read
 * any measure's notes, which is the same rule the Control Item detail page has
 * always followed.
 */
export async function loadNotesFor(controlItemId: string): Promise<NoteRow[]> {
  await requireSession();
  const byItem = await loadNotes([controlItemId]);
  return byItem.get(controlItemId) ?? [];
}
