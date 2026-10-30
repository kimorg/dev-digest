/* DiffOrderToggle — segmented "Smart order | Original order" control. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { DiffOrder } from "../../constants";
import { s } from "./styles";

interface DiffOrderToggleProps {
  value: DiffOrder;
  onChange: (order: DiffOrder) => void;
}

export function DiffOrderToggle({ value, onChange }: DiffOrderToggleProps) {
  const t = useTranslations("prReview");
  return (
    <div role="group" aria-label={t("smartDiff.orderLabel")} style={s.group}>
      <Button kind="tertiary" size="sm" active={value === "smart"} aria-pressed={value === "smart"} onClick={() => onChange("smart")}>
        {t("smartDiff.smartOrder")}
      </Button>
      <Button
        kind="tertiary"
        size="sm"
        active={value === "original"}
        aria-pressed={value === "original"}
        onClick={() => onChange("original")}
      >
        {t("smartDiff.originalOrder")}
      </Button>
    </div>
  );
}
