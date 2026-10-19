/* CreateConventionSkillModal — "Create skill from conventions" (client/specs/004-conventions.md).
   Loads the server's draft (accepted candidates merged into one `convention`
   skill, default name repo-conventions); name, description, type, enabled and
   the whole body are editable before Create posts it as an `extracted` skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  ErrorState,
  FormField,
  Icon,
  Modal,
  SelectInput,
  Skeleton,
  TextInput,
  Toggle,
} from "@devdigest/ui";
import type { SkillListItem, SkillType } from "@devdigest/shared";
import { useConventionSkillDraft } from "@/lib/hooks/conventions";
import { useCreateSkill } from "@/lib/hooks/skills";
import { isNameTakenError, toSkillFileName } from "@/lib/skill-form";
import { SKILL_TYPES } from "@/lib/skill-type";
import { SkillBodyEditor } from "./_components/SkillBodyEditor";
import {
  isConventionSkillFormComplete,
  toConventionSkillForm,
  toCreateSkillRequest,
  type ConventionSkillForm,
} from "./helpers";
import { s } from "./styles";

export interface CreateConventionSkillModalProps {
  repoId: string;
  repoName: string;
  onClose: () => void;
  onCreated: (skill: SkillListItem) => void;
}

export function CreateConventionSkillModal({ repoId, repoName, onClose, onCreated }: CreateConventionSkillModalProps) {
  const t = useTranslations("conventions");
  const tSkills = useTranslations("skills");
  const draft = useConventionSkillDraft(repoId, true);
  const create = useCreateSkill();
  // null until the first edit: until then the form *is* the server's draft.
  const [edited, setEdited] = React.useState<ConventionSkillForm | null>(null);
  const form = edited ?? (draft.data ? toConventionSkillForm(draft.data) : null);

  const set = <K extends keyof ConventionSkillForm>(key: K) => (value: ConventionSkillForm[K]) => {
    if (form) setEdited({ ...form, [key]: value });
  };
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: tSkills(`typeOption.${v}`) }));
  const canCreate = !!form && isConventionSkillFormComplete(form) && !create.isPending;

  const submit = () => {
    if (!form || !draft.data) return;
    create.mutate(toCreateSkillRequest(form, draft.data.evidence_files), { onSuccess: onCreated });
  };

  const footer = (
    <div style={s.footer}>
      <span style={s.footerNote}>
        <Icon.GitCommit size={14} />
        {t("modal.footer")}
      </span>
      <Button kind="secondary" onClick={onClose}>
        {t("modal.cancel")}
      </Button>
      <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!canCreate} loading={create.isPending}>
        {create.isPending ? t("modal.creating") : t("modal.create")}
      </Button>
    </div>
  );

  return (
    <Modal width={760} title={t("modal.title")} subtitle={form?.name || draft.data?.name} onClose={onClose} footer={footer}>
      <div style={s.body}>
        {draft.isError ? (
          <ErrorState body={t("modal.draftError")} onRetry={() => draft.refetch()} />
        ) : !form || !draft.data ? (
          <Skeleton height={320} />
        ) : (
          <>
            <div style={s.banner} role="note">
              <Icon.Wrench size={16} style={s.bannerIcon} />
              <span>
                {t.rich("modal.banner", {
                  count: draft.data.convention_count,
                  repo: repoName,
                  b: (chunks) => <strong style={s.strong}>{chunks}</strong>,
                  accent: (chunks) => <span style={s.accent}>{chunks}</span>,
                })}
              </span>
            </div>

            <FormField
              label={t("modal.name")}
              required
              hint={isNameTakenError(create.error) ? <span style={s.error}>{t("modal.nameTaken")}</span> : undefined}
            >
              <TextInput
                value={form.name}
                onChange={set("name")}
                mono
                aria-label={t("modal.name")}
                aria-invalid={isNameTakenError(create.error) ? true : undefined}
              />
            </FormField>
            <FormField label={t("modal.description")} required>
              <TextInput value={form.description} onChange={set("description")} aria-label={t("modal.description")} />
            </FormField>
            <div style={s.row}>
              <FormField label={t("modal.type")}>
                <SelectInput value={form.type} onChange={(v) => set("type")(v as SkillType)} options={typeOptions} />
              </FormField>
              <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
                <div style={s.toggleRow}>
                  <Toggle on={form.enabled} onChange={set("enabled")} />
                </div>
              </FormField>
            </div>
            <FormField label={t("modal.body")} required>
              <SkillBodyEditor
                value={form.body}
                onChange={set("body")}
                fileName={toSkillFileName(form.name)}
                label={t("modal.body")}
              />
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
