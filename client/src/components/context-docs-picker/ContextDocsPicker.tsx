/* ContextDocsPicker — "Project context to use": the repo's docs with a checkbox to
   attach each to an agent or skill. Attached docs come first in saved order and
   can be dragged to reorder (that order is the prompt order); the rest follow by
   path. The caller owns the saved list (`paths`) and saves every change in full.
   Layout: the list column scrolls on its own; the preview panel sits to its right. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useContextDocuments } from "@/lib/hooks/context";
import { ContextDocRow } from "./ContextDocRow";
import { ContextPickerHeader } from "./ContextPickerHeader";
import { ContextPreviewPanel } from "./ContextPreviewPanel";
import { SortableContextDocRow } from "./SortableContextDocRow";
import { matchesPath, moveAttached, sumAttachedTokens, toContextRows, toggleAttached } from "./helpers";
import { s } from "./styles";

/** Pointer travel before a press on the grip becomes a drag (keeps clicks clicks). */
const DRAG_ACTIVATION_PX = 4;

export interface ContextDocsPickerProps {
  /** The active repository; null until one is selected. */
  repoId: string | null;
  /** Saved attachments, in prompt order. */
  paths: string[];
  /** Extra line under the subtitle (the agent tab's via-skills total). */
  extra?: React.ReactNode;
  onChange: (paths: string[]) => void;
}

export function ContextDocsPicker({ repoId, paths, extra, onChange }: ContextDocsPickerProps) {
  const t = useTranslations("context");
  const docs = useContextDocuments(repoId);
  const [query, setQuery] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const closePreview = React.useCallback(() => {
    setPreviewPath(null);
    triggerRef.current?.focus();
  }, []);

  if (!repoId) return <p style={s.note}>{t("picker.noRepo")}</p>;
  if (docs.isLoading) return <Skeleton height={160} />;
  if (docs.isError || !docs.data) return <ErrorState body={t("picker.loadError")} onRetry={() => docs.refetch()} />;
  if (docs.data.status === "no_clone") {
    return <EmptyState icon="FileText" title={t("noClone.title")} body={t("noClone.body")} />;
  }

  const documents = docs.data.documents;
  const { attached, unattached } = toContextRows(documents, paths);
  const tokens = sumAttachedTokens(attached);
  // Reordering a filtered subset would hide where a row lands — drag only on the full list.
  const isFiltering = query.trim().length > 0;
  const visibleAttached = attached.filter((r) => matchesPath(r, query));
  const visibleUnattached = unattached.filter((r) => matchesPath(r, query));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const next = moveAttached(paths, String(active.id), String(over.id));
    if (next !== paths) onChange(next);
  };
  const preview = (path: string) => (trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setPreviewPath(path);
  };

  return (
    <div style={s.wrap} data-testid="context-docs-picker">
      <div style={s.column(previewPath !== null)}>
        <ContextPickerHeader
          attached={attached.length}
          total={documents.length}
          tokens={tokens}
          query={query}
          onQuery={setQuery}
          extra={extra}
        />
        {isFiltering && attached.length > 1 && <p style={s.note}>{t("picker.filterDragHint")}</p>}

        <div style={s.list}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={paths} strategy={verticalListSortingStrategy}>
              {visibleAttached.map((r) => (
                <SortableContextDocRow
                  key={r.path}
                  row={r}
                  isDragDisabled={isFiltering}
                  onToggle={(isOn) => onChange(toggleAttached(paths, r.path, isOn))}
                  onPreview={preview(r.path)}
                />
              ))}
            </SortableContext>
          </DndContext>
          {visibleUnattached.map((r) => (
            <ContextDocRow
              key={r.path}
              row={r}
              isAttached={false}
              onToggle={(isOn) => onChange(toggleAttached(paths, r.path, isOn))}
              onPreview={preview(r.path)}
            />
          ))}
          {visibleAttached.length + visibleUnattached.length === 0 && (
            <div style={s.note}>{isFiltering ? t("picker.noMatch") : t("empty.title")}</div>
          )}
        </div>
      </div>
      {previewPath && <ContextPreviewPanel repoId={repoId} path={previewPath} onClose={closePreview} />}
    </div>
  );
}
