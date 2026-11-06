/* Agent Context tab — pick the repo docs this agent's review prompts include,
   and see how many more its enabled skills bring (one `?include=skills` request). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextDocsPicker } from "@/components/context-docs-picker";
import { useAgentContextWithSkills, useContextDocuments, useSetAgentContext } from "@/lib/hooks/context";
import { useActiveRepo } from "@/lib/repo-context";
import { countViaSkills, toOrderedPaths } from "./helpers";

export interface ContextTabProps {
  agent: Agent;
}

export function ContextTab({ agent }: ContextTabProps) {
  const t = useTranslations("agents");
  const { repoId } = useActiveRepo();
  const attached = useAgentContextWithSkills(agent.id);
  const docs = useContextDocuments(repoId);
  const save = useSetAgentContext(agent.id);

  if (attached.isLoading) return <Skeleton height={160} />;
  if (attached.isError || !attached.data) {
    return <ErrorState body={t("context.loadError")} onRetry={() => attached.refetch()} />;
  }

  const docsByPath = new Map((docs.data?.documents ?? []).map((d) => [d.path, d]));
  const via = countViaSkills(attached.data.paths, attached.data.skills ?? [], docsByPath);

  return (
    <ContextDocsPicker
      repoId={repoId}
      paths={toOrderedPaths(attached.data.paths)}
      extra={<p data-testid="agent-context-via-skills">{t("context.viaSkills", { count: via.k, tokens: via.tokens })}</p>}
      onChange={(paths) => save.mutate(paths)}
    />
  );
}
