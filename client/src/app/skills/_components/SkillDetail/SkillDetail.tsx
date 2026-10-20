/* SkillDetail — the right pane of /skills/:id: name, version, global enabled
   toggle, and the Config / Preview / Versions tabs (tab lives in ?tab=). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Tabs, Toggle } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab";
import { SKILL_TABS } from "./constants";
import { s } from "./styles";

export interface SkillDetailProps {
  skill: SkillListItem;
  tab: string;
  onTab: (tab: string) => void;
}

export function SkillDetail({ skill, tab, onTab }: SkillDetailProps) {
  const t = useTranslations("skills");
  const update = useUpdateSkill();
  const tabs = SKILL_TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <Icon.Sparkles size={18} style={s.icon} />
        <h1 style={s.title}>{skill.name}</h1>
        <Badge mono>{t("detail.version", { version: skill.version })}</Badge>
        <label style={s.enabled}>
          {t("detail.enabled")}
          <Toggle on={skill.enabled} onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })} size={16} />
        </label>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "preview" && <PreviewTab body={skill.body} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
        {tab === "config" && <ConfigTab key={`${skill.id}:${skill.version}`} skill={skill} />}
      </div>
    </div>
  );
}
