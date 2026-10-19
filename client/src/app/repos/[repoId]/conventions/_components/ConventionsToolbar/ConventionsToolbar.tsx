/* ConventionsToolbar — above the candidate list: Accept all / Deselect all,
   "N of M accepted", and Create skill once at least one candidate is accepted. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export interface ConventionsToolbarProps {
  accepted: number;
  total: number;
  isBusy?: boolean;
  onAcceptAll: () => void;
  onDeselectAll: () => void;
  onCreateSkill: () => void;
}

export function ConventionsToolbar({
  accepted,
  total,
  isBusy = false,
  onAcceptAll,
  onDeselectAll,
  onCreateSkill,
}: ConventionsToolbarProps) {
  const t = useTranslations("conventions");
  const isAllAccepted = total > 0 && accepted === total;

  return (
    <div style={s.bar}>
      {isAllAccepted ? (
        <Button kind="secondary" icon="X" onClick={onDeselectAll} disabled={isBusy}>
          {t("toolbar.deselectAll")}
        </Button>
      ) : (
        <Button kind="secondary" icon="Check" onClick={onAcceptAll} disabled={isBusy}>
          {t("toolbar.acceptAll")}
        </Button>
      )}
      <span style={s.count}>{t("toolbar.acceptedCount", { accepted, total })}</span>
      {accepted > 0 && (
        <div style={s.right}>
          <Button kind="primary" icon="Sparkles" onClick={onCreateSkill}>
            {t("toolbar.createSkill")}
          </Button>
        </div>
      )}
    </div>
  );
}
