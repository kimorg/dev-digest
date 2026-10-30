"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "./_components/IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  repoId: string;
  prBody: string | null | undefined;
}

export function OverviewTab({ prId, repoId, prBody }: OverviewTabProps) {
  const t = useTranslations("prReview");
  return (
    <>
      {/* One column for now; the Blast Radius card joins this row later. */}
      <div style={s.briefRow}>
        <IntentCard prId={prId} repoId={repoId} />
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
