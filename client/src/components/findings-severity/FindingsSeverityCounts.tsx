/* FindingsSeverityCounts — "⊘ 2  ⚠ 2  💡 2": one count per severity (zero
   counts hidden), opening FindingsPopover. Two triggers:
   - "click" (default): each count is a button; clicking it opens that
     severity's findings, clicking again (or Esc / outside) closes it. Used by
     the Agent-runs timeline (one run, findings already in memory).
   - "hover": hovering (or focusing) the whole cell opens one popover with all
     findings, ordered by severity. Used by the PR list FINDINGS column (the
     PR's latest review, fetched lazily by prId). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord, FindingsCounts, Severity } from "@devdigest/shared";
import { FindingsPopover } from "./FindingsPopover";
import { HOVER_CLOSE_MS, HOVER_OPEN_MS } from "./constants";
import { SEVERITY_KEYS } from "./helpers";

const s = {
  wrap: (hover: boolean, open: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    ...(hover && {
      padding: "2px 4px",
      margin: "-2px -4px",
      borderRadius: 4,
      background: open ? "var(--bg-hover)" : "none",
      cursor: "default",
    }),
  }),
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
  count: (color: string): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "1px 0",
    borderBottom: `1px dotted ${color}`,
    color,
    fontSize: 13,
    fontWeight: 600,
  }),
  none: { color: "var(--text-muted)" } satisfies React.CSSProperties,
} as const;

type Open = { severity: Severity | null; anchor: HTMLElement };

export function FindingsSeverityCounts({
  counts,
  findings,
  prId,
  repoFullName,
  headSha,
  trigger = "click",
}: {
  counts: FindingsCounts | null | undefined;
  /** This scope's findings (timeline run). When absent, the popover fetches `prId`'s latest review. */
  findings?: FindingRecord[];
  prId?: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
  /** "click": per-severity buttons. "hover": the whole cell opens one popover with all findings. */
  trigger?: "click" | "hover";
}) {
  const t = useTranslations("common");
  const [open, setOpen] = React.useState<Open | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const close = React.useCallback(() => {
    clearTimer();
    setOpen(null);
  }, [clearTimer]);
  // Hover trigger: open/close after a short delay. Crossing the gap between the
  // cell and the portalled popover fires mouseleave, so entering the popover
  // cancels the pending close.
  const scheduleOpen = React.useCallback(
    (anchor: HTMLElement) => {
      clearTimer();
      timer.current = setTimeout(() => setOpen({ severity: null, anchor }), HOVER_OPEN_MS);
    },
    [clearTimer],
  );
  const scheduleClose = React.useCallback(() => {
    clearTimer();
    timer.current = setTimeout(() => setOpen(null), HOVER_CLOSE_MS);
  }, [clearTimer]);
  React.useEffect(() => clearTimer, [clearTimer]);

  const shown = SEVERITY_KEYS.filter(({ key }) => (counts?.[key] ?? 0) > 0);
  if (!counts || shown.length === 0) {
    return (
      <span data-testid="findings-severity-none" style={s.none}>
        —
      </span>
    );
  }

  const hover = trigger === "hover";
  const total = shown.reduce((sum, { key }) => sum + counts[key], 0);
  const popoverCount = open?.severity
    ? counts[SEVERITY_KEYS.find((k) => k.severity === open.severity)!.key]
    : total;
  const countAria = (severity: Severity, count: number) =>
    t("findingsSeverity.countAria", { count, severity: t(`findingsSeverity.label.${severity}`) });

  return (
    // Clicks (incl. ones bubbling out of the portalled popover) must not reach
    // a clickable parent such as the PR row.
    <span
      data-testid="findings-severity"
      style={s.wrap(hover, open !== null)}
      onClick={(e) => e.stopPropagation()}
      {...(hover && {
        tabIndex: 0,
        "aria-haspopup": "dialog" as const,
        "aria-expanded": open !== null,
        onMouseEnter: (e: React.MouseEvent<HTMLElement>) => scheduleOpen(e.currentTarget),
        onMouseLeave: scheduleClose,
        onFocus: (e: React.FocusEvent<HTMLElement>) => scheduleOpen(e.currentTarget),
        onBlur: scheduleClose,
      })}
    >
      {shown.map(({ severity, key }) => {
        const count = counts[key];
        const meta = SEV[severity];
        const I = Icon[meta.icon];
        if (hover) {
          return (
            <span key={severity} className="tnum" aria-label={countAria(severity, count)} style={s.count(meta.c)}>
              <I size={14} />
              {count}
            </span>
          );
        }
        const isOpen = open?.severity === severity;
        return (
          <button
            key={severity}
            type="button"
            className="tnum"
            aria-label={countAria(severity, count)}
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
          count={popoverCount}
          findings={findings}
          prId={prId}
          repoFullName={repoFullName}
          headSha={headSha}
          onClose={close}
          {...(hover && { onMouseEnter: clearTimer, onMouseLeave: scheduleClose })}
        />
      )}
    </span>
  );
}
