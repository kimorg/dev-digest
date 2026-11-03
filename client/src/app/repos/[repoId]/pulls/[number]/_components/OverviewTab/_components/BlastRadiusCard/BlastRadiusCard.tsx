"use client";

import React, { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { usePrBlastRadius } from "@/lib/hooks/blast";
import { BlastGraphModal } from "./_components/BlastGraphModal";
import { PriorPrsBlock } from "./_components/PriorPrsBlock";
import { BlastSymbolItem } from "./_components/BlastSymbolItem";
import { ResyncControl } from "./_components/ResyncControl";
import { blastStats, canResync, kindsByName } from "./helpers";
import { s } from "./styles";

interface BlastRadiusCardProps {
  prId: string | null | undefined;
  repoId: string;
  repoFullName: string | null | undefined;
  headSha: string | null | undefined;
}

/** Overview "Blast radius" card: changed symbols → callers → endpoints/crons, read from the repo index. */
export function BlastRadiusCard({ prId, repoId, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const tBrief = useTranslations("brief.block");
  const { data, isLoading, error, refetch } = usePrBlastRadius(prId);
  const [graphOpen, setGraphOpen] = useState(false);
  const graphTrigger = useRef<HTMLElement | null>(null);

  if (isLoading) {
    return (
      <section style={s.card} aria-busy="true">
        <Skeleton width="40%" />
        <Skeleton height={44} />
        <Skeleton height={60} />
      </section>
    );
  }

  // Cached data stays on screen when a background refetch fails (isError alone isn't enough).
  if (data == null) {
    return (
      <section style={s.card}>
        <ErrorState
          title={t("errorTitle")}
          body={error instanceof ApiError ? error.message : undefined}
          onRetry={() => refetch()}
        />
      </section>
    );
  }

  const stats = blastStats(data);
  const kinds = kindsByName(data);
  const reason = data.reason ?? "no_data";

  return (
    <section style={s.card} aria-label={tBrief("blast")}>
      <div style={s.header}>
        <span style={s.title}>
          <Icon.Workflow size={14} />
          {tBrief("blast")}
        </span>
      </div>

      <div style={s.statRow}>
        {(
          [
            ["symbols", "Code"],
            ["callers", "CornerDownRight"],
            ["endpoints", "Globe"],
            ["crons", "Clock"],
          ] as const
        ).map(([key, icon]) => {
          const I = Icon[icon];
          return (
            <span key={key} style={s.stat}>
              <I size={13} />
              <strong style={s.statNumber}>{stats[key]}</strong>
              {t(`stat.${key}`, { count: stats[key] })}
            </span>
          );
        })}
        {data.downstream.length > 0 && (
          <span style={s.statEnd}>
            <Button
              kind="ghost"
              size="sm"
              icon="Workflow"
              onClick={(e) => {
                graphTrigger.current = e.currentTarget;
                setGraphOpen(true);
              }}
            >
              {t("view.graph")}
            </Button>
          </span>
        )}
      </div>

      {data.degraded && (
        <div style={s.degraded}>
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("degraded.badge")}
          </Badge>
          <span style={s.muted}>{t(`degraded.reason.${reason}`)}</span>
          {canResync(reason) ? (
            <ResyncControl prId={prId} repoId={repoId} />
          ) : (
            <span style={s.muted}>{t(`degraded.hint.${reason}`)}</span>
          )}
        </div>
      )}

      {data.downstream.length > 0 ? (
        <ul style={s.tree}>
          {data.downstream.map((d, i) => (
            <li key={d.symbol}>
              <BlastSymbolItem
                impact={d}
                kind={kinds.get(d.symbol)}
                repoFullName={repoFullName}
                headSha={headSha}
                defaultOpen={i === 0}
              />
            </li>
          ))}
        </ul>
      ) : (
        !data.degraded && <div style={s.muted}>{t("noDownstream", { count: stats.symbols })}</div>
      )}

      <PriorPrsBlock prId={prId} repoFullName={repoFullName} />

      {graphOpen && (
        <BlastGraphModal
          blast={data}
          onClose={() => {
            setGraphOpen(false);
            graphTrigger.current?.focus();
          }}
        />
      )}
    </section>
  );
}
