/* BriefSummary — the ready banner: verdict box · title row + summary · refresh, score and cost. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, CircularScore, Icon } from "@devdigest/ui";
import type { PrBriefRecord, ReviewRecord, Verdict } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { formatDateTime } from "@/lib/format-date";
import { VERDICT_META } from "@/app/repos/[repoId]/pulls/[number]/constants";
import { countOpenCriticals } from "@/app/repos/[repoId]/pulls/[number]/helpers";
import { formatTokenFlow } from "../../helpers";
import { s } from "../../styles";

interface BriefSummaryProps {
  brief: PrBriefRecord;
  isStale: boolean;
  /** Newest review with a verdict; undefined → the neutral "No review yet" banner. */
  review: ReviewRecord | undefined;
  isGenerating: boolean;
  onRefresh: () => void;
}

export function BriefSummary({ brief, isStale, review, isGenerating, onRefresh }: BriefSummaryProps) {
  const t = useTranslations("brief");
  const tPr = useTranslations("prReview");
  const tipId = React.useId();
  const [isTipOpen, setIsTipOpen] = React.useState(false);

  const meta = review?.verdict ? (VERDICT_META[review.verdict as Verdict] ?? VERDICT_META.comment) : null;
  const VIcon = Icon[meta?.icon ?? "FileText"];
  const tokenFlow = formatTokenFlow(brief.tokens_in, brief.tokens_out);
  const hasCost = brief.cost_usd != null || tokenFlow != null;
  const refreshLabel = isGenerating ? t("generating") : t("refresh");

  return (
    <div style={s.wrap}>
      <div style={meta ? s.iconBox(meta.bg, meta.c) : s.iconBox("var(--bg-hover)", "var(--text-muted)")}>
        <VIcon size={22} />
      </div>

      <div style={s.main}>
        <div style={s.titleRow}>
          {review && meta ? (
            <>
              <span style={s.label(meta.c)}>{tPr(`verdict.${meta.labelKey}`)}</span>
              <Badge color="var(--text-secondary)">
                {t("findingsCount", {
                  findings: review.findings.length,
                  blockers: countOpenCriticals(review.findings),
                })}
              </Badge>
              <span
                style={s.infoWrap}
                onMouseEnter={() => setIsTipOpen(true)}
                onMouseLeave={() => setIsTipOpen(false)}
                onFocus={() => setIsTipOpen(true)}
                onBlur={() => setIsTipOpen(false)}
              >
                <button type="button" style={s.infoBtn} aria-label={t("reviewInfo")} aria-describedby={tipId}>
                  <Icon.Info size={14} />
                </button>
                <span id={tipId} role="tooltip" hidden={!isTipOpen} style={s.tooltip}>
                  {t("fromLatestReview", {
                    agent: review.agent_name ?? tPr("reviewRun.agentFallback"),
                    date: formatDateTime(review.created_at),
                  })}
                </span>
              </span>
            </>
          ) : (
            <span style={s.muted}>{t("noReview")}</span>
          )}
          {isStale && (
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("stale")}
            </Badge>
          )}
        </div>
        <p style={s.summary}>{brief.summary}</p>
      </div>

      <div style={s.side}>
        <div style={s.sideTop}>
          <Button
            kind="tertiary"
            icon="RefreshCw"
            disabled={isGenerating}
            aria-label={refreshLabel}
            title={refreshLabel}
            onClick={onRefresh}
          />
          {review?.score != null && (
            <div style={s.scoreCol}>
              <CircularScore score={review.score} size={52} stroke={5} />
              <span style={s.scoreLabel}>{t("score")}</span>
            </div>
          )}
        </div>
        {hasCost && (
          <div className="mono tnum" style={s.cost} data-testid="brief-cost">
            {[formatCost(brief.cost_usd), tokenFlow].filter(Boolean).join(" ")}
          </div>
        )}
      </div>
    </div>
  );
}
