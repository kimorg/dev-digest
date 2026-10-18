/* PromptBlock — one labelled, collapsible prompt segment with copy + fullscreen
   actions; fullscreen opens PromptModalBody in a Modal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal } from "@devdigest/ui";
import { s } from "../../styles";
import { PromptModalBody } from "../PromptModalBody";
import { COPIED_FEEDBACK_MS } from "../../constants";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";

const miniBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 4,
  borderRadius: 5,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text-muted)",
  cursor: "pointer",
};

export interface PromptBlockProps {
  label: string;
  text: string;
  color: string;
  /** Token weight of this block; null/undefined (absent slot, pre-L02 trace) → not shown. */
  tokens?: number | null;
  /** Extra content shown above the text when expanded (e.g. the skills used). */
  details?: React.ReactNode;
}

export function PromptBlock({ label, text, color, tokens, details }: PromptBlockProps) {
  const t = useTranslations("runs");
  const [open, setOpen] = React.useState(false);
  const [full, setFull] = React.useState(false);
  const { copied, copy: copyText } = useCopyToClipboard(COPIED_FEEDBACK_MS);
  const copy = () => copyText(text || "");
  return (
    <div style={s.promptRow}>
      <div onClick={() => setOpen((o) => !o)} style={s.promptHead}>
        <span style={s.promptDot(color)} />
        <span style={s.promptLabel}>{label}</span>
        {tokens != null && (
          <span className="mono" style={s.promptTokens} data-testid="prompt-block-tokens">
            {t("trace.prompt.tokens", { count: tokens })}
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            title={t("trace.prompt.copy")}
            aria-label={t("trace.prompt.copy")}
            onClick={(e) => {
              e.stopPropagation();
              copy();
            }}
            style={miniBtnStyle}
          >
            {copied ? <Icon.Check size={12} /> : <Icon.Copy size={12} />}
          </button>
          <button
            type="button"
            title={t("trace.prompt.fullscreen")}
            aria-label={t("trace.prompt.fullscreen")}
            onClick={(e) => {
              e.stopPropagation();
              setFull(true);
            }}
            style={miniBtnStyle}
          >
            <Icon.ExternalLink size={12} />
          </button>
          {/* Keyboard entry point for the header toggle (its click bubbles up). */}
          <button
            type="button"
            aria-expanded={open}
            style={{ ...s.textBtn, fontSize: 12, color: "var(--text-muted)" }}
          >
            {open ? t("trace.collapse") : t("trace.expand")}
          </button>
        </span>
      </div>
      {open && details}
      {open && (
        <pre className="mono" style={s.promptPre}>
          {text || "—"}
        </pre>
      )}
      {full && (
        <Modal
          width={1200}
          title={label}
          onClose={() => setFull(false)}
          footer={
            <Button kind="secondary" size="sm" icon={copied ? "Check" : "Copy"} onClick={copy}>
              {copied ? t("drawer.copied") : t("trace.prompt.copy")}
            </Button>
          }
        >
          <PromptModalBody text={text} />
        </Modal>
      )}
    </div>
  );
}
