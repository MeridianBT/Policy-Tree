/**
 * The month-end review, in the order a review asks its questions.
 *
 * Is the data in · what is off track and getting worse · what moved.
 *
 * What this page must not do is repeat the sheet. "Which measures are below
 * target" is one click there and is answered better, beside the numbers. What
 * the sheet cannot do is rank, and ranking is the point here: a measure at 92%
 * falling from 110% needs the meeting, and one at 92% climbing from 80% does
 * not. Every line links into the screens that already answer "and what is
 * happening about it" rather than restating them.
 *
 * No arithmetic happens in this file. Every number arrives finished from
 * lib/calc/review.
 */
import Link from "next/link";
import { EM_DASH, formatAchievement, formatValue } from "@/lib/calc/format";
import { monthLabel } from "@/lib/domain/period";
import type { OwnerGroup, Review, ReviewLine } from "@/lib/calc/review";
import type { SheetModel } from "@/lib/sheet/types";
import { EvaluationSymbol } from "@/components/sheet/EvaluationSymbol";
import { RichText } from "@/components/ui/RichText";

export function InsightsView({
  model,
  businessUnit,
  period,
  previousPeriod,
  review,
}: {
  model: SheetModel;
  businessUnit?: string | null;
  period: string;
  previousPeriod: string | null;
  review: Review;
}) {
  const { reporting, attention, attentionOverflow, attentionTotal, movers } = review;
  const complete = reporting.missing.length === 0 && reporting.expected > 0;

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-paper">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <header className="mb-4">
          <h1 className="text-[15px] font-semibold">
            Month end review — {monthLabel(period)} {period.slice(0, 4)}
          </h1>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            {previousPeriod
              ? `Movement is measured against ${monthLabel(previousPeriod)}. `
              : "The first month of the Ki, so there is no month yet to measure movement against. "}
            Department measures are reviewed beside the company&apos;s own.
          </p>
        </header>

        <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="mr-1 text-ink-faint">Month</span>
          {model.months.map((month) => (
            <FilterLink
              key={month}
              href={hrefFor(month, businessUnit)}
              label={monthLabel(month)}
              active={month === period}
            />
          ))}
        </nav>

        {model.businessUnits.length > 1 && (
          <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="mr-1 text-ink-faint">Business unit</span>
            <FilterLink href={hrefFor(period, null)} label="All" active={!businessUnit} />
            {model.businessUnits.map((unit) => (
              <FilterLink
                key={unit.code}
                href={hrefFor(period, unit.code)}
                label={unit.code}
                title={unit.name}
                active={businessUnit === unit.code}
              />
            ))}
          </nav>
        )}

        {/* 1. Is the data in? No other screen answers this: /my-entries shows
            what one person owes, and the sheet shows an em dash per cell with
            no way to count them or to see whose they are. */}
        <Section
          title="Reporting"
          summary={`${reporting.reported} of ${reporting.expected} actuals in`}
          tone={complete ? "quiet" : "loud"}
        >
          {complete ? (
            <p className="text-[11px] text-ink-muted">
              Every measure has reported {monthLabel(period)}. The review can be held on complete
              figures.
            </p>
          ) : (
            <ChaseList groups={reporting.missingByOwner} />
          )}
          {reporting.untargeted.length > 0 && (
            <p className="mt-2 text-[11px] text-ink-faint">
              {reporting.untargeted.length}{" "}
              {reporting.untargeted.length === 1 ? "measure has" : "measures have"} no target for
              this month, so there is nothing to judge them against:{" "}
              {reporting.untargeted.map((line) => line.code).join(", ")}.
            </p>
          )}
        </Section>

        {/* 2. What is off track, worst direction of travel first. */}
        <Section
          title="Needs attention"
          summary={`${attentionTotal} below target`}
          tone={attentionTotal ? "loud" : "quiet"}
        >
          {attention.length === 0 ? (
            <p className="text-[11px] text-ink-muted">
              Nothing reported for {monthLabel(period)} is below target.
            </p>
          ) : (
            <>
              <p className="mb-1.5 text-[11px] text-ink-faint">
                Worsening first, then holding, then recovering — a measure falling is the meeting&apos;s
                business whatever its level.
              </p>
              <ol className="divide-y divide-rule border-y border-rule">
                {attention.map((line) => (
                  <AttentionRow key={line.id} line={line} period={period} months={model.months} />
                ))}
              </ol>
              {attentionOverflow.count > 0 && (
                /* The cap is stated rather than silent, and it says how much of
                   what it cut is still falling - otherwise a shortlist reads as
                   the whole story. The full list belongs on the sheet, beside
                   the numbers. */
                <p className="mt-2 text-[11px] text-ink-muted">
                  {attentionOverflow.count} more below target
                  {attentionOverflow.worsening > 0 &&
                    `, ${attentionOverflow.worsening} of them still falling`}
                  .{" "}
                  <Link href="/sheet" className="underline">
                    See them all on the sheet
                  </Link>{" "}
                  with the <strong>Below target</strong> preset.
                </p>
              )}
            </>
          )}
        </Section>

        {/* 3. What moved - deliberately both sides of target. A measure
            recovering from 60% to 85% is still failing and is still the good
            news in the room. */}
        {(movers.up.length > 0 || movers.down.length > 0) && (
          <Section
            title="Movement"
            summary={`against ${monthLabel(previousPeriod ?? period)}`}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <MoverList title="Most improved" lines={movers.up} />
              <MoverList title="Biggest falls" lines={movers.down} />
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function hrefFor(period: string, businessUnit: string | null | undefined): string {
  const params = new URLSearchParams({ month: period });
  if (businessUnit) params.set("bu", businessUnit);
  return `/insights?${params.toString()}`;
}

/**
 * Plain links rather than controls with state: the whole page is read-only,
 * and a review somebody links to should open exactly as they read it.
 */
function FilterLink({
  href,
  label,
  title,
  active,
}: {
  href: string;
  label: string;
  title?: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={active ? "page" : undefined}
      className={`rounded-sm border px-1.5 py-0.5 ${
        active
          ? "border-ink bg-paper-band-strong font-medium text-ink"
          : "border-rule text-ink-muted hover:border-rule-strong"
      }`}
    >
      {label}
    </Link>
  );
}

function Section({
  title,
  summary,
  tone = "quiet",
  children,
}: {
  title: string;
  summary: string;
  tone?: "quiet" | "loud";
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 border border-rule bg-paper">
      <header className="flex items-baseline justify-between border-b border-rule bg-paper-sunken px-3 py-1.5">
        <h2 className="text-[12px] font-semibold">{title}</h2>
        <span className={`num text-[11px] ${tone === "loud" ? "text-ink" : "text-ink-muted"}`}>
          {summary}
        </span>
      </header>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  );
}

/**
 * Who to ask, and what for.
 *
 * One line per person rather than one per measure: the conversation is with a
 * person, and eighty-two measure names is a wall nobody reads. The measures
 * stay named and linked on that line, so the detail is a click away without
 * costing a row each.
 */
function ChaseList({ groups }: { groups: OwnerGroup[] }) {
  return (
    <ul className="space-y-1.5">
      {groups.map((group) => (
        <li key={(group.owner ?? "") + group.dicCode} className="text-[11px]">
          <span className="font-medium">
            {/* Named or not is the difference between a chase and a question
                about who owns it, so the line says which. */}
            {group.owner ?? `${group.dicName} — nobody named`}
          </span>{" "}
          <span className="num text-ink-muted">
            {group.owner ? `${group.dicCode} · ` : ""}
            {group.lines.length} outstanding
          </span>
          <span className="text-ink-muted">: </span>
          <span className="text-ink-muted">
            {group.lines.map((line, index) => (
              <span key={line.id}>
                {index > 0 && ", "}
                <Link href={`/control-item/${line.id}`} className="hover:underline">
                  <RichText text={line.name} />
                </Link>
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AttentionRow({
  line,
  period,
  months,
}: {
  line: ReviewLine;
  period: string;
  months: string[];
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
      <EvaluationSymbol
        symbol={line.cell.symbol}
        label={line.cell.symbolLabel}
        color={line.cell.symbolColor}
        size={14}
      />
      <Link href={`/control-item/${line.id}`} className="text-[12px] hover:underline">
        <RichText text={line.name} />
      </Link>
      <span className="num rounded-sm border border-rule px-1 text-[10px] text-ink-muted">
        {line.dicCode}
      </span>
      <span className="text-[11px] text-ink-faint">
        {line.responsibleUserName ?? "nobody named"}
      </span>

      <span className="ml-auto flex items-center gap-2">
        <Strip line={line} period={period} months={months} />
        <span
          className="num w-16 text-right text-[12px]"
          style={{ color: line.cell.symbolColor ?? undefined }}
        >
          {formatAchievement(line.cell.achievement)}
        </span>
        <Change line={line} />
      </span>
    </li>
  );
}

/**
 * The measure's own year, twelve symbols wide.
 *
 * This is what makes a division heatmap unnecessary. "It has been ■ for four
 * months" belongs on the line asking for attention, not in a separate grid
 * where it is averaged in with every other measure in the division.
 */
function Strip({ line, period, months }: { line: ReviewLine; period: string; months: string[] }) {
  const byPeriod = new Map(line.months.map((cell) => [cell.period, cell]));
  return (
    <span className="hidden items-center gap-px sm:flex" title="This measure across the Ki">
      {months.map((month) => {
        const cell = byPeriod.get(month);
        return (
          <span
            key={month}
            className={`flex size-3.5 items-center justify-center ${
              month === period ? "rounded-sm bg-paper-band-strong" : ""
            }`}
            title={`${monthLabel(month)}: ${formatAchievement(cell?.achievement ?? null)}`}
          >
            {cell?.symbol ? (
              <EvaluationSymbol
                symbol={cell.symbol}
                label={cell.symbolLabel}
                color={cell.symbolColor}
                size={9}
              />
            ) : (
              <span className="text-[9px] text-ink-faint">·</span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** How far it moved, in points of achievement rather than a percent of a percent. */
function Change({ line }: { line: ReviewLine }) {
  if (line.change === null) {
    return <span className="num w-14 text-right text-[11px] text-ink-faint">{EM_DASH}</span>;
  }
  const arrow = line.movement === "WORSENING" ? "▼" : line.movement === "RECOVERING" ? "▲" : "–";
  return (
    <span
      className="num w-14 text-right text-[11px] text-ink-muted"
      title={`${formatAchievement(line.previousAchievement)} last month`}
    >
      {arrow} {formatValue(Math.abs(line.change * 100), 1)}
    </span>
  );
}

function MoverList({ title, lines }: { title: string; lines: ReviewLine[] }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-ink-muted">{title}</p>
      {lines.length === 0 ? (
        <p className="text-[11px] text-ink-faint">Nothing moved by more than a point.</p>
      ) : (
        <ul className="space-y-0.5">
          {lines.map((line) => (
            <li key={line.id} className="flex items-baseline gap-2 text-[11px]">
              <Link href={`/control-item/${line.id}`} className="truncate hover:underline">
                <RichText text={line.name} />
              </Link>
              <span className="num ml-auto shrink-0 text-ink-muted">
                {formatAchievement(line.previousAchievement)} →{" "}
                {formatAchievement(line.cell.achievement)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
