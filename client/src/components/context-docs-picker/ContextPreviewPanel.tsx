/* ContextPreviewPanel — inline side panel (right of the list) with a document's path and rendered markdown.
   Closes with its × button or Esc; the caller restores focus to the trigger. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, IconBtn, Markdown, Skeleton } from "@devdigest/ui";
import { useContextFile } from "@/lib/hooks/context";
import { s } from "./styles";

export interface ContextPreviewPanelProps {
  repoId: string;
  path: string;
  onClose: () => void;
}

export function ContextPreviewPanel({ repoId, path, onClose }: ContextPreviewPanelProps) {
  const t = useTranslations("context");
  const file = useContextFile(repoId, path);
  const panelRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label={t("picker.previewTitle", { path })}
      style={s.panel}
    >
      <div style={s.panelHead}>
        <span className="mono" style={s.panelPath}>
          {path}
        </span>
        <IconBtn icon="X" label={t("picker.closePreview")} onClick={onClose} />
      </div>
      <div style={s.panelBody}>
        {file.isLoading && <Skeleton height={160} />}
        {file.isError && <ErrorState body={t("doc.loadError")} onRetry={() => file.refetch()} />}
        {file.data && <Markdown>{file.data.content}</Markdown>}
      </div>
    </aside>
  );
}
