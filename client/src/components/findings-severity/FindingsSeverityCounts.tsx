/* FindingsSeverityCounts — "⊘ 2  ⚠ 2  💡 2": one clickable count per
   severity (zero counts hidden). Clicking a count opens FindingsPopover with
   that severity's findings; clicking it again (or Esc / outside) closes it.
   Used by the PR list FINDINGS column (whole PR, fetched lazily by prId) and
   the Agent-runs timeline (one run, findings already in memory). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord, FindingsCounts, Severity } from "@devdigest/shared";
import { FindingsPopover } from "./FindingsPopover";
import { SEVERITY_KEYS } from "./helpers";

const s = {
  wrap: { display: "inline-flex", alignItems: "center", gap: 10 } satisfies React.CSSProperties,
  button: (color: string, open: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "1px 0",
    border: "none",
    borderBottom: `1px dotted ${color}`,
    background: open ? "var(--bg-hover)" : "none",
    borderRadius: 0,
    color,
    font: "inherit",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  }),
  none: { color: "var(--text-muted)" } satisfies React.CSSProperties,
} as const;

export function FindingsSeverityCounts({
  counts,
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  counts: FindingsCounts | null | undefined;
  /** This scope's findings (timeline run). When absent, the popover fetches `prId`'s reviews. */
  findings?: FindingRecord[];
  prId?: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = React.useState<{ severity: Severity; anchor: HTMLElement } | null>(null);
  const close = React.useCallback(() => setOpen(null), []);

  const shown = SEVERITY_KEYS.filter(({ key }) => (counts?.[key] ?? 0) > 0);
  if (!counts || shown.length === 0) {
    return (
      <span data-testid="findings-severity-none" style={s.none}>
        —
      </span>
    );
  }

  return (
    // Clicks (incl. ones bubbling out of the portalled popover) must not reach
    // a clickable parent such as the PR row.
    <span
      data-testid="findings-severity"
      style={s.wrap}
      onClick={(e) => e.stopPropagation()}
    >
      {shown.map(({ severity, key }) => {
        const count = counts[key];
        const meta = SEV[severity];
        const I = Icon[meta.icon];
        const isOpen = open?.severity === severity;
        return (
          <button
            key={severity}
            type="button"
            className="tnum"
            aria-label={t("findingsSeverity.countAria", {
              count,
              severity: t(`findingsSeverity.label.${severity}`),
            })}
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            onClick={(e) => {
              const anchor = e.currentTarget;
              setOpen((cur) => (cur?.severity === severity ? null : { severity, anchor }));
            }}
            style={s.button(meta.c, isOpen)}
          >
            <I size={14} />
            {count}
          </button>
        );
      })}
      {open && (
        <FindingsPopover
          anchor={open.anchor}
          severity={open.severity}
          count={counts[SEVERITY_KEYS.find((k) => k.severity === open.severity)!.key]}
          findings={findings}
          prId={prId}
          repoFullName={repoFullName}
          headSha={headSha}
          onClose={close}
        />
      )}
    </span>
  );
}
