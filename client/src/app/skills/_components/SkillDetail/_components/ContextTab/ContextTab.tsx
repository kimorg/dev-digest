/* Skill Context tab — pick the repo docs added to the prompt of every agent that uses this skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { ContextDocsPicker } from "@/components/context-docs-picker";
import { useSetSkillContext, useSkillContext } from "@/lib/hooks/context";
import { useActiveRepo } from "@/lib/repo-context";

export interface ContextTabProps {
  skill: SkillListItem;
}

export function ContextTab({ skill }: ContextTabProps) {
  const t = useTranslations("skills");
  const { repoId } = useActiveRepo();
  const attached = useSkillContext(skill.id);
  const save = useSetSkillContext(skill.id);

  if (attached.isLoading) return <Skeleton height={160} />;
  if (attached.isError || !attached.data) {
    return <ErrorState body={t("detail.context.loadError")} onRetry={() => attached.refetch()} />;
  }

  const paths = [...attached.data.paths].sort((a, b) => a.order - b.order).map((e) => e.path);
  return (
    <ContextDocsPicker
      repoId={repoId}
      paths={paths}
      onChange={(next) => save.mutate(next)}
    />
  );
}
