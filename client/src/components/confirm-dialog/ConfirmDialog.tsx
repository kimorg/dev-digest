/* ConfirmDialog — a destructive-action confirmation on top of the kit Modal:
   title, message, Cancel, a red confirm button, the × close and Esc. Used to
   delete skills and agents (client/specs/003-skills.md). Portalled to <body> so
   an ancestor's opacity/transform (a disabled card) can't reach it; React
   events still bubble to the owner, so owners that sit inside a clickable card
   stop propagation around it. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";

export interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  /** Label of the destructive button; defaults to "Delete". */
  confirmLabel?: string;
  /** Red confirm button (default). False → a primary button, for reversible actions. */
  isDestructive?: boolean;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  isDestructive = true,
  isPending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useTranslations("common");

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPending, onCancel]);

  return createPortal(
    <Modal
      width={440}
      title={title}
      onClose={isPending ? undefined : onCancel}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="secondary" size="sm" onClick={onCancel} disabled={isPending}>
            {t("actions.cancel")}
          </Button>
          <Button
            kind={isDestructive ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            disabled={isPending}
            loading={isPending}
            data-testid="confirm-dialog-confirm"
          >
            {confirmLabel ?? t("confirmDialog.delete")}
          </Button>
        </div>
      }
    >
      <div style={{ padding: "16px 24px", fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        {message}
      </div>
    </Modal>,
    document.body,
  );
}
