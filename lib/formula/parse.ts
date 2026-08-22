/**
 * Recursive-descent parser.
 *
 *   expression := term (("+" | "-") term)*
 *   term       := factor (("*" | "/") factor)*
 *   factor     := ("+" | "-")* primary
 *   primary    := NUMBER | REFERENCE | call | "(" expression ")"
 *   call       := FUNCTION "(" expression ("," expression)* ")"
 *
 * Multiplication and division bind tighter than addition and subtraction;
 * parentheses override both. No dynamic code execution anywhere.
 */

import { FormulaError } from "./errors";
import { FUNCTIONS, type FunctionName, type Node } from "./ast";
import { tokenise, type Token } from "./tokenise";

export function parseFormula(source: string): Node {
  const tokens = tokenise(source);
  const parser = new Parser(tokens);
  const node = parser.parseExpression();
  parser.expect("EOF");
  return node;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  private get current(): Token {
    return this.tokens[this.index];
  }

  private advance(): Token {
    return this.tokens[this.index++];
  }

  expect(type: Token["type"]): Token {
    if (this.current.type !== type) {
      throw new FormulaError(
        "SYNTAX",
        `Expected ${describe(type)} but found ${describe(this.current.type, this.current.text)}.`,
      );
    }
    return this.advance();
  }

  parseExpression(): Node {
    let left = this.parseTerm();
    while (this.current.type === "PLUS" || this.current.type === "MINUS") {
      const operator = this.advance().type === "PLUS" ? "+" : "-";
      left = { type: "Binary", operator, left, right: this.parseTerm() };
    }
    return left;
  }

  private parseTerm(): Node {
    let left = this.parseFactor();
    while (this.current.type === "STAR" || this.current.type === "SLASH") {
      const operator = this.advance().type === "STAR" ? "*" : "/";
      left = { type: "Binary", operator, left, right: this.parseFactor() };
    }
    return left;
  }

  private parseFactor(): Node {
    if (this.current.type === "PLUS" || this.current.type === "MINUS") {
      const operator = this.advance().type === "PLUS" ? "+" : "-";
      return { type: "Unary", operator, operand: this.parseFactor() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const token = this.current;

    if (token.type === "NUMBER") {
      this.advance();
      return { type: "Number", value: token.value! };
    }

    if (token.type === "REF") {
      this.advance();
      return { type: "Reference", ref: token.ref! };
    }

    if (token.type === "LPAREN") {
      this.advance();
      const inner = this.parseExpression();
      this.expect("RPAREN");
      return inner;
    }

    if (token.type === "IDENT") {
      const name = token.text.toUpperCase();
      if (!(FUNCTIONS as readonly string[]).includes(name)) {
        throw new FormulaError(
          "SYNTAX",
          `Unknown function "${token.text}". Available: ${FUNCTIONS.join(", ")}.`,
        );
      }
      this.advance();
      this.expect("LPAREN");
      const args: Node[] = [];
      if (this.current.type !== "RPAREN") {
        args.push(this.parseExpression());
        while (this.current.type === "COMMA") {
          this.advance();
          args.push(this.parseExpression());
        }
      }
      this.expect("RPAREN");
      if (args.length === 0) {
        throw new FormulaError("SYNTAX", `${name} needs at least one argument.`);
      }
      return { type: "Call", name: name as FunctionName, args };
    }

    throw new FormulaError("SYNTAX", `Unexpected ${describe(token.type, token.text)}.`);
  }
}

function describe(type: Token["type"], text?: string): string {
  switch (type) {
    case "EOF": return "the end of the formula";
    case "NUMBER": return `number "${text}"`;
    case "IDENT": return `name "${text}"`;
    case "REF": return `reference "${text}"`;
    case "LPAREN": return '"("';
    case "RPAREN": return '")"';
    case "COMMA": return '","';
    default: return `"${text}"`;
  }
}

/** Every reference a formula makes, for dependency-graph maintenance. */
export function referencesOf(node: Node): Node[] {
  const found: Node[] = [];
  walk(node, (child) => {
    if (child.type === "Reference") found.push(child);
  });
  return found;
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  switch (node.type) {
    case "Unary":
      walk(node.operand, visit);
      break;
    case "Binary":
      walk(node.left, visit);
      walk(node.right, visit);
      break;
    case "Call":
      for (const arg of node.args) walk(arg, visit);
      break;
    default:
      break;
  }
}
