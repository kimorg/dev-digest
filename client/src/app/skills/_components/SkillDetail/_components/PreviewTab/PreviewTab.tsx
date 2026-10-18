/* Skill Preview tab — the body rendered as formatted markdown. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";

export interface PreviewTabProps {
  body: string;
}

export function PreviewTab({ body }: PreviewTabProps) {
  const t = useTranslations("skills");
  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700 }}>{t("preview.title")}</h2>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" }}>{t("preview.subtitle")}</p>
      <div
        data-testid="skill-preview"
        style={{
          padding: "16px 20px",
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--bg-surface)",
          fontSize: 14,
        }}
      >
        <Markdown>{body}</Markdown>
      </div>
    </div>
  );
}
