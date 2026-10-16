/* SeverityCounts — static "⊘ 2  ⚠ 2  💡 2": one count per severity present,
   no interaction. The building block of FindingsSeverityCounts' hover cell, and
   usable on its own wherever counts have no findings list to open. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingsCounts } from "@devdigest/shared";
import { SEVERITY_KEYS } from "./helpers";
import { s } from "./FindingsSeverityCounts.styles";

interface SeverityCountsProps {
  counts: FindingsCounts;
}

export function SeverityCounts({ counts }: SeverityCountsProps) {
  const t = useTranslations("common");
  return (
    <>
      {SEVERITY_KEYS.filter(({ key }) => counts[key] > 0).map(({ severity, key }) => {
        const count = counts[key];
        const meta = SEV[severity];
        const I = Icon[meta.icon];
        return (
          <span
            key={severity}
            className="tnum"
            aria-label={t("findingsSeverity.countAria", { count, severity: t(`findingsSeverity.label.${severity}`) })}
            style={s.count(meta.c)}
          >
            <I size={14} />
            {count}
          </span>
        );
      })}
    </>
  );
}
