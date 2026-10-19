/* CreateSkillForm — the "Create" tab: the four skill fields + Create skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { isNameTakenError } from "@/lib/skill-form";
import { useCreateSkill } from "@/lib/hooks/skills";
import { SkillFields } from "../../../SkillFields";
import {
  EMPTY_SKILL_FORM,
  isSkillFormComplete,
  toSkillPayload,
  type SkillForm,
} from "../../../SkillFields/helpers";
import { s } from "../../styles";

export interface CreateSkillFormProps {
  onCreated: (skill: SkillListItem) => void;
}

export function CreateSkillForm({ onCreated }: CreateSkillFormProps) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const [form, setForm] = React.useState<SkillForm>(EMPTY_SKILL_FORM);

  const submit = () =>
    create.mutate({ ...toSkillPayload(form), source: "manual" }, { onSuccess: onCreated });

  return (
    <div style={s.body}>
      <SkillFields
        form={form}
        onChange={setForm}
        bodyRows={8}
        nameError={isNameTakenError(create.error) ? t("form.nameTaken") : undefined}
      />
      <div style={s.submitRow}>
        <Button
          kind="primary"
          full
          onClick={submit}
          disabled={!isSkillFormComplete(form) || create.isPending}
          loading={create.isPending}
        >
          {create.isPending ? t("add.creating") : t("add.create")}
        </Button>
      </div>
    </div>
  );
}
