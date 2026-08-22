/**
 * Evaluating a parsed formula.
 *
 * The evaluator does not know about the database. It reads cells through a
 * `CellResolver`, which is what makes the whole engine unit-testable without a
 * Postgres round trip and what lets a locked version be served from its frozen
 * values.
 *
 * Value model:
 *   - a scalar reference to a cell with no value is `null`, not zero
 *   - arithmetic involving `null` yields `null`, so a missing upstream number
 *     never silently becomes a zero in a total
 *   - SUM/AVG/MIN/MAX skip `null`s, matching the roll-up rule elsewhere
 *   - division by zero is a typed DIV0 error, never Infinity
 */

import { FormulaError } from "./errors";
import type { FunctionName, Node } from "./ast";
import { periodRange, type PeriodKey } from "@/lib/domain/period";
import type { RefToken } from "./tokenise";

/** The cell a formula lives in; supplies the defaults for partial references. */
export interface CellContext {
  controlItemCode: string;
  period: PeriodKey;
  versionCode: string;
}

export interface ResolvedRef {
  controlItemCode: string;
  period: PeriodKey;
  versionCode: string;
}

export interface CellResolver {
  /**
   * The value of one cell. Throw a FormulaError("REF") when the Control Item
   * code or version code does not exist; return null when the cell simply has
   * no value.
   */
  read(ref: ResolvedRef): number | null;
}

export type EvalValue = number | null | Array<number | null>;

export function evaluate(node: Node, context: CellContext, resolver: CellResolver): number | null {
  const result = evaluateNode(node, context, resolver);
  if (Array.isArray(result)) {
    throw new FormulaError(
      "TYPE",
      "A range can only be used inside SUM, AVG, MIN or MAX. Address a single month instead.",
    );
  }
  return result;
}

function evaluateNode(node: Node, context: CellContext, resolver: CellResolver): EvalValue {
  switch (node.type) {
    case "Number":
      return node.value;

    case "Reference": {
      const refs = resolveRefs(node.ref, context);
      const values = refs.map((ref) => resolver.read(ref));
      return refs.length === 1 ? values[0] : values;
    }

    case "Unary": {
      const operand = requireScalar(evaluateNode(node.operand, context, resolver));
      if (operand === null) return null;
      return node.operator === "-" ? -operand : operand;
    }

    case "Binary": {
      const left = requireScalar(evaluateNode(node.left, context, resolver));
      const right = requireScalar(evaluateNode(node.right, context, resolver));
      if (left === null || right === null) return null;
      switch (node.operator) {
        case "+": return left + right;
        case "-": return left - right;
        case "*": return left * right;
        case "/":
          if (right === 0) {
            throw new FormulaError("DIV0", "This formula divides by zero.");
          }
          return left / right;
      }
      break;
    }

    case "Call": {
      const values: Array<number | null> = [];
      for (const arg of node.args) {
        const value = evaluateNode(arg, context, resolver);
        if (Array.isArray(value)) values.push(...value);
        else values.push(value);
      }
      return applyFunction(node.name, values.filter((value): value is number => value !== null));
    }
  }
  throw new FormulaError("SYNTAX", "Could not evaluate this formula.");
}

function applyFunction(name: FunctionName, values: number[]): number | null {
  if (values.length === 0) return null;
  switch (name) {
    case "SUM": return values.reduce((total, value) => total + value, 0);
    case "AVG": return values.reduce((total, value) => total + value, 0) / values.length;
    case "MIN": return Math.min(...values);
    case "MAX": return Math.max(...values);
  }
}

function requireScalar(value: EvalValue): number | null {
  if (Array.isArray(value)) {
    throw new FormulaError(
      "TYPE",
      "A range can only be used inside SUM, AVG, MIN or MAX. Address a single month instead.",
    );
  }
  return value;
}

/** Expand a reference token into the concrete cells it addresses. */
export function resolveRefs(ref: RefToken, context: CellContext): ResolvedRef[] {
  const controlItemCode = ref.controlItemCode || context.controlItemCode;
  const versionCode = ref.versionCode ?? context.versionCode;
  const periods =
    ref.periodFrom === ref.periodTo
      ? [ref.periodFrom]
      : periodRange(ref.periodFrom, ref.periodTo);

  if (periods.length === 0) {
    throw new FormulaError(
      "REF",
      `The range [${ref.periodFrom}:${ref.periodTo}] runs backwards.`,
    );
  }

  return periods.map((period) => ({ controlItemCode, period, versionCode }));
}

/** A stable, human-readable address, used in cycle messages. */
export function cellAddress(ref: ResolvedRef): string {
  return `[CI:${ref.controlItemCode}][${ref.period}][${ref.versionCode}]`;
}
