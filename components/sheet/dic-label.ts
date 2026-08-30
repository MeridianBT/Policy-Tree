/**
 * How a Division or Department reads in a picker.
 *
 * Department codes carry their division: AUTO-PRD, OX-PTS, BMD-DIGA. That is
 * useful on a row, which stands alone, and repetitive in a list sitting beside
 * a Division control that has already said which division we are in - the
 * filters were printing "AUTO / AUTO-PRD — Product", naming AUTO twice under a
 * selector already reading AUTO.
 *
 * So the label carries only what the control beside it has not already said:
 *
 *   no division chosen   AUTO-PRD — Product     (the code, once)
 *   AUTO chosen          PRD — Product          (the division is on screen)
 *
 * The parent code is never printed as a separate prefix. It was there to say
 * which division a department belongs to, and the code says that already.
 *
 * The one thing this must not do is make two departments look alike. Names
 * repeat across divisions - Network Development is both AUTO-ND and PSP-ND -
 * so the code stays in the label whether or not it is shortened, and the
 * shortening only ever happens inside a single division, where the remainder
 * is unique by construction.
 *
 * Pure and free of React on purpose, so the rule can be tested directly.
 */

export interface LabelledDic {
  code: string;
  name: string;
  type: "DIVISION" | "DEPARTMENT";
  parentCode: string | null;
}

/**
 * A department code with its division stripped, when it actually carries one.
 *
 * The prefix is a naming convention, not a constraint - Admin → Departments
 * takes any code an admin types - so this checks rather than assumes, and
 * hands back the code untouched when the convention was not followed. A
 * department whose code does not start with its division's keeps every
 * character it has.
 */
export function shortDicCode(code: string, parentCode: string | null): string {
  if (!parentCode) return code;
  const prefix = `${parentCode}-`;
  if (!code.startsWith(prefix)) return code;
  const rest = code.slice(prefix.length);
  return rest.length > 0 ? rest : code;
}

/**
 * One option in a Division or Department picker.
 *
 * `withinDivision` is the code of the division already chosen elsewhere on the
 * screen, or null when the list spans all of them.
 */
export function dicOptionLabel(dic: LabelledDic, withinDivision: string | null): string {
  const code =
    dic.type === "DEPARTMENT" && withinDivision && dic.parentCode === withinDivision
      ? shortDicCode(dic.code, dic.parentCode)
      : dic.code;
  return `${code} — ${dic.name}`;
}
