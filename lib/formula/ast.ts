import type { RefToken } from "./tokenise";

export type Node =
  | { type: "Number"; value: number }
  | { type: "Reference"; ref: RefToken }
  | { type: "Unary"; operator: "+" | "-"; operand: Node }
  | { type: "Binary"; operator: "+" | "-" | "*" | "/"; left: Node; right: Node }
  | { type: "Call"; name: FunctionName; args: Node[] };

export const FUNCTIONS = ["SUM", "AVG", "MIN", "MAX"] as const;
export type FunctionName = (typeof FUNCTIONS)[number];
