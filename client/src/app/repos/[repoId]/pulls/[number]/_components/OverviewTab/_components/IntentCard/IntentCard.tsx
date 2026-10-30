"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format-date";
import { usePrIntent, useRecalculatePrIntent } from "@/lib/hooks/intent";
import { s } from "./styles";

interface IntentCardProps {
  prId: string | null | undefined;
  repoId: string;
}

/** Overview "Intent" card. Reads the stored intent only — it never starts a detection on mount. */
export function IntentCard({ prId, repoId }: IntentCardProps) {
  const t = useTranslations("brief.intent");
  const { data, isLoading, error, refetch } = usePrIntent(prId);
  const recalc = useRecalculatePrIntent(prId, repoId);

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
          body={`${error instanceof ApiError ? error.message : ""} ${t("modelHint")}`.trim()}
          onRetry={() => refetch()}
        />
      </section>
    );
  }

  const unchanged = recalc.data?.regenerated === false && !data.stale;

  return (
    <section style={s.card}>
      <div style={s.header}>
        <span style={s.title}>
          <Icon.Target size={14} />
          {t("title")}
        </span>
        <div style={s.headerRight}>
          {data.stale && (
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("stale")}
            </Badge>
          )}
          <Button
            kind={data.stale ? "secondary" : "ghost"}
            size="sm"
            icon="RefreshCw"
            loading={recalc.isPending}
            onClick={() => recalc.mutate()}
          >
            {t("recalculate")}
          </Button>
        </div>
      </div>

      {unchanged && (
        <div role="status" style={s.muted}>
          {t("unchanged")}
        </div>
      )}

      {data.intent ? <IntentBody record={data.intent} /> : <div style={s.muted}>{t("empty")}</div>}
    </section>
  );
}

function IntentBody({ record }: { record: PrIntentRecord }) {
  const t = useTranslations("brief.intent");
  return (
    <>
      <blockquote style={s.intent}>“{record.intent}”</blockquote>

      <div style={s.columns}>
        <ScopeList title={t("inScope")} icon="Check" color="var(--ok)" items={record.in_scope} />
        <ScopeList title={t("outOfScope")} icon="X" color="var(--text-muted)" items={record.out_of_scope} />
      </div>

      {record.confidence !== "high" && (
        <div style={s.hint}>
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t(`confidence.${record.confidence}`)}
          </Badge>{" "}
          {record.confidence === "low" && t("lowConfidenceHint")}
        </div>
      )}

      <div style={s.footer}>
        <span>
          {t("sources.label")}:{" "}
          {record.sources.map((src) => (src.ref ? `${t(`sources.${src.kind}`)} ${src.ref}` : t(`sources.${src.kind}`))).join(", ")}
        </span>
        <span>
          {t("model", {
            model: record.model ?? "—",
            date: formatDateTime(record.generated_at),
          })}
        </span>
      </div>
    </>
  );
}

interface ScopeListProps {
  title: string;
  icon: "Check" | "X";
  color: string;
  items: string[];
}

function ScopeList({ title, icon, color, items }: ScopeListProps) {
  const t = useTranslations("brief.intent");
  const I = Icon[icon];
  return (
    <div>
      <h4 style={s.colTitle(color)}>
        <I size={13} />
        {title}
      </h4>
      {items.length === 0 ? (
        <div style={s.muted}>{t("none")}</div>
      ) : (
        <ul style={s.list}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
