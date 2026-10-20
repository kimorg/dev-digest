"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Button, SectionLabel, EmptyState } from "@devdigest/ui";
import { RunStatus } from "../RunStatus";
import { RunHistory } from "../RunHistory";
import { ReviewRunAccordion } from "../ReviewRunAccordion";
import { s } from "./styles";
import type { FindingRecord, ReviewRecord, RunSummary, PrCommit } from "@devdigest/shared";
import { useCancelRun } from "@/lib/hooks/reviews";

interface FindingsTabProps {
  prId: string | null;
  liveRunIds: string[];
  lethalTrifecta: FindingRecord[];
  runs: ReviewRecord[];
  prRuns: RunSummary[] | undefined;
  prCommits: PrCommit[];
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  onOpenTrace: (id: string) => void;
  onDelete: (id: string) => void;
  onRunDone: () => void;
}

export function FindingsTab({
  prId,
  liveRunIds,
  lethalTrifecta,
  runs,
  prRuns,
  prCommits,
  repoFullName,
  headSha,
  onOpenTrace,
  onDelete,
  onRunDone,
}: FindingsTabProps) {
  const t = useTranslations("prReview");
  // review.run_id → its agent_runs row, so each VerdictBanner can show that run's cost.
  const runById = React.useMemo(
    () => new Map((prRuns ?? []).map((r) => [r.run_id, r])),
    [prRuns],
  );
  // review.run_id → that run's findings, for the timeline's per-severity counts.
  const findingsByRun = React.useMemo(
    () => new Map(runs.flatMap((rv) => (rv.run_id ? [[rv.run_id, rv.findings] as const] : []))),
    [runs],
  );
  const reviewRunning = liveRunIds.length > 0;
  const cancel = useCancelRun(prId);
  const handleCancelAll = () => liveRunIds.forEach((id) => cancel.mutate(id));
  const handleOpenFirstTrace = () => {
    if (liveRunIds[0]) onOpenTrace(liveRunIds[0]);
  };

  // Timeline → Review-runs navigation: clicking an agent name in the timeline
  // opens + scrolls to that run's accordion below. The nonce re-triggers the
  // scroll even when the same run is clicked twice.
  const [target, setTarget] = React.useState<{ runId: string; n: number } | null>(null);
  const handleGoToReview = (runId: string) => {
    setTarget((p) => ({ runId, n: (p?.n ?? 0) + 1 }));
  };

  // One open run panel at a time owns the j/k/a/d shortcuts: the last one the
  // user opened or touched, else the newest run.
  const [keyboardReviewId, setKeyboardReviewId] = React.useState<string | null>(null);
  const activeKeyboardReviewId =
    keyboardReviewId && runs.some((r) => r.id === keyboardReviewId) ? keyboardReviewId : runs[0]?.id;

  return (
    <section>
      {reviewRunning && (
        <div style={s.liveRunSection}>
          <SectionLabel
            icon="Sparkles"
            right={
              <div style={s.cancelActions}>
                <Button
                  kind="danger"
                  size="sm"
                  icon="X"
                  loading={cancel.isPending}
                  onClick={handleCancelAll}
                >
                  {t("findingsTab.cancel")}
                </Button>
                <Button kind="ghost" size="sm" icon="FileText" onClick={handleOpenFirstTrace}>
                  {t("findingsTab.openTrace")}
                </Button>
              </div>
            }
          >
            {t("findingsTab.liveReview")}
          </SectionLabel>
          <RunStatus runIds={liveRunIds} onDone={onRunDone} />
        </div>
      )}

      {reviewRunning && (
        <div style={s.reviewInProgress}>
          <Icon.RefreshCw size={16} style={{ color: "var(--accent)", animation: "ddspin 1s linear infinite" }} />
          <span style={s.reviewInProgressText}>{t("findingsTab.inProgress")}</span>
          <span style={s.reviewInProgressSub}>
            {t("findingsTab.inProgressHint")}
          </span>
        </div>
      )}

      {lethalTrifecta.length > 0 && (
        <div style={s.lethalTrifecta}>
          <Icon.Shield size={16} style={{ color: "var(--crit)" }} />
          <span style={s.lethalTrifectaTitle}>{t("findingsTab.lethalTrifecta")}</span>
          <Badge color="var(--crit)" bg="transparent">
            {t("findingsTab.lethalTrifectaCount", { count: lethalTrifecta.length })}
          </Badge>
        </div>
      )}

      {((prRuns && prRuns.length > 0) || prCommits.length > 0) && (
        <div style={s.timelineSection}>
          <SectionLabel
            icon="Activity"
            right={<span style={s.sectionHint}>{t("findingsTab.timelineHint")}</span>}
          >
            {t("findingsTab.timeline")}
          </SectionLabel>
          <RunHistory
            runs={prRuns ?? []}
            commits={prCommits}
            onOpenTrace={onOpenTrace}
            onGoToReview={handleGoToReview}
            onDelete={onDelete}
            findingsByRun={findingsByRun}
            repoFullName={repoFullName}
            headSha={headSha}
          />
        </div>
      )}

      <SectionLabel
        icon="AlertOctagon"
        right={<span style={s.sectionHint}>{t("findingsTab.reviewRunsHint")}</span>}
      >
        {t("findingsTab.reviewRuns")}
      </SectionLabel>
      {runs.length === 0 ? (
        reviewRunning ? null : (
          <EmptyState
            icon="Sparkles"
            title={t("findingsTab.emptyTitle")}
            body={t("findingsTab.emptyBody")}
          />
        )
      ) : (
        prId &&
        runs.map((review, i) => (
          <ReviewRunAccordion
            key={review.id}
            review={review}
            prId={prId}
            defaultOpen={i === 0}
            repoFullName={repoFullName}
            headSha={headSha}
            targetRunId={target?.runId ?? null}
            targetNonce={target?.n ?? 0}
            run={review.run_id ? runById.get(review.run_id) : undefined}
            isKeyboardActive={review.id === activeKeyboardReviewId}
            onActivate={() => setKeyboardReviewId(review.id)}
          />
        ))
      )}
    </section>
  );
}
