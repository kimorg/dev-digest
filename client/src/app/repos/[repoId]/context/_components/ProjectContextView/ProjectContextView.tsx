/* ProjectContextView — /repos/:repoId/context (SPEC-005). Lists the repo's markdown
   docs (sorted by path), previews one, and rescans the local clone. View-only:
   attaching docs to agents / skills happens on their Context tabs. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useContextDocuments, useRescanContext } from "@/lib/hooks/context";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ContextDocList } from "../ContextDocList";
import { ContextDocPreview } from "../ContextDocPreview";
import { ContextDocToolbar } from "../ContextDocToolbar";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";

export function ProjectContextView() {
  const t = useTranslations("context");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const { repoId } = useParams<{ repoId: string }>();
  const { repos } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useContextDocuments(repoId);
  const rescan = useRescanContext(repoId);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);

  const repoLabel = repos.find((r) => r.id === repoId)?.full_name ?? repoId;
  const crumb = [{ label: repoLabel, mono: true }, { label: t("page.crumbContext") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const documents = data?.documents ?? [];
  // Derived: a path that vanished after a rescan simply selects nothing.
  const selected = documents.find((d) => d.path === selectedPath) ?? null;

  const toolbar = (
    <ContextDocToolbar
      repoId={repoId}
      selected={selected}
      isRescanning={rescan.isPending}
      onRescan={() => rescan.mutate()}
    />
  );

  const content = (() => {
    if (isLoading) {
      return (
        <div style={s.panes}>
          <div style={s.docsPane} data-testid="context-docs-pane" aria-busy="true">
            <div style={s.skeletons}>
              {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <div key={i} data-testid="context-doc-skeleton">
                  <Skeleton height={24} />
                </div>
              ))}
            </div>
          </div>
          <div style={s.previewPane} data-testid="context-preview-pane" />
        </div>
      );
    }
    if (isError || !data) {
      return (
        <div style={s.fullArea}>
          <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />
        </div>
      );
    }
    if (data.status === "no_clone") {
      return (
        <div style={s.fullArea}>
          <EmptyState icon="FileText" title={t("noClone.title")} body={t("noClone.body")} />
        </div>
      );
    }
    const footer = data.scanned_at
      ? t("page.footer", {
          count: documents.length,
          tokens: data.total_tokens,
          when: format.relativeTime(new Date(data.scanned_at), now),
        })
      : t("page.footerNever", { count: documents.length, tokens: data.total_tokens });
    const patterns = t.raw("empty.patterns") as string[];
    return (
      <>
        <div style={s.panes}>
          <div style={s.docsPane} data-testid="context-docs-pane">
            {toolbar}
            {data.truncated && <p style={s.warn}>{t("page.truncated")}</p>}
            {documents.length > 0 && (
              <div style={s.listScroll}>
                <ContextDocList documents={documents} selectedPath={selected?.path ?? null} onSelect={setSelectedPath} />
              </div>
            )}
          </div>
          <div style={s.previewPane} data-testid="context-preview-pane">
            {documents.length === 0 ? (
              <div>
                <EmptyState icon="FileText" title={t("empty.title")} body={t("empty.body")} />
                <ul style={s.patterns}>
                  {patterns.map((p) => (
                    <li key={p} className="mono">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ContextDocPreview repoId={repoId} doc={selected} />
            )}
          </div>
        </div>
        <div style={s.statusBar} data-testid="context-status-bar">
          <span aria-hidden style={s.dot} />
          <span>{footer}</span>
        </div>
      </>
    );
  })();

  return (
    <AppShell crumb={crumb}>
      <div style={s.container}>
        <div style={s.titleBar} data-testid="context-title-bar">
          <h1 style={s.title}>{t("title")}</h1>
        </div>
        {content}
      </div>
    </AppShell>
  );
}
