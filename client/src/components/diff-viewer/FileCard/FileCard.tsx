/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { isAutoExpanded, parsePatch, type Line } from "../helpers";
import { partitionAnnotations, type DiffAnnotation, type DiffAnnotationApi } from "../annotations";
import { lineKey } from "../comments";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { UnplacedAnnotations } from "../UnplacedAnnotations";
import { UNSTYLED_BUTTON } from "@/lib/unstyled-button";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Annotations anchored to a given parsed line (new-file side only). */
function annotationsForLine(ln: Line, byKey: Map<string, DiffAnnotation[]>): DiffAnnotation[] {
  if (byKey.size === 0 || (ln.kind !== "add" && ln.kind !== "ctx")) return [];
  const key = lineKey("RIGHT", ln.newNo);
  return (key && byKey.get(key)) || [];
}

interface FileCardProps {
  file: PrFile;
  commenting?: DiffCommentApi;
  annotations?: DiffAnnotationApi;
  /** Controlled expansion; without it the card manages its own state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function FileCard({ file, commenting, annotations, open, onOpenChange }: FileCardProps) {
  const t = useTranslations("shell");
  const [internalOpen, setInternalOpen] = React.useState(isAutoExpanded(file));
  const isOpen = open ?? internalOpen;
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  const toggle = () => {
    if (open === undefined) setInternalOpen(!isOpen);
    onOpenChange?.(!isOpen);
  };

  const fileAnnotations = annotations?.forFile(file.path);
  const renderedKeys = new Set<string>();
  if (fileAnnotations && fileAnnotations.length > 0) {
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
  }
  const { byKey, unplaced } = partitionAnnotations(fileAnnotations ?? [], renderedKeys);
  const isFlagged = !!fileAnnotations?.some((a) => a.mark);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={toggle}
        style={{ ...UNSTYLED_BUTTON, ...s.fileHeader }}
      >
        <Icon.ChevronRight size={13} style={chevronFor(isOpen)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span style={s.fileMain}>
          <span className="mono" style={s.filePath}>
            {file.path}
          </span>
          {isFlagged && <span role="img" aria-label={annotations?.flagLabel} style={s.fileDot} />}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </button>
      {isOpen && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                annotations={annotationsForLine(ln, byKey)}
                showAnnotations={!!annotations?.show}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {annotations?.show && <UnplacedAnnotations items={unplaced} title={annotations.unplacedTitle} />}
        </div>
      )}
    </div>
  );
}
