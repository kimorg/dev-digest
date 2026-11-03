"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import { formatDateTime } from "@/lib/format-date";
import { githubPrUrl } from "@/lib/github-urls";
import { usePrHistory } from "@/lib/hooks/pr-history";
import { s } from "./styles";

interface PriorPrsBlockProps {
  prId: string | null | undefined;
  repoFullName: string | null | undefined;
}

/**
 * Collapsible "Prior PRs" list (at most 5, as the server returns them). Never blocks the blast map.
 * Expandable only when there is at least one PR: an empty result shows a "0" count and a disabled
 * header; a degraded result or a load error is shown under the header without expanding.
 */
export function PriorPrsBlock({ prId, repoFullName }: PriorPrsBlockProps) {
  const t = useTranslations("blast.history");
  const { data, isLoading } = usePrHistory(prId);
  const [open, setOpen] = useState(false);
  const count = data?.history.length ?? 0;
  const canExpand = count > 0;
  const expanded = canExpand && open;
  const Chevron = expanded ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <div style={s.block}>
      <button
        type="button"
        style={s.toggle(canExpand)}
        disabled={!canExpand}
        aria-expanded={canExpand ? expanded : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={s.chevron(canExpand)} aria-hidden="true">
          <Chevron size={14} />
        </span>
        <Icon.History size={14} />
        {t("title")}
        {data && <Badge>{count}</Badge>}
      </button>

      {!isLoading && data == null && <div style={s.muted}>{t("loadError")}</div>}
      {data?.degraded && <div style={s.muted}>{t(`reason.${data.reason ?? "github_error"}`)}</div>}

      {expanded && (
        <>
          {count > 0 && (
            <ul style={s.list}>
              {data?.history.map((h) => (
                <li key={h.pr_number} style={s.row}>
                  <span style={s.rowTitle}>
                    {repoFullName ? (
                      <MonoLink href={githubPrUrl(repoFullName, h.pr_number)}>#{h.pr_number}</MonoLink>
                    ) : (
                      <span className="mono">#{h.pr_number}</span>
                    )}
                    <span>{h.title}</span>
                  </span>
                  <span style={s.meta}>
                    {h.author} · {formatDateTime(h.merged_at)}
                  </span>
                  {h.files_overlap.length > 0 && (
                    <span style={s.meta}>
                      {t("overlap")} <span className="mono">{h.files_overlap.join(", ")}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
