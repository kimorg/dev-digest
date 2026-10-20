/* AgentCard — name, description, model chip, linked-skill count, enabled
   toggle and delete (with a confirmation dialog). Stats are an A5 mount. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useDeleteAgent } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { modelColor } from "./helpers";
import { s } from "./styles";

export interface AgentCardProps {
  ag: Agent;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  /** Called after this agent was deleted (e.g. leave its editor). */
  onDeleted?: () => void;
}

export function AgentCard({ ag, active, onClick, onToggle, onDeleted }: AgentCardProps) {
  const t = useTranslations("agents");
  const toast = useToast();
  const del = useDeleteAgent();
  const [isConfirming, setIsConfirming] = React.useState(false);
  const color = modelColor(ag.model);

  const confirmDelete = () =>
    del.mutate(ag.id, {
      onSuccess: () => {
        setIsConfirming(false);
        toast.success(t("card.deletedToast", { name: ag.name }));
        onDeleted?.();
      },
    });

  return (
    <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        {/* Keyboard entry point: its click bubbles to the card's onClick. */}
        <button type="button" style={s.name}>
          {ag.name}
        </button>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsConfirming(true);
          }}
          title={t("card.delete")}
          aria-label={t("card.delete")}
          style={s.deleteBtn}
        >
          <Icon.Trash size={14} />
        </button>
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.modelChip(color)}>
          {ag.model}
        </span>
        {ag.skill_count != null && (
          <Badge color="var(--text-secondary)" icon="Sparkles">
            {t("card.skillCount", { count: ag.skill_count })}
          </Badge>
        )}
      </div>
      {isConfirming && (
        // The dialog is portalled, but React events still bubble here: keep them off the card.
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title={t("card.deleteTitle")}
            message={t("card.deleteBody", { name: ag.name })}
            isPending={del.isPending}
            onConfirm={confirmDelete}
            onCancel={() => setIsConfirming(false)}
          />
        </div>
      )}
    </div>
  );
}
