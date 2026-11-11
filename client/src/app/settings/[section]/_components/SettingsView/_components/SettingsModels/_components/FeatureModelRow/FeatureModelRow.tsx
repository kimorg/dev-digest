"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, SearchableSelect } from "@devdigest/ui";
import type { FeatureModelChoice, FeatureModelDef, Provider } from "@/lib/types";
import { useProviderModels } from "@/lib/hooks/agents";
import { toModelOptions, withCurrentModel, isModelListEmpty } from "@/lib/model-label";
import { FEATURE_PROVIDER_OPTIONS } from "../../constants";
import { s } from "./styles";

interface FeatureModelRowProps {
  feature: FeatureModelDef;
  /** The workspace's saved choice; `undefined` = the registry default is in use. */
  chosen: FeatureModelChoice | undefined;
  /** Persist a provider + model pair; `onSuccess` runs once the save lands. */
  onSave: (choice: FeatureModelChoice, opts: { onSuccess: () => void }) => void;
}

/**
 * One feature's provider + model pickers, on one line. The model list is the
 * picked provider's (live from the API). Switching the provider saves nothing:
 * the old model belongs to the old provider, so the pair is saved only once a
 * model of the new provider is picked.
 */
export function FeatureModelRow({ feature, chosen, onSave }: FeatureModelRowProps) {
  const t = useTranslations("settings");
  const saved = chosen ?? { provider: feature.defaultProvider, model: feature.defaultModel };
  const [pendingProvider, setPendingProvider] = React.useState<Provider | null>(null);
  // A pending provider that the save already caught up with is no longer pending.
  const isPending = pendingProvider !== null && pendingProvider !== saved.provider;
  const provider = isPending ? pendingProvider : saved.provider;
  const model = isPending ? "" : saved.model;

  const { data: models } = useProviderModels(provider);
  const baseOptions = toModelOptions(models);
  const options = model ? withCurrentModel(baseOptions, model) : baseOptions;
  const noModels = isModelListEmpty(models);

  const changeProvider = (value: string) =>
    setPendingProvider(value === saved.provider ? null : (value as Provider));
  const changeModel = (value: string) =>
    onSave({ provider, model: value }, { onSuccess: () => setPendingProvider(null) });

  return (
    <div style={s.row} data-testid={`feature-model-${feature.id}`}>
      <FormField
        label={
          <>
            {feature.label}
            {!chosen && <span style={s.defaultTag}>{t("models.usingDefault")}</span>}
          </>
        }
        hint={
          <>
            {feature.description}
            {noModels && <div style={s.emptyHint}>{t("models.noModels", { provider })}</div>}
          </>
        }
      >
        <div style={s.pickers}>
          <div style={s.provider}>
            <SelectInput value={provider} onChange={changeProvider} options={[...FEATURE_PROVIDER_OPTIONS]} />
          </div>
          <div style={s.model}>
            <SearchableSelect
              value={model}
              onChange={changeModel}
              options={options}
              placeholder={isPending ? t("models.pickModel") : t("models.search")}
            />
          </div>
        </div>
      </FormField>
    </div>
  );
}
