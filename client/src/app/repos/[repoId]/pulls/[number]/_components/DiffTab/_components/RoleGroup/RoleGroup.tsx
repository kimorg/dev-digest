/* RoleGroup — one smart-diff group: coloured header (label, hint, files with
   findings, file count, expand-all) and, when open, its files in a DiffViewer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { DiffViewer, type DiffAnnotationApi, type DiffCommentApi } from "@/components/diff-viewer";
import { UNSTYLED_BUTTON } from "@/lib/unstyled-button";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import { ROLE_META } from "../../constants";
import { groupDefaultOpen } from "../../helpers";
import { useGroupFileOpen } from "./hooks/useGroupFileOpen";
import { s, chevronFor, swatchFor } from "./styles";

interface RoleGroupProps {
  role: SmartDiffRole;
  files: PrFile[];
  /** Files in this group that carry a live finding. */
  flaggedCount: number;
  commenting: DiffCommentApi;
  annotations: DiffAnnotationApi;
}

export function RoleGroup({ role, files, flaggedCount, commenting, annotations }: RoleGroupProps) {
  const t = useTranslations("prReview");
  const meta = ROLE_META[role];
  const label = t(`smartDiff.${meta.labelKey}`);
  const isEmpty = files.length === 0;
  const [groupOpen, setGroupOpen] = React.useState(() => groupDefaultOpen(role, files));
  const { api, allOpen, setAll } = useGroupFileOpen(files);
  const isFullyOpen = groupOpen && allOpen;

  const toggleAll = () => {
    if (isFullyOpen) {
      setAll(false);
    } else {
      setGroupOpen(true);
      setAll(true);
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <button
          type="button"
          aria-expanded={groupOpen}
          disabled={isEmpty}
          onClick={() => setGroupOpen((o) => !o)}
          style={{ ...UNSTYLED_BUTTON, ...s.toggle, cursor: isEmpty ? "default" : "pointer" }}
        >
          <Icon.ChevronRight size={13} style={chevronFor(groupOpen, isEmpty)} />
          <span style={swatchFor(meta.color)} />
          <span style={s.label}>{label}</span>
          <span style={s.hint}>{t(`smartDiff.${meta.hintKey}`)}</span>
        </button>
        {flaggedCount > 0 && (
          <span style={s.flagged} aria-label={t("smartDiff.filesWithFindings", { count: flaggedCount })}>
            <span style={s.flaggedDot} />
            {flaggedCount}
          </span>
        )}
        <span className="tnum" style={s.count}>
          {t("smartDiff.filesCount", { count: files.length })}
        </span>
        {!isEmpty && (
          <Button
            kind="ghost"
            size="sm"
            icon="ChevronsUpDown"
            aria-label={t(isFullyOpen ? "smartDiff.collapseAll" : "smartDiff.expandAll", { group: label })}
            onClick={toggleAll}
          />
        )}
      </div>
      {groupOpen && !isEmpty && (
        <div style={s.body}>
          <DiffViewer files={files} commenting={commenting} annotations={annotations} fileOpen={api} />
        </div>
      )}
    </div>
  );
}
