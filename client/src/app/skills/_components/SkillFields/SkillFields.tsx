/* SkillFields — the four fields of a skill (name, directive description, type,
   markdown body). Shared by the Add Skill modal (create + import draft) and the
   skill's Config tab. Controlled: the parent owns the form state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "@/lib/skill-type";
import type { SkillForm } from "./helpers";

export interface SkillFieldsProps {
  form: SkillForm;
  onChange: (form: SkillForm) => void;
  /** Inline error under the name (e.g. the name is taken). */
  nameError?: string;
  /** Shown right of the body label (file name · token estimate). */
  bodyMeta?: React.ReactNode;
  /** Shown under the body. */
  bodyHint?: React.ReactNode;
  bodyRows?: number;
}

export function SkillFields({ form, onChange, nameError, bodyMeta, bodyHint, bodyRows = 12 }: SkillFieldsProps) {
  const t = useTranslations("skills");
  const set =
    <K extends keyof SkillForm>(key: K) =>
    (value: SkillForm[K]) =>
      onChange({ ...form, [key]: value });
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`typeOption.${v}`) }));

  return (
    <>
      <FormField
        label={t("form.name")}
        required
        hint={nameError ? <span style={{ color: "var(--crit)" }}>{nameError}</span> : undefined}
      >
        <TextInput
          value={form.name}
          onChange={set("name")}
          placeholder={t("form.namePlaceholder")}
          aria-label={t("form.name")}
          aria-invalid={nameError ? true : undefined}
        />
      </FormField>
      <FormField label={t("form.description")} required hint={t("form.descriptionHint")}>
        <TextInput
          value={form.description}
          onChange={set("description")}
          placeholder={t("form.descriptionPlaceholder")}
          aria-label={t("form.description")}
        />
      </FormField>
      <FormField label={t("form.type")}>
        <SelectInput value={form.type} onChange={(v) => set("type")(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("form.body")} required right={bodyMeta} hint={bodyHint}>
        <Textarea
          value={form.body}
          onChange={set("body")}
          placeholder={t("form.bodyPlaceholder")}
          rows={bodyRows}
          mono
        />
      </FormField>
    </>
  );
}
