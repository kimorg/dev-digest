/* FindingsPopover — short list of one severity's findings (or all of them,
   ordered by severity), anchored under the severity counts. Portalled to <body> with fixed positioning: the PR table and
   the run accordions clip overflow, so an absolutely-positioned box would be
   cut off. Read-only — only file:line links out (GitHub blob at head sha). */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Icon,
  SEV,
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  Skeleton,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { usePrReviews } from "@/lib/hooks/reviews";
import { githubBlobUrl } from "@/lib/github-urls";
import { lineLabel, sortBySeverity } from "./helpers";

const WIDTH = 440;
const MAX_HEIGHT = 360;
const GAP = 6;
const EDGE = 8;

type Placement = { left: number; top?: number; bottom?: number };

function placeUnder(anchor: HTMLElement): Placement {
  const r = anchor.getBoundingClientRect();
  const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - WIDTH - EDGE));
  // Flip above the trigger when there's no room below (bottom rows of a table).
  if (r.bottom + GAP + MAX_HEIGHT > window.innerHeight && r.top > window.innerHeight - r.bottom) {
    return { left, bottom: window.innerHeight - r.top + GAP };
  }
  return { left, top: r.bottom + GAP };
}

/** One severity's findings, or all of them ordered by severity when `severity` is null. */
function pick(findings: FindingRecord[], severity: Severity | null): FindingRecord[] {
  return severity ? findings.filter((f) => f.severity === severity) : sortBySeverity(findings);
}

/** Markdown rationale → one plain-text line for the 2-line clamp. */
function plainText(md: string): string {
  return md.replace(/\*\*|`/g, "").replace(/\s+/g, " ").trim();
}

const s = {
  root: (p: Placement): React.CSSProperties => ({
    position: "fixed",
    left: p.left,
    top: p.top,
    bottom: p.bottom,
    width: WIDTH,
    maxWidth: `calc(100vw - ${EDGE * 2}px)`,
    maxHeight: MAX_HEIGHT,
    overflowY: "auto",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    boxShadow: "var(--shadow-modal)",
    padding: "12px 14px",
    zIndex: 60,
    animation: "ddpop .12s ease",
    cursor: "default",
    textAlign: "left",
  }),
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies React.CSSProperties,
  item: (first: boolean): React.CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "10px 0",
    borderTop: first ? "none" : "1px solid var(--border)",
  }),
  titleRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies React.CSSProperties,
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies React.CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies React.CSSProperties,
  rationale: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies React.CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)", padding: "8px 0" } satisfies React.CSSProperties,
} as const;

function FindingItem({
  f,
  first,
  repoFullName,
  headSha,
}: {
  f: FindingRecord;
  first: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const href =
    repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  return (
    <li style={s.item(first)}>
      <div style={s.titleRow}>
        <SeverityBadge severity={f.severity} compact />
        <span style={s.title}>{f.title}</span>
        <CategoryTag category={f.category as Category} />
      </div>
      <div style={s.metaRow}>
        <MonoLink href={href}>
          {f.file}:{lineLabel(f)}
        </MonoLink>
        <ConfidenceNum value={f.confidence} />
      </div>
      <div style={s.rationale}>{plainText(f.rationale)}</div>
    </li>
  );
}

function FindingList({
  findings,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("common");
  if (findings.length === 0) return <div style={s.note}>{t("findingsSeverity.empty")}</div>;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {findings.map((f, i) => (
        <FindingItem key={f.id} f={f} first={i === 0} repoFullName={repoFullName} headSha={headSha} />
      ))}
    </ul>
  );
}

/** PR-list source: fetch the PR's reviews only once the popover is open, and
    show the LATEST review only — the same review the list's counts come from. */
function PrFindingList({
  prId,
  severity,
  repoFullName,
  headSha,
}: {
  prId: string;
  severity: Severity | null;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("common");
  const reviews = usePrReviews(prId);
  if (reviews.isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
        <Skeleton height={16} />
        <Skeleton height={12} width="60%" />
      </div>
    );
  }
  if (reviews.isError) return <div style={s.note}>{t("findingsSeverity.error")}</div>;
  // Reviews come newest-first (GET /pulls/:id/reviews orders by created_at desc).
  const latest = (reviews.data ?? []).find((r) => r.kind === "review");
  const findings = pick(latest?.findings ?? [], severity);
  return <FindingList findings={findings} repoFullName={repoFullName} headSha={headSha} />;
}

export function FindingsPopover({
  anchor,
  severity,
  count,
  findings,
  prId,
  repoFullName,
  headSha,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: {
  anchor: HTMLElement;
  /** Severity to list; null lists every severity (hover trigger). */
  severity: Severity | null;
  count: number;
  /** In-memory findings (timeline). When absent, `prId` is fetched. */
  findings?: FindingRecord[];
  prId?: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
  onClose: () => void;
  /** Hover trigger: keep the popover open while the pointer is over it. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const t = useTranslations("common");
  const ref = React.useRef<HTMLDivElement>(null);
  const [place, setPlace] = React.useState<Placement>(() => placeUnder(anchor));

  React.useLayoutEffect(() => setPlace(placeUnder(anchor)), [anchor]);

  React.useEffect(() => {
    const inside = (n: EventTarget | null) =>
      n instanceof Node && (ref.current?.contains(n) || anchor.parentElement?.contains(n));
    const onDown = (e: MouseEvent) => {
      if (!inside(e.target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Scrolling the page would detach the fixed box from its trigger; scrolling
    // the popover's own list is fine.
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Node && ref.current?.contains(e.target))) onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  const SevIcon = severity ? Icon[SEV[severity].icon] : null;
  const title = severity
    ? t("findingsSeverity.popoverTitle", { count, severity: t(`findingsSeverity.label.${severity}`) })
    : t("findingsSeverity.popoverTitleAll", { count });
  const ariaLabel = severity
    ? t("findingsSeverity.countAria", { count, severity: t(`findingsSeverity.label.${severity}`) })
    : title;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={ariaLabel}
      style={s.root(place)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div style={s.header}>
        {SevIcon && severity && <SevIcon size={14} style={{ color: SEV[severity].c }} />}
        {title}
      </div>
      {findings ? (
        <FindingList
          findings={pick(findings, severity)}
          repoFullName={repoFullName}
          headSha={headSha}
        />
      ) : prId ? (
        <PrFindingList prId={prId} severity={severity} repoFullName={repoFullName} headSha={headSha} />
      ) : null}
    </div>,
    document.body,
  );
}
