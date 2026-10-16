/* /agents/:id — Agent Editor (A2, L03). Left agent list + Config editor
   (model + system prompt). Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgents, useAgent, useUpdateAgent } from "@/lib/hooks/agents";
import { ApiError, isNotFoundError } from "@/lib/api";
import { routes } from "@/lib/routes";
import { AgentCard } from "@/app/agents/_components/AgentCard";
import { AgentEditor } from "../AgentEditor";
import { AgentNotFound } from "../AgentNotFound";
import { VALID_TABS } from "./constants";
import { s } from "./styles";

export function AgentEditorView() {
  const t = useTranslations("agents");
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();

  const { data: agents } = useAgents();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);
  const update = useUpdateAgent();

  const requested = search.get("tab") ?? "";
  const tab = VALID_TABS.includes(requested) ? requested : VALID_TABS[0]!;
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(routes.agent(id, sp));
  };

  const crumb = [
    { label: t("list.breadcrumbLab") },
    { label: t("list.breadcrumb"), href: routes.agents() },
    { label: agent?.name ?? t("editor.agentFallback") },
  ];

  if (isNotFoundError(error) || (!isLoading && !isError && !agent)) {
    return (
      <AppShell crumb={crumb}>
        <AgentNotFound />
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("editor.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.layout}>
        <div style={s.sidebar}>
          <div style={s.sidebarHead}>
            <div style={s.sidebarTitleRow}>
              <h1 style={s.sidebarTitle}>{t("editor.listTitle")}</h1>
              <Dropdown
                width={210}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus">
                    {t("editor.add")}
                  </Button>
                }
                items={[
                  { label: t("editor.createFromScratch"), icon: "Edit", onClick: () => router.push(routes.agents()) },
                ]}
              />
            </div>
          </div>
          <div style={s.sidebarList}>
            {(agents ?? []).map((a) => (
              <AgentCard
                key={a.id}
                ag={a}
                active={a.id === id}
                onClick={() => router.push(routes.agent(a.id, { tab }))}
                onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {isLoading || !agent ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.editor}>
            <div style={s.editorHead}>
              <Icon.Cpu size={18} style={s.editorIcon} />
              <h1 style={s.editorTitle}>{agent.name}</h1>
              <Badge color="var(--text-secondary)" mono>
                {agent.provider}/{agent.model}
              </Badge>
              {!agent.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
              <div style={s.editorActions}>
                <Button kind="secondary" size="sm" icon="GitPullRequest" onClick={() => router.push(routes.home())}>
                  {t("editor.runOnPr")}
                </Button>
              </div>
            </div>
            <div style={s.editorBody}>
              <AgentEditor agent={agent} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
