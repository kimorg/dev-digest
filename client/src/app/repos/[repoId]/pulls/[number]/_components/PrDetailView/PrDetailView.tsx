/* PrDetailView — /repos/:repoId/pulls/:number. Header + tabs (Overview, Agent
   runs, Files changed) and the run-trace drawer. Tab and open trace live in the
   URL (?tab, ?trace); live runs are server-sourced and self-clear via polling. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { usePrByNumber } from "@/lib/hooks/pulls";
import { usePrReviews, usePrActiveRuns, usePrRuns, useDeleteRun, useRefreshPrRuns } from "@/lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError, isNotFoundError } from "@/lib/api";
import { githubPrUrl } from "@/lib/github-urls";
import { routes } from "@/lib/routes";
import { PrDetailHeader } from "../PrDetailHeader";
import { OverviewTab } from "../OverviewTab";
import { FindingsTab } from "../FindingsTab";
import { DiffTab } from "../DiffTab";
import RunTraceDrawer from "../RunTraceDrawer";
import { PrNotFound } from "../PrNotFound";
import { usePrDetailUrlState } from "./hooks/usePrDetailUrlState";
import { useRefreshOnRunsSettled } from "./hooks/useRefreshOnRunsSettled";
import { allFindings, canComment, lethalTrifectaFindings } from "./helpers";
import { s } from "./styles";

export function PrDetailView() {
  const t = useTranslations("prReview");
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { prId, pr, isUnknownNumber, isLoading, isError, error, refetch } = usePrByNumber(repoId, number);
  const { tab, traceRunId, setTab, openTrace, closeTrace } = usePrDetailUrlState(repoId, number);

  const { data: reviews } = usePrReviews(prId);
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const deleteRun = useDeleteRun(prId);
  // Refresh in-flight runs, the run history and the reviews when a run starts or
  // settles, so a just-failed run shows up without a reload.
  const refreshRuns = useRefreshPrRuns(prId);

  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = reviews ?? [];
  const findings = React.useMemo(() => allFindings(reviews ?? []), [reviews]);
  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  // The single owner of "a run settled → refresh" on every tab (the Agent runs tab no longer
  // refreshes through RunStatus), so the diff's findings update too.
  useRefreshOnRunsSettled(liveRunIds.length, refreshRuns);
  const traceReview = traceRunId ? runs.find((r) => r.run_id === traceRunId) : undefined;

  // The real "owner/repo" (null until the repo is loaded) — used to build
  // github.com deep-links for the header and finding file references.
  const repoFullName = activeRepo?.full_name ?? null;
  const crumb = [
    { label: repoFullName ?? repoId, mono: true, href: routes.pulls(repoId) },
    { label: t("detail.breadcrumb"), href: routes.pulls(repoId) },
    { label: `#${number}`, mono: true },
  ];

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.loading}>
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={200} />
        </div>
      </AppShell>
    );
  }

  // No such PR number (or the API 404s the PR): a stale link, not a transient
  // failure — no retry.
  if (isUnknownNumber || isNotFoundError(error)) {
    return (
      <AppShell crumb={crumb}>
        <PrNotFound repoId={repoId} number={number} />
      </AppShell>
    );
  }

  if (isError || !pr) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("detail.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("detail.loadErrorBody", { number })}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <PrDetailHeader
        pr={pr}
        prId={prId}
        tab={tab}
        findingsCount={findings.length}
        githubUrl={repoFullName ? githubPrUrl(repoFullName, pr.number) : null}
        onSetTab={setTab}
        onRunStart={() => setTab("findings")}
        onRunsStarted={refreshRuns}
      />

      <div style={s.body}>
        {tab === "overview" && <OverviewTab prId={prId} repoId={repoId} prBody={pr.body} />}

        {tab === "findings" && (
          <FindingsTab
            prId={prId}
            liveRunIds={liveRunIds}
            lethalTrifecta={lethalTrifectaFindings(findings)}
            runs={runs}
            prRuns={prRuns}
            prCommits={pr.commits}
            repoFullName={repoFullName}
            headSha={pr.head_sha}
            onOpenTrace={openTrace}
            onDelete={(id) => {
              if (window.confirm(t("detail.confirmDeleteRun"))) deleteRun.mutate(id);
            }}
          />
        )}

        {tab === "diff" && (
          <DiffTab prId={prId} filesCount={pr.files_count} files={pr.files} canComment={canComment(pr)} />
        )}
      </div>

      {prId && traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          prNumber={pr.number}
          findings={traceReview?.findings ?? []}
          agentName={traceReview?.agent_name ?? null}
          // A trace opened for an in-flight run streams its live log.
          running={liveRunIds.includes(traceRunId)}
          onClose={closeTrace}
        />
      )}
    </AppShell>
  );
}
