/* Toaster — the on-screen stack of system notifications (bottom-right). Purely
   presentational: lib/toast.tsx owns the queue, timers and the notify bridge. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { TOAST_KIND_META } from "./constants";
import { s } from "./styles";

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToasterProps {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}

export function Toaster({ items, onDismiss }: ToasterProps) {
  const t = useTranslations("common");
  return (
    <div style={s.stack} role="status" aria-live="polite">
      {items.map((item) => {
        const meta = TOAST_KIND_META[item.kind];
        return (
          <div key={item.id} style={s.toast(meta.bg, meta.border)}>
            <span style={s.glyph(meta.border)}>{meta.icon}</span>
            <span style={s.message}>{item.message}</span>
            <button type="button" onClick={() => onDismiss(item.id)} style={s.dismiss} aria-label={t("toast.dismiss")}>
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
