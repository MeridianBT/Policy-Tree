"use client";

/** The one interactive element on the slide route, hidden on paper. */
export function SlideChrome() {
  return (
    <div className="no-print flex flex-wrap items-center gap-3 border-b border-rule bg-paper-sunken px-3 py-2 text-[11px]">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-sm bg-ink px-2.5 py-1 text-paper"
      >
        Print
      </button>
      <span className="text-ink-muted">
        Sized to a PowerPoint slide (13.33in × 7.5in). In the print dialog choose{" "}
        <strong>Save as PDF</strong>, set the paper size to match, and enable background graphics so
        the evaluation symbols keep their colour. Drop the PDF straight onto a slide.
      </span>
    </div>
  );
}
