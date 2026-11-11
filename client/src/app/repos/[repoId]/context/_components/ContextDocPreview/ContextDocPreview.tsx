/* ContextDocPreview — the right pane of the Project Context page: a header row with the
   selected doc's path and "Used by", then its markdown content. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import type { ContextDocument } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useContextFile } from "@/lib/hooks/context";
import { s } from "./styles";

export interface ContextDocPreviewProps {
  repoId: string;
  doc: ContextDocument | null;
}

export function ContextDocPreview({ repoId, doc }: ContextDocPreviewProps) {
  const t = useTranslations("context");
  const file = useContextFile(repoId, doc && !doc.too_large ? doc.path : null);

  if (!doc) {
    return (
      <div style={s.panel}>
        <p style={s.note}>{t("doc.select")}</p>
      </div>
    );
  }

  const body = (() => {
    if (doc.too_large) return <p style={s.note}>{t("doc.tooLargeBody")}</p>;
    if (file.isLoading) return <Skeleton height={160} />;
    if (file.error instanceof ApiError && file.error.status === 404) {
      return <EmptyState icon="FileText" title={t("doc.gone")} />;
    }
    if (file.isError || !file.data) return <ErrorState body={t("doc.loadError")} onRetry={() => file.refetch()} />;
    if (!file.data.content) return <p style={s.note}>{t("doc.empty")}</p>;
    return (
      <div style={s.markdown}>
        <Markdown>{file.data.content}</Markdown>
      </div>
    );
  })();

  return (
    <section style={s.panel} aria-label={doc.path}>
      <div style={s.head} data-testid="context-preview-header">
        <span className="mono" style={s.path}>
          {doc.path}
        </span>
        <span style={s.usedBy}>{t("doc.usedBy", { agents: doc.used_by.agents, skills: doc.used_by.skills })}</span>
      </div>
      <div style={s.body}>{body}</div>
    </section>
  );
}
