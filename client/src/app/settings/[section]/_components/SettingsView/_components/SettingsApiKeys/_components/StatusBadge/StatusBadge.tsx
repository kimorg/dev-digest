"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "./styles";

/** "Configured / Not set" pill driven by GET /settings/secrets-status. */
interface StatusBadgeProps {
  /** undefined while the status is still loading (renders nothing). */
  configured: boolean | undefined;
}

export function StatusBadge({ configured }: StatusBadgeProps) {
  const t = useTranslations("settings");
  if (configured === undefined) return null; // status still loading
  return (
    <span style={s.badge(configured)}>
      <span style={s.badgeDot(configured)} />
      {configured ? t("apiKeys.configured") : t("apiKeys.notSet")}
    </span>
  );
}
