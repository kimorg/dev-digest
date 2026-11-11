"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { useSettings, useUpdateSettings } from "@/lib/hooks/settings";
import { FEATURE_MODELS } from "@/lib/feature-models";
import type { FeatureModelChoice, FeatureModelId } from "@/lib/types";
import { SectionTitle } from "../SectionTitle";
import { FeatureModelRow } from "./_components/FeatureModelRow";
import { s } from "./styles";

/**
 * Settings → Feature Models. One provider + model picker per system LLM feature;
 * each row loads its provider's model list live (OpenRouter adds prices), and the
 * choice persists to `settings.feature_models`. Each feature falls back to its
 * registry default when unset.
 */
export function SettingsModels() {
  const t = useTranslations("settings");
  const { data: settings } = useSettings();
  const update = useUpdateSettings();

  const chosen = (settings?.feature_models ?? {}) as Partial<Record<FeatureModelId, FeatureModelChoice>>;

  const save = (id: FeatureModelId) => (choice: FeatureModelChoice, opts: { onSuccess: () => void }) =>
    update.mutate({ feature_models: { ...chosen, [id]: choice } }, opts);

  return (
    <div style={s.wrap}>
      <SectionTitle title={t("models.title")} body={t("models.body")} />

      {FEATURE_MODELS.map((f) => (
        <FeatureModelRow key={f.id} feature={f} chosen={chosen[f.id]} onSave={save(f.id)} />
      ))}

      <div style={s.note}>
        <Icon.Info size={15} style={s.noteIcon} />
        <span>{t("models.liveNote")}</span>
      </div>
    </div>
  );
}
