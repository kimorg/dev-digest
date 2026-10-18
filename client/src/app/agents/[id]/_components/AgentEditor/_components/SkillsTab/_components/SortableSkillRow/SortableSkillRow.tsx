/* SortableSkillRow — a linked SkillRow made draggable with dnd-kit. Only the
   grip starts a drag (pointer or keyboard: Space, arrows, Space). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { SkillRow } from "../SkillRow";
import { s } from "./styles";

export interface SortableSkillRowProps {
  skill: SkillListItem;
  position: number;
  isDragDisabled: boolean;
  onToggle: (isOn: boolean) => void;
}

export function SortableSkillRow({ skill, position, isDragDisabled, onToggle }: SortableSkillRowProps) {
  const t = useTranslations("agents");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: skill.id, disabled: isDragDisabled });

  return (
    <div
      ref={setNodeRef}
      style={s.item(CSS.Transform.toString(transform), transition, isDragging)}
    >
      <SkillRow
        skill={skill}
        position={position}
        isDragging={isDragging}
        onToggle={onToggle}
        handle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={t("skills.dragHandle", { name: skill.name })}
            data-testid="agent-skill-drag-handle"
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
