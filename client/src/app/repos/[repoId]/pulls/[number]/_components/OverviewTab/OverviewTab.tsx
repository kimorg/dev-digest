"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { PrFile } from "@devdigest/shared";
import { usePrBrief } from "@/lib/hooks/brief";
import { BriefBanner } from "./_components/BriefBanner";
import { IntentCard } from "./_components/IntentCard";
import { RiskAreas } from "./_components/RiskAreas";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { ReviewFocusCard } from "./_components/ReviewFocusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  repoId: string;
  prBody: string | null | undefined;
  repoFullName: string | null | undefined;
  headSha: string | null | undefined;
  /** The PR's changed files — brief links open Files changed only for these. */
  files: PrFile[];
  /** URL that opens Files changed at a file (and line). */
  fileHref: (path: string, line: number | null) => string;
}

export function OverviewTab({ prId, repoId, prBody, repoFullName, headSha, files, fileHref }: OverviewTabProps) {
  const t = useTranslations("prReview");
  const tBrief = useTranslations("brief");
  // Same query as the banner (one request); Risk areas and Review focus need a stored brief.
  const brief = usePrBrief(prId).data?.brief ?? null;
  return (
    <>
      {/* Label + block share one wrapper: the parent is a flex column with `gap`, so a bare
          label would be its own item and sit `gap` further from its block than the others. */}
      <div>
        <SectionLabel icon="FileText">{tBrief("label")}</SectionLabel>
        <BriefBanner prId={prId} />
      </div>
      <div style={s.briefRow}>
        <div style={s.briefCell}>
          <SectionLabel icon="Target">{tBrief("block.intent")}</SectionLabel>
          <IntentCard prId={prId} repoId={repoId}>
            {brief && <RiskAreas risks={brief.risks.risks} files={files} fileHref={fileHref} />}
          </IntentCard>
        </div>
        <div style={s.briefCell}>
          <SectionLabel icon="Workflow">{tBrief("block.blast")}</SectionLabel>
          <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
        </div>
      </div>
      {brief && <ReviewFocusCard items={brief.review_focus} files={files} fileHref={fileHref} />}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{t("overview.description")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
