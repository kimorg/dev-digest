/* AddSkillModal — "Add Skill": write a new skill (Create) or import one from a
   .md / .zip file (From file). Calls onCreated with the saved skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Tabs } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { CreateSkillForm } from "./_components/CreateSkillForm";
import { ImportSkillForm } from "./_components/ImportSkillForm";

type AddTab = "create" | "file";

export interface AddSkillModalProps {
  onClose: () => void;
  onCreated: (skill: SkillListItem) => void;
}

export function AddSkillModal({ onClose, onCreated }: AddSkillModalProps) {
  const t = useTranslations("skills");
  const [tab, setTab] = React.useState<AddTab>("create");
  const tabs = [
    { key: "create", label: t("add.tabs.create"), icon: "Edit" as const },
    { key: "file", label: t("add.tabs.file"), icon: "Upload" as const },
  ];
  return (
    <Modal width={680} title={t("add.title")} onClose={onClose}>
      <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as AddTab)} pad="0 24px" />
      {tab === "create" ? <CreateSkillForm onCreated={onCreated} /> : <ImportSkillForm onCreated={onCreated} />}
    </Modal>
  );
}
