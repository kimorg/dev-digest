/* Skill Config tab — edit name / description / type / body. Saving a changed
   body creates a new version on the server. Seeded once per skill version: the
   parent remounts it (`key`) when the id or version changes. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SkillFields } from "../../../SkillFields";
import { isNameTakenError, isSkillFormComplete, toSkillForm, type SkillForm } from "../../../SkillFields/helpers";
import { changedFields, estimateTokens, toSkillFileName } from "./helpers";
import { s } from "./styles";

export interface ConfigTabProps {
  skill: SkillListItem;
}

export function ConfigTab({ skill }: ConfigTabProps) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [form, setForm] = React.useState<SkillForm>(() => toSkillForm(skill));
  const patch = changedFields(form, skill);
  const isDirty = Object.keys(patch).length > 0;

  const save = () =>
    update.mutate(
      { id: skill.id, patch },
      { onSuccess: (saved) => toast.success(t("config.savedToast", { version: saved.version })) },
    );

  return (
    <div style={s.wrap}>
      <SkillFields
        form={form}
        onChange={setForm}
        bodyRows={16}
        nameError={isNameTakenError(update.error) ? t("form.nameTaken") : undefined}
        bodyMeta={
          <span className="mono" style={s.bodyMeta}>
            {t("config.bodyMeta", { file: toSkillFileName(form.name), tokens: estimateTokens(form.body) })}
          </span>
        }
        bodyHint={t("config.versionHint")}
      />
      <div style={s.actions}>
        <Button
          kind="primary"
          icon="Check"
          onClick={save}
          disabled={!isDirty || !isSkillFormComplete(form) || update.isPending}
        >
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
      </div>
    </div>
  );
}
