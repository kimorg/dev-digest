/* ConventionsView — /repos/:repoId/conventions (L02, client/specs/004-conventions.md).
   Run Scan (first time) / Re-scan asks the server to sample the repo and the
   Conventions model to propose rules; each card shows a candidate whose
   evidence was checked against the code. Accept / Reject / Edit persist; the
   accepted ones become one skill via Create skill. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { SkillListItem, UpdateConventionRequest } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import {
  useExtractConventions,
  useRepoConventions,
  useSetConventionsStatus,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { githubBlobUrl } from "@/lib/github-urls";
import { useToast } from "@/lib/toast";
import { ConventionCard } from "../ConventionCard";
import { ConventionsToolbar } from "../ConventionsToolbar";
import { CreateConventionSkillModal } from "../CreateConventionSkillModal";
import { countAccepted } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const toast = useToast();
  const { repoId } = useParams<{ repoId: string }>();
  const { repos } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data, isLoading, isError, refetch } = useRepoConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const setStatus = useSetConventionsStatus(repoId);
  const [isCreating, setIsCreating] = React.useState(false);

  const repo = repos.find((r) => r.id === repoId);
  const repoName = repo?.name ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  const scan = data?.scan ?? null;
  const candidates = data?.candidates ?? [];
  const accepted = countAccepted(candidates);
  // Pin links to the commit the scan read, so the line anchors match the evidence.
  const linkRef = scan?.head_sha ?? repo?.default_branch;
  const isScanning = extract.isPending;

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const changeOne = (id: string) => (patch: UpdateConventionRequest) => update.mutate({ id, patch });
  const setAll = (status: "pending" | "accepted") =>
    setStatus.mutate({ ids: candidates.map((c) => c.id), status });
  const onCreated = (skill: SkillListItem) => {
    setIsCreating(false);
    toast.success(t("modal.createdToast", { name: skill.name }));
  };

  const subtitle = !scan ? (
    <p style={s.subtitle}>{t("page.subtitle")}</p>
  ) : (
    <>
      <p style={s.subtitle}>
        {t("page.scanSummary", {
          count: scan.sample_count,
          when: format.relativeTime(new Date(scan.created_at), now),
        })}
      </p>
      {scan.status === "failed" && (
        <p style={s.failed} role="alert">
          {t("page.lastScanFailed", { error: scan.error ?? "" })}
        </p>
      )}
      {scan.status === "done" && scan.dropped_count > 0 && (
        <p style={s.note}>{t("page.dropped", { count: scan.dropped_count })}</p>
      )}
    </>
  );

  const body = (() => {
    if (isLoading) {
      return (
        <div style={s.skeletons}>
          <Skeleton height={180} />
          <Skeleton height={180} />
        </div>
      );
    }
    if (isError) return <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />;
    if (isScanning && candidates.length === 0) {
      return (
        <div style={s.panel}>
          <EmptyState icon="RefreshCw" title={t("page.scanning")} body={t("page.scanningBody")} />
        </div>
      );
    }
    if (!scan) {
      return (
        <div style={s.panel}>
          <EmptyState
            icon="ListChecks"
            title={t("empty.title")}
            body={t("empty.body")}
            cta={t("empty.cta")}
            onCta={() => extract.mutate()}
          />
        </div>
      );
    }
    if (candidates.length === 0) {
      return (
        <div style={s.panel}>
          <EmptyState icon="ListChecks" title={t("noCandidates.title")} body={t("noCandidates.body")} />
        </div>
      );
    }
    return (
      <>
        <ConventionsToolbar
          accepted={accepted}
          total={candidates.length}
          isBusy={setStatus.isPending || isScanning}
          onAcceptAll={() => setAll("accepted")}
          onDeselectAll={() => setAll("pending")}
          onCreateSkill={() => setIsCreating(true)}
        />
        <div style={s.list}>
          {candidates.map((c) => (
            <ConventionCard
              key={c.id}
              candidate={c}
              evidenceUrl={
                repo && linkRef
                  ? githubBlobUrl(repo.full_name, linkRef, c.evidence_path, c.evidence_line_start, c.evidence_line_end)
                  : undefined
              }
              isPending={isScanning || (update.isPending && update.variables?.id === c.id)}
              onChange={changeOne(c.id)}
            />
          ))}
        </div>
      </>
    );
  })();

  return (
    <AppShell crumb={crumb}>
      {isCreating && (
        <CreateConventionSkillModal
          repoId={repoId}
          repoName={repoName}
          onClose={() => setIsCreating(false)}
          onCreated={onCreated}
        />
      )}
      <div style={s.container}>
        <div style={s.header}>
          <div>
            <h1 style={s.title}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repo}>
                {repoName}
              </span>
            </h1>
            {subtitle}
          </div>
          <div style={s.actions}>
            {scan ? (
              <Button kind="secondary" icon="RefreshCw" loading={isScanning} onClick={() => extract.mutate()}>
                {isScanning ? t("page.scanning") : t("page.rescan")}
              </Button>
            ) : (
              <Button kind="primary" icon="Sparkles" loading={isScanning} onClick={() => extract.mutate()}>
                {isScanning ? t("page.scanning") : t("page.runScan")}
              </Button>
            )}
          </div>
        </div>
        {body}
      </div>
    </AppShell>
  );
}
