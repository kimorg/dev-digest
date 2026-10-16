"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import { FindingsSeverityCounts, countBySeverity } from "@/components/findings-severity";
import { s } from "./styles";

interface RunFindingsSummaryProps {
  run: Pick<RunSummary, "findings_count" | "blockers">;
  /** This run's persisted findings, when its review is loaded. */
  findings?: FindingRecord[];
  repoFullName?: string | null;
  headSha?: string | null;
}

/** A settled run's findings line: per-severity counts (with popover) when the
    run's review is loaded, else the plain "N finding(s)" text; plus blockers. */
export function RunFindingsSummary({ run, findings, repoFullName, headSha }: RunFindingsSummaryProps) {
  const t = useTranslations("prReview");
  const blockers = run.blockers ?? 0;
  return (
    <div style={s.line}>
      {findings && findings.length > 0 ? (
        <FindingsSeverityCounts
          counts={countBySeverity(findings)}
          findings={findings}
          repoFullName={repoFullName}
          headSha={headSha}
        />
      ) : (
        t("runStatus.findings", { count: run.findings_count ?? 0 })
      )}
      {blockers > 0 ? t("runStatus.blockers", { count: blockers }) : ""}
    </div>
  );
}
