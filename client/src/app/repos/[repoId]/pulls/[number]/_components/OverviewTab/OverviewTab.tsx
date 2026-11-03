"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "./_components/IntentCard";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  repoId: string;
  prBody: string | null | undefined;
  repoFullName: string | null | undefined;
  headSha: string | null | undefined;
}

export function OverviewTab({ prId, repoId, prBody, repoFullName, headSha }: OverviewTabProps) {
  const t = useTranslations("prReview");
  return (
    <>
      <div style={s.briefRow}>
        <IntentCard prId={prId} repoId={repoId} />
        <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
      </div>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{t("overview.description")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
