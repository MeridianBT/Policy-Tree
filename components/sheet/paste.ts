/**
 * Pasting a block of figures from a spreadsheet into the entry grid.
 *
 * This exists because there is no other bulk path into targets. `copyStructure`
 * carries a new Ki's Goals, Themes, Objectives and Control Items but no values,
 * and there is no import anywhere, so planning a year meant keying every month
 * of every measure one cell at a time. Pasting a column out of the budget
 * spreadsheet somebody already has is most of an importer's value with none of
 * its file formats.
 *
 * Deliberately not a CSV parser. Excel, Numbers and Google Sheets all put plain
 * TSV on the clipboard - tabs between cells, newlines between rows - and only
 * quote a cell that itself contains a tab, a newline or a quote. A figure never
 * does. Parsing quotes here would mean guessing at a dialect to handle input
 * this feature will not receive, so a cell is exactly the text between the
 * separators and anything unparseable is refused per cell by `saveEntry`, named
 * and visible, rather than silently coerced.
 */

/** One cell of a pasted block, addressed the way the grid is. */
export interface PasteCell {
  rowId: string;
  /** The month column's period key, which is also its column key. */
  period: string;
  raw: string;
}

export interface PastePlan {
  cells: PasteCell[];
  /** Cells in the block that fell off the bottom or the right of the grid. */
  dropped: number;
}

/**
 * Split clipboard text into a rectangle of raw cell strings.
 *
 * A trailing newline is discarded rather than becoming a row of empties -
 * Excel appends one to every copy, and without this every paste would end by
 * clearing a row of cells nobody selected.
 */
export function parseClipboardGrid(text: string): string[][] {
  const trimmed = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/, "");
  if (trimmed === "") return [];
  return trimmed.split("\n").map((line) => line.split("\t"));
}

/** True when the clipboard holds a single value, which the browser can paste itself. */
export function isSingleCell(text: string): boolean {
  const grid = parseClipboardGrid(text);
  return grid.length <= 1 && (grid[0]?.length ?? 0) <= 1;
}

/**
 * Lay a parsed block over the grid, anchored at the focused cell.
 *
 * Columns advance across the month columns *currently rendered*, so a block
 * pasted while quarters are condensed lands on the months still on screen -
 * what you see is what you fill. Anything past the last row or the last month
 * is counted as dropped rather than wrapping onto the next row, because a
 * wrapped figure would be filed against a month nobody chose.
 */
export function planPaste(
  block: readonly string[][],
  anchor: { rowId: string; period: string },
  rowIds: readonly string[],
  periods: readonly string[],
): PastePlan {
  const firstRow = rowIds.indexOf(anchor.rowId);
  const firstColumn = periods.indexOf(anchor.period);
  if (firstRow === -1 || firstColumn === -1) return { cells: [], dropped: 0 };

  const cells: PasteCell[] = [];
  let dropped = 0;

  block.forEach((line, rowOffset) => {
    line.forEach((raw, columnOffset) => {
      const rowId = rowIds[firstRow + rowOffset];
      const period = periods[firstColumn + columnOffset];
      if (rowId === undefined || period === undefined) {
        dropped += 1;
        return;
      }
      cells.push({ rowId, period, raw: raw.trim() });
    });
  });

  return { cells, dropped };
}

/**
 * How many cells one paste may carry.
 *
 * Each cell is a real `saveEntry` - a permission check, a lock check, an audit
 * row and a downstream recompute - so a block is bounded rather than unbounded.
 * 500 is a comfortable year for forty measures, and well past what anyone
 * selects by hand in one go. The server enforces this too; this copy is only
 * so the refusal can be shown before the round trip.
 */
export const MAX_PASTE_CELLS = 500;
