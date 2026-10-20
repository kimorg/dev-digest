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
import { findingBlobUrl } from "@/lib/github-urls";
import { latestReviewPerAgent, lineLabel, pickFindings, plainText, placeUnder, type Placement } from "./helpers";
import { s } from "./FindingsPopover.styles";


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
  const href = findingBlobUrl(repoFullName, headSha, f);
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
    show the LATEST review of each agent — the same reviews the list's counts come from. */
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
  const latest = latestReviewPerAgent(reviews.data ?? []);
  const findings = pickFindings(latest.flatMap((r) => r.findings), severity);
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
          findings={pickFindings(findings, severity)}
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
