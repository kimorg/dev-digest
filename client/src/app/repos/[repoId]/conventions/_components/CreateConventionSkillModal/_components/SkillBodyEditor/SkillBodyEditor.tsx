/* SkillBodyEditor — the skill body as an editable markdown file: a header with
   the file name, an "unsaved" badge and a token estimate, then a line-number
   gutter next to a no-wrap monospace textarea (the gutter follows its scroll). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { estimateTokens } from "@/lib/skill-form";
import { s } from "./styles";

export interface SkillBodyEditorProps {
  value: string;
  onChange: (value: string) => void;
  fileName: string;
  label: string;
}

export function SkillBodyEditor({ value, onChange, fileName, label }: SkillBodyEditorProps) {
  const t = useTranslations("conventions");
  const gutter = React.useRef<HTMLDivElement>(null);
  const lineCount = value.split("\n").length;

  return (
    <div style={s.frame}>
      <div style={s.head}>
        <Icon.FileText size={14} />
        <span className="mono" style={s.fileName}>
          {fileName}
        </span>
        <Badge>{t("modal.unsaved")}</Badge>
        <span className="mono tnum" style={s.tokens}>
          {t("modal.tokens", { count: estimateTokens(value) })}
        </span>
      </div>
      <div style={s.body}>
        <div ref={gutter} style={s.gutter} aria-hidden="true" data-testid="skill-body-gutter">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          aria-label={label}
          className="mono"
          wrap="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
          }}
          style={s.textarea}
        />
      </div>
    </div>
  );
}
