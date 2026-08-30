# Design plan — Hoshin Kanri sheet

## What this thing is

A working instrument. The user is in a quarterly review with a printed A3 in
front of them and this screen on the projector. The information density of the
sheet *is* the product. Nothing here is a marketing page; nothing gets spread
out into cards.

## Token system

Deliberately small. Anything not on this list does not exist.

### Colour

Neutrals carry the entire interface. The five evaluation symbols carry the
entire colour budget — they are the only saturated colour on the sheet, which
is what lets them be found at a glance across a full page.

| Token | Light | Use |
|---|---|---|
| `--paper` | `#FFFFFF` | Sheet ground |
| `--paper-sunken` | `#F7F7F6` | App ground behind the sheet, month cells on hover |
| `--paper-band` | `#F2F2F0` | Quarter columns |
| `--paper-band-strong` | `#E9E9E6` | Ki Total column, group header rows |
| `--ink` | `#141413` | Numbers, primary text |
| `--ink-muted` | `#57564F` | Labels, units, secondary figures |
| `--ink-faint` | `#8A887E` | Em dash, disabled, metadata |
| `--rule` | `#DFDEDA` | Ordinary grid line |
| `--rule-strong` | `#B5B3AC` | Quarter and frozen-column boundaries |
| `--focus` | `#1D4ED8` | Focus ring only. Never decoration. |

Symbol colours come from `evaluation_band.color_hex` in the database, not from
this file — an admin can retune the scale and the sheet follows.

Dark mode is out of scope: the artefact is a printed sheet and a projector.

### Emphasis in text

Statements and measure names take `**bold**` and `_italic_`, and nothing else.
Colour is not offered there on purpose: the five evaluation symbols hold the
entire colour budget above, and a coloured word on the same page competes with
them for the glance that budget exists to buy. Weight and slope survive a
projector and a photocopier, which colour does not.

### Type

| Token | Value |
|---|---|
| `--font-sans` | `ui-sans-serif, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif` |
| `--font-num` | `ui-monospace, "SF Mono", "Cascadia Mono", "Segoe UI Mono", "Roboto Mono", monospace` |
| `--font-symbol` | macOS → `Hiragino Kaku Gothic ProN`; Windows → `Yu Gothic` / `Meiryo` / `MS Gothic` / `Segoe UI Symbol`; Linux server → `Noto Sans CJK JP` / `IPAGothic` / `TakaoGothic` / `VL Gothic` |

Every numeric uses `font-variant-numeric: tabular-nums` and is right aligned, so
columns align on the decimal. `decimal_places` is respected exactly; a value
formatted to a different width would break that alignment.

`--font-symbol` exists because □ ◎ 〇 ▲ ■ are CJK-adjacent glyphs — 〇 is
U+3007 IDEOGRAPHIC NUMBER ZERO and needs a Japanese-capable face. Every symbol
is emitted with a trailing U+FE0E variation selector to force text presentation,
so no platform can substitute an emoji.

Sizes: `11px` sheet body, `12px` row labels, `13px` group headers, `15px`
symbols in cells, `22px` symbols in print. One step of scale, no more.

### Space

`4px` base. Cell padding is `2px 6px`. Row height `26px` in the default display
mode. The grid is tight on purpose.

## Layout plan

- **Frozen left column block** — two columns, both sticky, bounded on the right
  with `--rule-strong`: **Measures** carries the measure's name and its DIC
  badge, and **Control Item** carries the measurement method — what the figure
  actually counts, in the reviewer's words ("Units sold", "% of sales"). The
  two belong together and neither should scroll away from the numbers.
- **Sticky column header** — two rows: quarter spans over month labels.
- **Sticky context bar** — because rows are virtualised they are absolutely
  positioned, and a `position: sticky` group header inside a transformed
  container does not work. Rather than fake it, a single sticky bar under the
  column header names the Goal › Theme › Objective that the topmost visible row
  belongs to. It does the job a sticky header does — telling you where you are
  when you have scrolled past the heading — without lying about the mechanism.
- **Group rows** — Goal, Theme and Objective headers sit inline in the row
  stream, indented one step per level, each with a disclosure control.
- **Column groups** — quarters and the Ki total are tinted a step darker and
  bounded with `--rule-strong`. They read as summaries, not as more months.
- **Column outline** — a quarter heading is a disclosure that folds its three
  month columns away, leaving the quarter standing in for them. A condensed
  quarter takes the darker `--paper-band-strong` tint, so a column covering
  three hidden months reads differently from one sitting beside them. The
  Months/Quarters toggle drives all four at once and shows *neither* option
  selected when quarters have been folded individually — a partial state the
  control should admit to rather than round off.
- **Structure editing** — **Edit**, the pencil, is the one toggle that changes what
  the row-label column can do, not what it shows: the same statement text, now
  with a `+`, a pencil and a trash icon at its trailing edge. Nothing about the
  seventeen data columns changes, so switching modes never disturbs a reader's
  place on the sheet. A new row is typed in place, inline, at the depth it will
  occupy — never a modal, matching the entry screen's own rule.
- **Two shades of "add"** — a plain `+` continues the tree at the level the
  server derives from the parent; a second, distinct `L4+` badge sits beside it
  on a Level 2/3 Objective and means something different — start a Level 4
  branch, which needs an org unit chosen, not merely a level derived. The two
  never collapse into one control: conflating "continue the company structure"
  with "start a division's own branch" would make it too easy to create a
  Level 4 node with nobody owning it, which the server refuses outright for
  exactly that reason.
- **Row actions disappear rather than disable** — a Level 1-3 row shows no
  pencil or trash to an OWNER at all, rather than showing them greyed out.
  A row nobody present can act on some rows and not others is normal on this
  sheet (that is the whole point of scoping to a department); a disabled
  icon would read as a bug to fix, not as a boundary to respect.

## Display modes

One toggle, four densities, because a review needs different things at
different moments:

1. **Full** — target, actual, achievement %, symbol. Three lines per cell.
2. **Target / Actual** — the two numbers only.
3. **Achievement** — percentage and symbol.
4. **Symbol** — symbol only, the whole-page scan.

## Critique of this plan, before building

- *Four display modes is one too many.* Kept anyway: "Symbol" and "Full" are the
  two ends people actually asked for, and the middle two are what the sheet is
  replacing. Cheap to build, all driven off the same `SheetCell`.
- *The context bar risks being ignored.* Mitigated by making it the only
  element between the column header and the data, and giving it the same
  indent language as the group rows.
- *Colour-only meaning.* The symbols are glyphs first and coloured second; the
  glyph alone is sufficient, colour is reinforcement. Achievement percentage is
  always available as text in two of the four display modes, and each symbol
  carries its band label as an accessible name.
- *Gap colouring could reintroduce colour noise.* Gap is shown only on the
  Control Item detail screen and in the Full display mode, and uses the same
  band colours rather than a second red/green scale.
- *Density versus the accessibility floor.* 11px is small. It is paired with a
  high-contrast ink (`#141413` on white is 16.9:1) and a `26px` row target, and
  the print view scales the symbols up independently.

## Screens added after the sheet

The sheet above is the operating surface. Two later screens read the same data
without extending that grid, because both answer questions the grid answers
badly.

- **Cascade** (`/cascade`). The sheet already contains the whole Level 1–4 tree,
  but seventeen columns bury the linkage. The cascade view drops every column
  and keeps only the structure: nested rows, a connecting rule per branch, the
  DIC badge on a department row, and one small evaluation symbol per Control
  Item. Weight alone separates Goal from Theme from Objective, so no new colour
  and no new type sizes were introduced. An objective with nothing laddering
  into it prints a muted line saying so — the gap is the point of the page, and
  hiding it would defeat the reason the page exists.

- **Insights** (`/insights`). One row per division, one column per month, each
  cell a small stacked bar of symbol counts. It is the only place in the
  product where the band colours carry area rather than a glyph, which is why
  the bars are short and the legend is stated in words above them. No cell is
  ever reduced to a single representative symbol: the five bands are not one
  good-to-bad axis, so an average of them would be a number the data cannot
  support. A month with nothing keyed is a dashed outline, never an empty gap.

Both are read-only. Neither introduced a token, and neither is reachable from a
row action on the sheet — they are destinations in the nav, because they are
read at different moments than the sheet is.
