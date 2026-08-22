"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { saveEntry, type SaveEntryInput, type SaveEntryResult } from "./save";

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
