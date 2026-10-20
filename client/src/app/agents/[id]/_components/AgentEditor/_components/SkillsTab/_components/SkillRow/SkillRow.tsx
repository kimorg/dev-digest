/* SkillRow — one skill on the agent's Skills tab: [grip] toggle, name, type,
   and its #position when linked. A globally disabled skill is dimmed: it stays
   linked but the run skips it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { SKILL_TYPE_BG, SKILL_TYPE_COLOR } from "@/lib/skill-type";
import { s } from "./styles";

export interface SkillRowProps {
  skill: SkillListItem;
  /** 1-based prompt position; set only for linked skills. */
  position?: number;
  /** Drag handle (linked rows only). */
  handle?: React.ReactNode;
  isDragging?: boolean;
  onToggle: (isOn: boolean) => void;
}

export function SkillRow({ skill, position, handle, isDragging = false, onToggle }: SkillRowProps) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
  const isLinked = position !== undefined;
  return (
    <div style={s.row(isLinked, isDragging)} data-testid="agent-skill-row" data-linked={isLinked}>
      <span style={s.handleSlot}>{handle}</span>
      <span title={t("skills.toggle", { name: skill.name })}>
        <Toggle on={isLinked} onChange={onToggle} size={14} />
      </span>
      <span style={s.name(!skill.enabled)}>{skill.name}</span>
      {!skill.enabled && <span style={s.disabled}>{t("skills.disabledLabel")}</span>}
      <span style={s.type(SKILL_TYPE_COLOR[skill.type], SKILL_TYPE_BG[skill.type])}>
        {tSkills(`type.${skill.type}`)}
      </span>
      <span className="mono" style={s.position}>
        {isLinked ? t("skills.position", { n: position }) : ""}
      </span>
    </div>
  );
}
