"use client";

import { useCallback, useState, useTransition } from "react";
import type { SheetModel } from "@/lib/sheet/types";
import { fetchSheet } from "@/lib/sheet/actions";
import { SheetScreen, LATEST_FORECAST } from "@/components/sheet/SheetScreen";

const LEVELS = [4];

export function DivisionSheet({
  initialModel,
  orgUnitIds,
  divisionCode,
  divisionName,
}: {
  initialModel: SheetModel;
  orgUnitIds: string[];
  divisionCode: string;
  divisionName: string;
}) {
  const [model, setModel] = useState(initialModel);
  const [compareModel, setCompareModel] = useState<SheetModel | null>(null);
  const [targetVersionId, setTargetVersionId] = useState(LATEST_FORECAST);
  const [compareVersionId, setCompareVersionId] = useState("");
  const [pending, startTransition] = useTransition();

  const changeTarget = useCallback(
    (value: string) => {
      setTargetVersionId(value);
      startTransition(async () => {
        setModel(
          await fetchSheet({
            levels: LEVELS,
            orgUnitIds,
            targetVersionId: value === LATEST_FORECAST ? null : value,
          }),
        );
      });
    },
    [orgUnitIds],
  );

  const changeCompare = useCallback(
    (value: string) => {
      setCompareVersionId(value);
      if (!value) {
        setCompareModel(null);
        return;
      }
      startTransition(async () => {
        setCompareModel(await fetchSheet({ levels: LEVELS, orgUnitIds, targetVersionId: value }));
      });
    },
    [orgUnitIds],
  );

  if (model.rows.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-[15px] font-semibold">
          {divisionCode} — {divisionName}
        </h1>
        <p className="mt-2 max-w-lg text-[12px] text-ink-muted">
          This division has no Level 4 Control Items in {model.kiCode}. Its company-level Control
          Items appear on the company sheet, filtered by DIC.
        </p>
      </div>
    );
  }

  return (
    <SheetScreen
      model={model}
      compareModel={compareModel}
      title={`${divisionCode} — ${divisionName}`}
      subtitle="Level 4 · each Objective ladders into a Level 1–3 Objective"
      printHref={`/print/division/${divisionCode}`}
      loading={pending}
      targetVersionId={targetVersionId}
      compareVersionId={compareVersionId}
      onTargetVersionChange={changeTarget}
      onCompareVersionChange={changeCompare}
    />
  );
}
