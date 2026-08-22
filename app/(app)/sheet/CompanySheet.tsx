"use client";

import { useCallback, useState, useTransition } from "react";
import type { SheetModel } from "@/lib/sheet/types";
import { fetchSheet } from "@/lib/sheet/actions";
import { SheetScreen, LATEST_FORECAST } from "@/components/sheet/SheetScreen";
import { Segmented } from "@/components/ui/primitives";
import type { EditingUser } from "@/components/sheet/permissions";

const COMPANY_LEVELS = [1, 2, 3];
const EXPANDED_LEVELS = [1, 2, 3, 4];

export function CompanySheet({
  initialModel,
  currentUser,
}: {
  initialModel: SheetModel;
  currentUser?: EditingUser;
}) {
  const [model, setModel] = useState(initialModel);
  const [compareModel, setCompareModel] = useState<SheetModel | null>(null);
  const [targetVersionId, setTargetVersionId] = useState(LATEST_FORECAST);
  const [compareVersionId, setCompareVersionId] = useState("");
  // Levels 1-3 is the company page proper; expanding folds every Level 4
  // department branch in directly under the Level 1-3 Objective it ladders
  // into, rather than sending the reader off to a separate division page.
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const levels = expanded ? EXPANDED_LEVELS : COMPANY_LEVELS;

  const load = useCallback(
    (nextLevels: number[], versionId: string) => {
      startTransition(async () => {
        setModel(
          await fetchSheet({
            levels: nextLevels,
            targetVersionId: versionId === LATEST_FORECAST ? null : versionId,
          }),
        );
      });
    },
    [],
  );

  /** Re-read the sheet after the structure changes under it. */
  const reload = useCallback(() => load(levels, targetVersionId), [load, levels, targetVersionId]);

  const changeTarget = useCallback(
    (value: string) => {
      setTargetVersionId(value);
      load(levels, value);
    },
    [load, levels],
  );

  const toggleExpanded = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    load(next ? EXPANDED_LEVELS : COMPANY_LEVELS, targetVersionId);
  }, [expanded, load, targetVersionId]);

  const changeCompare = useCallback(
    (value: string) => {
      setCompareVersionId(value);
      if (!value) {
        setCompareModel(null);
        return;
      }
      startTransition(async () => {
        setCompareModel(await fetchSheet({ levels, targetVersionId: value }));
      });
    },
    [levels],
  );

  return (
    <SheetScreen
      model={model}
      compareModel={compareModel}
      title={expanded ? "Company sheet — Levels 1 to 4" : "Company sheet — Levels 1 to 3"}
      subtitle={
        expanded
          ? "Department branches folded in under the Objective they ladder into"
          : "Targets resolve to the latest forecast unless a version is pinned"
      }
      printHref="/print/company"
      exportHref="/api/export"
      loading={pending}
      targetVersionId={targetVersionId}
      compareVersionId={compareVersionId}
      onTargetVersionChange={changeTarget}
      onCompareVersionChange={changeCompare}
      currentUser={currentUser}
      onStructureChanged={reload}
      viewToggle={
        <Segmented
          label="View"
          value={expanded ? "L4" : "L3"}
          onChange={(value) => {
            if ((value === "L4") !== expanded) toggleExpanded();
          }}
          options={[
            { value: "L3", label: "Company", hint: "Levels 1 to 3, the single company page" },
            { value: "L4", label: "+ Departments", hint: "Fold every Level 4 branch in under its Objective" },
          ]}
        />
      }
    />
  );
}
