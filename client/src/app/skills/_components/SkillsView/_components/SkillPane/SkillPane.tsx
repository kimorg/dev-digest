/* SkillPane — the right pane of the Skills view: nothing selected → a prompt
   (or the empty state when there are no skills); unknown id → not found;
   otherwise the skill's detail. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { isNotFoundError } from "@/lib/api";
import { SkillDetail } from "../../../SkillDetail";
import { SkillNotFound } from "../../../SkillNotFound";
import { s } from "./styles";

export interface SkillPaneProps {
  id: string | undefined;
  skill: SkillListItem | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  isEmpty: boolean;
  onAdd: () => void;
  tab: string;
  onTab: (tab: string) => void;
}

export function SkillPane({ id, skill, isLoading, error, onRetry, isEmpty, onAdd, tab, onTab }: SkillPaneProps) {
  const t = useTranslations("skills");
  if (!id) {
    return (
      <div style={s.center}>
        {isEmpty ? (
          <EmptyState icon="Sparkles" title={t("page.empty.title")} body={t("page.empty.body")} cta={t("page.empty.cta")} onCta={onAdd} />
        ) : (
          <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
        )}
      </div>
    );
  }
  if (isNotFoundError(error) || (!isLoading && !error && !skill)) {
    return (
      <div style={s.center}>
        <SkillNotFound />
      </div>
    );
  }
  if (error) {
    return (
      <div style={s.center}>
        <ErrorState body={t("detail.loadError")} onRetry={onRetry} />
      </div>
    );
  }
  if (isLoading || !skill) {
    return (
      <div style={s.loading}>
        <Skeleton height={24} width={240} />
        <Skeleton height={200} />
      </div>
    );
  }
  return <SkillDetail skill={skill} tab={tab} onTab={onTab} />;
}
