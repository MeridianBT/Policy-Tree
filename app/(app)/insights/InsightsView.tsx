/**
 * The symbol heatmap: how each Division's evaluation symbols spread across
 * the Ki, month by month.
 *
 * Every cell is a small stacked bar, one segment per band present that
 * month, width proportional to how many Control Items landed there - never
 * one collapsed "worst" or "average" symbol. The five bands are not a
 * single good-to-bad scale (see lib/calc/bands.ts: far above and far below
 * are symmetric extremes, not opposite ends of one line), so picking a
 * single representative per cell would invent a verdict the data does not
 * support. A cell with nothing keyed that month is a plain empty box, not
 * hidden - a blank month is itself worth seeing.
 */
import { buildSymbolHeatmap, divisionCodes, type HeatmapCell } from "@/lib/calc/heatmap";
import { monthLabel } from "@/lib/domain/period";
import type { SheetModel } from "@/lib/sheet/types";

export function InsightsView({
  model,
  businessUnit,
}: {
  model: SheetModel;
  businessUnit?: string | null;
}) {
  const divisions = divisionCodes(model.dics, model.rows);
  const cells = buildSymbolHeatmap(model.rows, model.dics, model.months);
  const cellFor = new Map(cells.map((cell) => [cell.divisionCode + "|" + cell.period, cell]));

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-paper">
      <div className="mx-auto max-w-5xl px-8 py-6">
        <header className="mb-4">
          <h1 className="text-[15px] font-semibold">Insights</h1>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            How each Division&apos;s evaluation symbols spread across the Ki, month by month.
            Department figures count toward their Division.
          </p>
        </header>

        {model.businessUnits.length > 1 && (
          <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="mr-1 text-ink-faint">Business unit</span>
            <BusinessUnitLink code={null} label="Every unit" active={!businessUnit} />
            {model.businessUnits.map((unit) => (
              <BusinessUnitLink
                key={unit.code}
                code={unit.code}
                label={unit.code}
                title={unit.name}
                active={businessUnit === unit.code}
              />
            ))}
          </nav>
        )}

        <Legend model={model} />

        <div className="mt-4 overflow-x-auto border border-rule-strong">
          <div
            className="grid text-[11px]"
            style={{ gridTemplateColumns: `140px repeat(${model.months.length}, minmax(64px, 1fr))` }}
          >
            <div className="border-b border-rule-strong bg-paper-band-strong px-2 py-1.5" />
            {model.months.map((period) => (
              <div
                key={period}
                className="border-b border-l border-rule-strong bg-paper-band-strong px-1 py-1.5 text-center font-medium text-ink-muted"
              >
                {monthLabel(period)}
              </div>
            ))}

            {divisions.map((division) => (
              <RowFragment key={division} division={division} model={model} cellFor={cellFor} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Plain links rather than a control with state: the filter lives in the URL so
 * a filtered view can be linked to and printed, and this page is read-only
 * everywhere else too.
 */
function BusinessUnitLink({
  code,
  label,
  title,
  active,
}: {
  code: string | null;
  label: string;
  title?: string;
  active: boolean;
}) {
  return (
    <a
      href={code ? `/insights?bu=${encodeURIComponent(code)}` : "/insights"}
      title={title}
      aria-current={active ? "page" : undefined}
      className={`rounded-sm border px-1.5 py-0.5 ${
        active
          ? "border-ink bg-paper-band-strong font-medium text-ink"
          : "border-rule text-ink-muted hover:border-rule-strong"
      }`}
    >
      {label}
    </a>
  );
}

function RowFragment({
  division,
  model,
  cellFor,
}: {
  division: string;
  model: SheetModel;
  cellFor: Map<string, HeatmapCell>;
}) {
  const dic = model.dics.find((d) => d.code === division);
  return (
    <>
      <div className="flex items-center border-b border-rule px-2 py-1 font-medium">
        {dic?.name ?? division}
      </div>
      {model.months.map((period) => {
        const cell = cellFor.get(division + "|" + period);
        return (
          <div key={period} className="border-b border-l border-rule p-1">
            <StackedBar cell={cell} bands={model.bands} />
          </div>
        );
      })}
    </>
  );
}

function StackedBar({ cell, bands }: { cell: HeatmapCell | undefined; bands: SheetModel["bands"] }) {
  if (!cell || cell.total === 0) {
    return <div className="h-4 rounded-sm border border-dashed border-rule" title="Nothing keyed this month" />;
  }
  return (
    <div
      className="flex h-4 overflow-hidden rounded-sm"
      title={bands
        .filter((band) => cell.counts[band.symbol])
        .map((band) => `${band.label}: ${cell.counts[band.symbol]}`)
        .join(" · ")}
    >
      {bands
        .filter((band) => cell.counts[band.symbol])
        .map((band) => (
          <div
            key={band.symbol}
            style={{ width: `${(cell.counts[band.symbol] / cell.total) * 100}%`, background: band.colorHex }}
          />
        ))}
    </div>
  );
}

function Legend({ model }: { model: SheetModel }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-muted">
      {model.bands.map((band) => (
        <span key={band.symbol} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: band.colorHex }} />
          {band.label}
        </span>
      ))}
    </div>
  );
}
