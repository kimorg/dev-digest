/* ContextPickerHeader — the picker's top block: title + counts pill + filter on one row,
   the subtitle, the caller's extra line and the large-context warning. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { LARGE_CONTEXT_TOKENS } from "./helpers";
import { s } from "./styles";

export interface ContextPickerHeaderProps {
  attached: number;
  total: number;
  tokens: number;
  query: string;
  onQuery: (query: string) => void;
  /** Extra line under the subtitle (the agent tab's via-skills total). */
  extra?: React.ReactNode;
}

export function ContextPickerHeader({ attached, total, tokens, query, onQuery, extra }: ContextPickerHeaderProps) {
  const t = useTranslations("context");
  return (
    <>
      <div style={s.head} data-testid="context-picker-header">
        <h2 style={s.h2}>{t("picker.section")}</h2>
        <span style={s.count}>{t("picker.counts", { attached, total, tokens })}</span>
        <label style={s.filterWrap}>
          <Icon.Search size={14} style={s.filterIcon} />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t("picker.filterPlaceholder")}
            aria-label={t("picker.filterPlaceholder")}
            style={s.filter}
          />
        </label>
      </div>
      <p style={s.subtitle}>
        {t.rich("picker.subtitle", { code: (chunks) => <code className="mono" style={s.code}>{chunks}</code> })}
      </p>
      {extra && <div style={s.extra}>{extra}</div>}
      {tokens > LARGE_CONTEXT_TOKENS && (
        <p style={s.warning} role="status">
          <Icon.AlertTriangle size={14} style={s.warningIcon} />
          {t("picker.largeWarning", { tokens })}
        </p>
      )}
    </>
  );
}
