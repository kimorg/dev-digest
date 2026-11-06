/* SortableContextDocRow — an attached ContextDocRow made draggable with dnd-kit; the row
   itself moves (lifted, accent border) and the others shift, as in the agent Skills tab.
   Only the grip starts a drag (pointer or keyboard: Space, arrows, Space). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@devdigest/ui";
import { ContextDocRow, type ContextDocRowProps } from "./ContextDocRow";
import { s } from "./styles";

export interface SortableContextDocRowProps extends Omit<ContextDocRowProps, "isAttached" | "isDragging" | "handle"> {
  isDragDisabled: boolean;
}

export function SortableContextDocRow({ isDragDisabled, ...rowProps }: SortableContextDocRowProps) {
  const t = useTranslations("context");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: rowProps.row.path, disabled: isDragDisabled });

  return (
    <div ref={setNodeRef} style={s.item(CSS.Transform.toString(transform), transition, isDragging)}>
      <ContextDocRow
        {...rowProps}
        isAttached
        isDragging={isDragging}
        handle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={t("picker.dragHandle", { path: rowProps.row.path })}
            data-testid="context-doc-drag-handle"
            disabled={isDragDisabled}
            style={s.handle(isDragDisabled, isDragging)}
            {...attributes}
            {...listeners}
          >
            <Icon.GripVertical size={16} />
          </button>
        }
      />
    </div>
  );
}
