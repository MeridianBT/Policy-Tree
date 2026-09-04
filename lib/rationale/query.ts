/**
 * Loading notes for a set of measures.
 *
 * One query for the whole register. The alternative - a query per measure, or a
 * lateral join for "the newest definition" - would be ninety round trips to
 * render a page whose whole point is that you can work down it in one sitting.
 * Everything the screen needs is decided from the rows in lib/rationale/notes.ts,
 * which is pure and testable.
 */

import { prisma } from "@/lib/db";
import type { NoteRow } from "./notes";

/**
 * Notes for these Control Items, newest first within each.
 *
 * Withdrawn notes are returned rather than filtered out here: the screen shows
 * a withdrawn rationale as withdrawn, and the definition helpers need to see it
 * to know it does not count. Filtering at the query would make "why is this not
 * showing" a question you cannot answer from the page.
 */
export async function loadNotes(controlItemIds: readonly string[]): Promise<Map<string, NoteRow[]>> {
  const byItem = new Map<string, NoteRow[]>();
  if (controlItemIds.length === 0) return byItem;

  const notes = await prisma.controlItemNote.findMany({
    where: { controlItemId: { in: [...controlItemIds] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      controlItemId: true,
      kind: true,
      body: true,
      createdAt: true,
      retractedAt: true,
      authorId: true,
      planVersion: { select: { code: true } },
      author: { select: { name: true } },
      retractedBy: { select: { name: true } },
    },
  });

  for (const note of notes) {
    const row: NoteRow = {
      id: note.id,
      controlItemId: note.controlItemId,
      kind: note.kind,
      body: note.body,
      versionCode: note.planVersion?.code ?? null,
      authorId: note.authorId,
      authorName: note.author?.name ?? null,
      // Dates cross to a client component, so they travel as ISO strings
      // rather than as Date objects the serialiser would have to guess at.
      createdAt: note.createdAt.toISOString(),
      retractedAt: note.retractedAt?.toISOString() ?? null,
      retractedByName: note.retractedBy?.name ?? null,
    };
    const existing = byItem.get(note.controlItemId);
    if (existing) existing.push(row);
    else byItem.set(note.controlItemId, [row]);
  }

  return byItem;
}
