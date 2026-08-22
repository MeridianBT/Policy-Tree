"use client";

import { useCallback, useState, useTransition } from "react";
import type { SheetModel } from "@/lib/sheet/types";
import { fetchSheet } from "@/lib/sheet/actions";
import { SheetScreen, LATEST_FORECAST } from "@/components/sheet/SheetScreen";

const LEVELS = [1, 2, 3];

export function CompanySheet({ initialModel }: { initialModel: SheetModel }) {
  const [model, setModel] = useState(initialModel);
  const [compareModel, setCompareModel] = useState<SheetModel | null>(null);
  const [targetVersionId, setTargetVersionId] = useState(LATEST_FORECAST);
  const [compareVersionId, setCompareVersionId] = useState("");
  const [pending, startTransition] = useTransition();

  const changeTarget = useCallback((value: string) => {
    setTargetVersionId(value);
    startTransition(async () => {
      setModel(
        await fetchSheet({
          levels: LEVELS,
          targetVersionId: value === LATEST_FORECAST ? null : value,
        }),
      );
    });
  }, []);

  const changeCompare = useCallback((value: string) => {
    setCompareVersionId(value);
    if (!value) {
      setCompareModel(null);
      return;
    }
    startTransition(async () => {
      setCompareModel(await fetchSheet({ levels: LEVELS, targetVersionId: value }));
    });
  }, []);

  return (
    <SheetScreen
      model={model}
      compareModel={compareModel}
      title="Company sheet — Levels 1 to 3"
      subtitle="Targets resolve to the latest forecast unless a version is pinned"
      printHref="/print/company"
      loading={pending}
      targetVersionId={targetVersionId}
      compareVersionId={compareVersionId}
      onTargetVersionChange={changeTarget}
      onCompareVersionChange={changeCompare}
    />
  );
}
