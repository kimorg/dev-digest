/* BriefBanner — the PR brief banner on the Overview tab. Reads the stored brief
   (never generates on mount); Generate / Refresh make the one model call. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useGeneratePrBrief, usePrBrief } from "@/lib/hooks/brief";
import { usePrReviews } from "@/lib/hooks/reviews";
import { BriefSummary } from "./_components/BriefSummary";
import { newestVerdictReview } from "./helpers";
import { s } from "./styles";

interface BriefBannerProps {
  prId: string | null | undefined;
}

export function BriefBanner({ prId }: BriefBannerProps) {
  const t = useTranslations("brief");
  const { data, isLoading, error, refetch } = usePrBrief(prId);
  const { data: reviews } = usePrReviews(prId);
  const generate = useGeneratePrBrief(prId);

  if (isLoading) {
    return (
      <section aria-label={t("label")} aria-busy="true" style={{ ...s.wrap, ...s.skeleton }}>
        <Skeleton width="30%" />
        <Skeleton height={36} />
      </section>
    );
  }

  // A failed refetch keeps the cached brief on screen; only "no data at all" is an error state.
  if (data == null) {
    return (
      <section aria-label={t("label")} style={s.wrap}>
        <div style={s.main}>
          <ErrorState
            title={t("loadErrorTitle")}
            body={error instanceof ApiError ? error.message : undefined}
            onRetry={() => refetch()}
          />
        </div>
      </section>
    );
  }

  const generateError = generate.isError ? (
    <div role="alert" style={s.error}>
      {generate.error instanceof Error ? generate.error.message : ""}{" "}
      <span style={s.errorHint}>{t("modelHint")}</span>
    </div>
  ) : null;

  return (
    <section aria-label={t("label")} style={s.stack}>
      {data.brief ? (
        <BriefSummary
          brief={data.brief}
          isStale={data.stale}
          review={newestVerdictReview(reviews)}
          isGenerating={generate.isPending}
          onRefresh={() => generate.mutate()}
        />
      ) : (
        <div style={{ ...s.wrap, ...s.empty }}>
          <div style={s.emptyTitle}>{t("unavailable")}</div>
          <div style={s.muted}>{t("unavailableHint")}</div>
          <Button kind="primary" icon="Sparkles" disabled={generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending ? t("generating") : t("generate")}
          </Button>
        </div>
      )}
      {generateError}
    </section>
  );
}
