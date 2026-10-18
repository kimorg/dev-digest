/* Skill Versions tab — every body snapshot, newest first. An older version can
   be diffed against the current body, or restored (its body becomes a new
   version — history is never rewritten). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { SkillListItem, SkillVersion } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/format-date";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { VersionDiffModal } from "./_components/VersionDiffModal";
import { s } from "./styles";

export interface VersionsTabProps {
  skill: SkillListItem;
}

export function VersionsTab({ skill }: VersionsTabProps) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffOf, setDiffOf] = React.useState<SkillVersion | null>(null);
  const [restoreOf, setRestoreOf] = React.useState<SkillVersion | null>(null);

  const confirmRestore = () => {
    if (!restoreOf) return;
    const version = restoreOf.version;
    restore.mutate(
      { id: skill.id, version },
      {
        onSuccess: () => {
          toast.success(t("versions.restoredToast", { version }));
          setRestoreOf(null);
        },
      },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        {versions && <Badge>{t("versions.count", { count: versions.length })}</Badge>}
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>

      {isLoading && <Skeleton height={48} />}
      {isError && <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />}
      {versions?.map((v) => {
        const isCurrent = v.version === skill.version;
        return (
          <div key={v.version} style={s.row} data-testid="skill-version-row">
            <span className="mono" style={s.version}>
              {t("detail.version", { version: v.version })}
            </span>
            {isCurrent && (
              <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
                {t("versions.current")}
              </Badge>
            )}
            <span style={s.date}>{formatDateTime(v.created_at)}</span>
            {!isCurrent && (
              <span style={s.actions}>
                <Button kind="ghost" size="sm" onClick={() => setDiffOf(v)}>
                  {t("versions.diff")}
                </Button>
                <Button kind="secondary" size="sm" onClick={() => setRestoreOf(v)}>
                  {t("versions.restore")}
                </Button>
              </span>
            )}
          </div>
        );
      })}

      {diffOf && (
        <VersionDiffModal
          fromVersion={diffOf.version}
          fromBody={diffOf.body}
          toVersion={skill.version}
          toBody={skill.body}
          onClose={() => setDiffOf(null)}
        />
      )}
      {restoreOf && (
        <ConfirmDialog
          title={t("versions.restoreTitle", { version: restoreOf.version })}
          message={t("versions.restoreBody", { version: restoreOf.version })}
          confirmLabel={t("versions.restore")}
          isDestructive={false}
          isPending={restore.isPending}
          onConfirm={confirmRestore}
          onCancel={() => setRestoreOf(null)}
        />
      )}
    </div>
  );
}
