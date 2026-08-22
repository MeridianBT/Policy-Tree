"use client";

/** The one interactive element on the print route, hidden on paper. */
export function PrintChrome() {
  return (
    <div className="no-print flex items-center gap-3 border-b border-rule bg-paper-sunken px-3 py-2 text-[11px]">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-sm bg-ink px-2.5 py-1 text-paper"
      >
        Print
      </button>
      <span className="text-ink-muted">
        A3 landscape. In the browser print dialog choose A3, Landscape, and enable background
        graphics so the quarter and total columns keep their tint.
      </span>
    </div>
  );
}
