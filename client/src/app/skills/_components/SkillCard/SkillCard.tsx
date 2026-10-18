/* SkillCard — one skill in the Skills list: name, type, enabled toggle, delete,
   description, source · version and how many agents link it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { SKILL_TYPE_BG, SKILL_TYPE_COLOR } from "@/lib/skill-type";
import { s } from "./styles";

export interface SkillCardProps {
  skill: SkillListItem;
  isActive?: boolean;
  onSelect?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
}

export function SkillCard({ skill, isActive = false, onSelect, onToggle, onDelete }: SkillCardProps) {
  const t = useTranslations("skills");
  return (
    <div onClick={onSelect} style={s.card(isActive, skill.enabled)} data-testid="skill-card">
      <div style={s.headerRow}>
        {/* Keyboard entry point: its click bubbles to the card's onSelect. */}
        <button type="button" style={s.name} title={skill.name} aria-current={isActive || undefined}>
          {skill.name}
        </button>
        <span style={s.typeLabel(SKILL_TYPE_COLOR[skill.type], SKILL_TYPE_BG[skill.type])}>
          {t(`type.${skill.type}`)}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()} title={t("card.toggle", { name: skill.name })}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title={t("card.delete", { name: skill.name })}
            aria-label={t("card.delete", { name: skill.name })}
            style={s.deleteBtn}
          >
            <Icon.Trash size={14} />
          </button>
        )}
      </div>
      {skill.description && <div style={s.description}>{skill.description}</div>}
      <div style={s.meta}>
        {t("card.meta", { source: t(`source.${skill.source}`), version: skill.version })}
        {!skill.enabled && <span style={s.disabled}>· {t("card.disabled")}</span>}
      </div>
      <div style={s.footer}>
        <Badge icon="Cpu">{t("card.agents", { count: skill.agent_count })}</Badge>
      </div>
    </div>
  );
}
