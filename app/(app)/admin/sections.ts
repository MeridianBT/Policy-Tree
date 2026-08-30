/**
 * Admin, in five sections rather than one scroll.
 *
 * Eight panels on one page came to two screens of masonry, and the two-column
 * layout made the reading order zig-zag between groups with nothing to do with
 * each other: the evaluation scale, touched twice a year, sat beside the user
 * list, touched weekly, at exactly the same weight. So the page is grouped by
 * the thing being administered and shows one group at a time.
 *
 * Which section is in the URL rather than in component state, the same way the
 * sheet carries its columns and the review its month. An admin can send
 * somebody "/admin?section=people", a refresh lands where they were, and the
 * router.refresh() after every action keeps the section it was performed in.
 */
export const ADMIN_SECTIONS = [
  {
    id: "year",
    label: "Year",
    blurb:
      "Creating a Ki, locking its versions, emptying one, and starting the next year from this one.",
  },
  {
    id: "structure",
    label: "Structure",
    blurb: "The rows of the plan: built one at a time, or brought in from a workbook.",
  },
  {
    id: "organisation",
    label: "Organisation",
    blurb: "The divisions, departments and business units every measure is filed under.",
  },
  {
    id: "people",
    label: "People",
    blurb: "Who may sign in, what they may edit, and which measures they are responsible for.",
  },
  {
    id: "evaluation",
    label: "Evaluation",
    blurb: "The five bands every symbol on every screen is derived from.",
  },
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number]["id"];

export function isAdminSection(value: string | undefined): value is AdminSection {
  return ADMIN_SECTIONS.some((section) => section.id === value);
}
