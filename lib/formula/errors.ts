/** Typed formula errors. Stored against the entry and shown in the cell. */

export type FormulaErrorCode =
  | "SYNTAX"
  | "REF"
  | "DIV0"
  | "CYCLE"
  | "DEPTH"
  | "TYPE"
  | "LOCKED";

export class FormulaError extends Error {
  readonly code: FormulaErrorCode;
  /** Cells involved, for a cycle. */
  readonly cells: string[];

  constructor(code: FormulaErrorCode, message: string, cells: string[] = []) {
    super(message);
    this.name = "FormulaError";
    this.code = code;
    this.cells = cells;
  }
}
