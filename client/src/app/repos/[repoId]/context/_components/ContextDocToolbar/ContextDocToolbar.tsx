/* ContextDocToolbar — the icon-only toolbar above the docs list: Download the selected
   document, then Rescan. The Rescan hint is a tooltip (hover or focus), also its description. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { ContextDocument } from "@devdigest/shared";
import { useContextFile } from "@/lib/hooks/context";
import { baseName, downloadText } from "./helpers";
import { s } from "./styles";

export interface ContextDocToolbarProps {
  repoId: string;
  selected: ContextDocument | null;
  isRescanning: boolean;
  onRescan: () => void;
}

export function ContextDocToolbar({ repoId, selected, isRescanning, onRescan }: ContextDocToolbarProps) {
  const t = useTranslations("context");
  const hintId = React.useId();
  const [isHintOpen, setIsHintOpen] = React.useState(false);
  // Same query key as the preview pane, so this is one request.
  const file = useContextFile(repoId, selected && !selected.too_large ? selected.path : null);
  const content = file.data?.content;

  return (
    <div style={s.bar} data-testid="context-doc-toolbar">
      <Button
        kind="tertiary"
        icon="ArrowDown"
        aria-label={t("doc.download")}
        title={t("doc.download")}
        disabled={!selected || content === undefined}
        onClick={() => selected && content !== undefined && downloadText(baseName(selected.path), content)}
      />
      <span
        style={s.hintWrap}
        onMouseEnter={() => setIsHintOpen(true)}
        onMouseLeave={() => setIsHintOpen(false)}
        onFocus={() => setIsHintOpen(true)}
        onBlur={() => setIsHintOpen(false)}
      >
        <Button
          kind="tertiary"
          icon="RefreshCw"
          loading={isRescanning}
          aria-label={t("page.rescan")}
          aria-describedby={hintId}
          onClick={onRescan}
        />
        <span id={hintId} role="tooltip" hidden={!isHintOpen} style={s.tooltip}>
          {t("page.rescanHint")}
        </span>
      </span>
    </div>
  );
}
