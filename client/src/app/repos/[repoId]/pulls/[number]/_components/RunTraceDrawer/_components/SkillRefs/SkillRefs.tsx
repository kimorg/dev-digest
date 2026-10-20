/* SkillRefs — the skills a run injected, in prompt order, with their version
   and token weight (shown inside the trace's Skills block). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SkillRef } from "@devdigest/shared";
import { s } from "../../styles";

export interface SkillRefsProps {
  refs: SkillRef[];
}

export function SkillRefs({ refs }: SkillRefsProps) {
  const t = useTranslations("runs");
  if (refs.length === 0) return null;
  return (
    <ol style={s.skillRefs} data-testid="trace-skill-refs">
      {refs.map((r) => (
        <li key={r.id} style={s.skillRef}>
          <span>{t("trace.prompt.skillRef", { name: r.name, version: r.version })}</span>
          <span className="mono">{t("trace.prompt.tokens", { count: r.tokens })}</span>
        </li>
      ))}
    </ol>
  );
}
