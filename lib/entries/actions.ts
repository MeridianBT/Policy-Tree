"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { saveEntry, type SaveEntryInput, type SaveEntryResult } from "./save";
import { MAX_PASTE_CELLS } from "@/components/sheet/paste";

export type SaveOutcome =
  | ({ ok: true } & SaveEntryResult)
  | { ok: false; message: string };

export async function saveEntryAction(input: SaveEntryInput): Promise<SaveOutcome> {
  try {
    const user = await requireSession();
    const result = await saveEntry(user, input);
    revalidatePath("/sheet");
    revalidatePath("/my-entries");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save that." };
  }
}

/** One cell's fate in a pasted block, addressed the way the caller sent it. */
export type BulkOutcome =
  | { index: number; ok: true; value: number | null; error: string | null }
  | { index: number; ok: false; message: string };

/**
 * A pasted block of figures.
 *
 * Every cell still goes through `saveEntry`, one at a time and in order, so
 * the permission check, the refusal on a locked version, the audit row and the
 * downstream recompute all apply exactly as they do to a cell keyed by hand.
 * The only thing this adds is a single round trip instead of one per cell -
 * pasting a year for forty measures is 480 writes, and 480 separate requests
 * would be both slow and a needless way to half-apply a paste if the tab were
 * closed midway.
 *
 * One cell's refusal never aborts the rest. A block that crosses a measure
 * somebody else owns should file everything it may and report what it could
 * not, rather than failing whole and leaving the reader to find the one row
 * that stopped it.
 */
export async function saveEntriesAction(inputs: SaveEntryInput[]): Promise<BulkOutcome[]> {
  const user = await requireSession();

  // Re-checked here rather than trusted from the client: this is the bound on
  // how much work one request can ask for.
  if (inputs.length > MAX_PASTE_CELLS) {
    return inputs.map((_, index) => ({
      index,
      ok: false as const,
      message: `A paste is limited to ${MAX_PASTE_CELLS} cells at a time.`,
    }));
  }

  const outcomes: BulkOutcome[] = [];
  for (const [index, input] of inputs.entries()) {
    try {
      const result = await saveEntry(user, input);
      outcomes.push({ index, ok: true, value: result.value, error: result.error });
    } catch (error) {
      outcomes.push({
        index,
        ok: false,
        message: error instanceof Error ? error.message : "Could not save that.",
      });
    }
  }

  revalidatePath("/sheet");
  revalidatePath("/my-entries");
  return outcomes;
}
