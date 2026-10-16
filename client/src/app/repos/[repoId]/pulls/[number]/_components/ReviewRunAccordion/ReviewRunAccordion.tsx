/* ReviewRunAccordion — one collapsible review RUN (a single agent's pass over
   the PR). Header shows agent + verdict + counts + score + when it ran; the
   body holds that run's VerdictBanner summary and its own FindingsPanel. A PR
   can have many runs (different agents / re-runs over time) — each is separate
   and collapsible so older runs don't bury the latest. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import type { ReviewRecord, RunSummary, Verdict } from "@devdigest/shared";
import { FindingsPanel } from "../FindingsPanel";
import { VerdictBanner } from "../VerdictBanner";
import { useDeleteReview } from "@/lib/hooks/reviews";
import { formatDateTime } from "@/lib/format-date";
import { VERDICT_META } from "../../constants";
import { countOpenCriticals } from "./helpers";
import { s } from "./styles";

export function ReviewRunAccordion({
  review,
  prId,
  defaultOpen = false,
  repoFullName,
  headSha,
  targetRunId = null,
  targetNonce = 0,
  run,
  isKeyboardActive = false,
  onActivate,
}: {
  review: ReviewRecord;
  prId: string;
  defaultOpen?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** When this matches review.run_id, the accordion opens and scrolls into view
   *  (driven from the Timeline: clicking an agent name navigates here). */
  targetRunId?: string | null;
  targetNonce?: number;
  /** This review's agent_runs row (cost + tokens for the VerdictBanner), when loaded. */
  run?: RunSummary;
  /** Whether this run's findings panel owns the j/k/a/d shortcuts. */
  isKeyboardActive?: boolean;
  /** Called when the user opens or interacts with this run (makes it keyboard-active). */
  onActivate?: () => void;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(defaultOpen);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (review.run_id && review.run_id === targetRunId) {
      setOpen(true);
      onActivate?.();
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRunId, targetNonce, review.run_id]);
  const del = useDeleteReview(prId);
  const findings = review.findings;
  const blockers = countOpenCriticals(findings);
  const agentName = review.agent_name ?? t("reviewRun.agentFallback");
  const verdictColor = review.verdict ? VERDICT_META[review.verdict]?.c ?? "var(--text-muted)" : "var(--text-muted)";

  return (
    <div
      ref={rootRef}
      id={review.run_id ? `review-run-${review.run_id}` : undefined}
      onPointerDownCapture={onActivate}
      onFocusCapture={onActivate}
      style={s.root}
    >
      {/* The whole header toggles on click; the chevron <button> is the keyboard
          entry point (its click bubbles here). Delete stops propagation, so it is
          never nested inside another interactive element. */}
      <div onClick={() => setOpen((o) => !o)} style={s.header}>
        <Icon.Cpu size={15} style={s.agentIcon} />
        <span style={s.agentName}>{agentName}</span>
        {review.verdict && (
          <Badge color={verdictColor} bg="transparent">
            {t(`reviewRun.verdictBadge.${review.verdict}`)}
          </Badge>
        )}
        <span style={s.counts}>
          {t("reviewRun.findings", { count: findings.length })}
          {blockers > 0 ? t("reviewRun.blockers", { count: blockers }) : ""}
        </span>
        <span style={s.spacer} />
        {review.score != null && (
          <Badge mono color="var(--text-secondary)">
            {review.score}
          </Badge>
        )}
        <span className="mono" style={s.when}>
          {formatDateTime(review.created_at)}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(t("reviewRun.confirmDelete", { agent: agentName }))) {
              del.mutate(review.id);
            }
          }}
          disabled={del.isPending}
          title={t("reviewRun.delete")}
          aria-label={t("reviewRun.delete")}
          style={s.deleteBtn(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? s.spin : undefined} />
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-label={t(open ? "reviewRun.collapse" : "reviewRun.expand", { agent: agentName })}
          style={s.toggleBtn}
        >
          <Icon.ChevronDown size={16} style={s.chevron(open)} />
        </button>
      </div>

      {open && (
        <div style={s.body}>
          {review.verdict && (
            <div style={s.banner}>
              <VerdictBanner
                verdict={review.verdict as Verdict}
                summary={review.summary}
                score={review.score}
                findingsCount={findings.length}
                blockers={blockers}
                agentName={review.agent_name}
                costUsd={run?.cost_usd}
                tokensIn={run?.tokens_in}
                tokensOut={run?.tokens_out}
              />
            </div>
          )}
          <FindingsPanel
            findings={findings}
            prId={prId}
            repoFullName={repoFullName}
            headSha={headSha}
            isKeyboardActive={isKeyboardActive}
          />
        </div>
      )}
    </div>
  );
}

export default ReviewRunAccordion;
