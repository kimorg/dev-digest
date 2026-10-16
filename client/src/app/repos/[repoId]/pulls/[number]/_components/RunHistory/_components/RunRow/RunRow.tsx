"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore } from "@devdigest/ui";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { formatTime } from "@/lib/format-date";
import { OUTCOME_META } from "../../constants";
import { isRunDeletable, isRunSettled, outcomeOf } from "../../helpers";
import { RunFindingsSummary } from "../RunFindingsSummary";
import { s } from "./styles";

interface RunRowProps {
  run: RunSummary;
  /** This run's persisted findings (per-severity counts + popover), when loaded. */
  findings?: FindingRecord[];
  repoFullName?: string | null;
  headSha?: string | null;
  onOpenTrace: (runId: string) => void;
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}

/** One agent run in the PR timeline: outcome badge, score, agent + model, its
    findings line, time + cost, and the trace / delete actions. */
export function RunRow({ run, findings, repoFullName, headSha, onOpenTrace, onGoToReview, onDelete }: RunRowProps) {
  const t = useTranslations("prReview");
  const outcome = outcomeOf(run);
  const meta = OUTCOME_META[outcome];
  const settled = isRunSettled(run);

  return (
    <div style={s.row}>
      <Badge color={meta.color} bg={meta.bg} icon={meta.icon}>
        {t(`runStatus.${outcome}`)}
      </Badge>
      {settled && run.score != null && <CircularScore score={run.score} size={30} stroke={3} />}
      <div style={s.main}>
        <div style={s.title}>
          <button
            type="button"
            onClick={() => onGoToReview?.(run.run_id)}
            title={t("timeline.goToReview")}
            style={s.agentBtn(!!onGoToReview)}
          >
            {run.agent_name ?? t("timeline.agentFallback")}
          </button>{" "}
          <span className="mono" style={s.model}>
            {run.provider}/{run.model}
          </span>
        </div>
        {run.status === "failed" && run.error && (
          <div style={s.error} title={run.error}>
            {run.error}
          </div>
        )}
        {settled && (
          <RunFindingsSummary run={run} findings={findings} repoFullName={repoFullName} headSha={headSha} />
        )}
      </div>
      <div style={s.meta}>
        {run.ran_at && <span>{formatTime(run.ran_at)}</span>}
        {settled && (
          <RunCostBadge variant="detailed" costUsd={run.cost_usd} tokensIn={run.tokens_in} tokensOut={run.tokens_out} />
        )}
      </div>
      <button
        type="button"
        title={t("timeline.openTrace")}
        aria-label={t("timeline.openTrace")}
        onClick={() => onOpenTrace(run.run_id)}
        style={s.iconBtn}
      >
        <Icon.FileText size={13} />
      </button>
      {onDelete && isRunDeletable(run) && (
        <button
          type="button"
          aria-label={t("timeline.deleteRun")}
          title={t("timeline.deleteRun")}
          onClick={() => onDelete(run.run_id)}
          style={s.deleteBtn}
        >
          <Icon.Trash size={13} />
        </button>
      )}
    </div>
  );
}
