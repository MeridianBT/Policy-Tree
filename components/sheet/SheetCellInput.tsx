"use client";

/**
 * One keyable month on the sheet.
 *
 * Deliberately the same keyboard contract as /my-entries, because the two are
 * the same job done to different versions and a reviewer should not have to
 * learn it twice: Tab moves and saves, Enter saves and drops to the same month
 * on the next measure, Escape reverts. There are no modal dialogs and no save
 * button anywhere in this flow.
 *
 * The box is narrow, so the save state is a single character rather than a
 * word: a dot while it is in flight, a tick once it has landed, and a red
 * exclamation carrying the server's own message in its tooltip. A cell that
 * failed keeps the text that failed, so a correction starts from what was
 * typed rather than from a blank.
 */

import { useState } from "react";
import type { CellEditState } from "./entry-state";

export function SheetCellInput({
  value,
  edited,
  ariaLabel,
  onCommit,
  onEnter,
  onPasteBlock,
  registerRef,
}: {
  /** What the box should show when it is not being typed in. */
  value: string;
  edited: CellEditState | undefined;
  ariaLabel: string;
  onCommit: (raw: string) => void;
  onEnter: (raw: string) => void;
  /**
   * A multi-cell block arriving from a spreadsheet. Returns true when it took
   * the paste, so a single value can still fall through to the browser's own
   * handling and behave like typing.
   */
  onPasteBlock: (text: string) => boolean;
  registerRef: (element: HTMLInputElement | null) => void;
}) {
  /*
   * `null` means "follow the sheet". A keystroke takes the box off that leash
   * and a blur puts it back, which is what keeps a sheet reload landing
   * mid-keystroke from yanking the text out from under the typist without
   * needing an effect to copy one piece of state into another.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const status = edited?.status;

  return (
    <span className="flex w-full items-center justify-end gap-0.5">
      <input
        ref={registerRef}
        value={shown}
        aria-label={ariaLabel}
        // A month column is 74px wide, so a formula is always wider than its
        // box. Hovering has to be able to show the whole of it.
        title={edited?.error ?? (shown.startsWith("=") ? shown : undefined)}
        onFocus={(event) => event.target.select()}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text/plain");
          if (onPasteBlock(text)) event.preventDefault();
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          setDraft(null);
          onCommit(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            const raw = event.currentTarget.value;
            setDraft(null);
            onEnter(raw);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
        className={`num h-[17px] w-full min-w-0 border bg-paper px-1 text-right text-[11px] text-ink focus:border-ink focus:outline-none ${
          status === "ERROR" ? "border-[#B3261E]" : "border-rule"
        }`}
        placeholder="—"
      />
      <StatusMark status={status} error={edited?.error ?? null} />
    </span>
  );
}

/** A read-only month, so a row nobody may key keeps the grid's rhythm. */
export function SheetCellReadOnly({ value, title }: { value: string; title: string }) {
  return (
    <span
      className="num flex h-[17px] w-full items-center justify-end px-1 text-[11px] text-ink-faint"
      title={title}
    >
      {value || "—"}
    </span>
  );
}

function StatusMark({ status, error }: { status: CellEditState["status"] | undefined; error: string | null }) {
  if (!status) return <span className="w-2 shrink-0" aria-hidden />;
  if (status === "SAVING") {
    return (
      <span className="w-2 shrink-0 text-center text-[9px] text-ink-faint" title="Saving">
        ·
      </span>
    );
  }
  if (status === "ERROR") {
    return (
      <span className="w-2 shrink-0 text-center text-[9px]" style={{ color: "#B3261E" }} title={error ?? "Not saved"} role="status">
        !
      </span>
    );
  }
  return (
    <span className="w-2 shrink-0 text-center text-[9px]" style={{ color: "#2F8F5B" }} title="Saved" role="status">
      ✓
    </span>
  );
}
