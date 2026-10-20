/* FindingsPanel — severity pills (single-select) + hide-low-confidence + j/k
   navigation + FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, Chip, SEV } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { countBySeverity, SEVERITY_KEYS } from "@/components/findings-severity";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "@/lib/hooks/reviews";
import { isTextInput } from "@/lib/dom-events";
import { KEY_TO_ACTION } from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  isKeyboardActive = true,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Only the active panel handles j/k/a/d — several run panels can be open at once. */
  isKeyboardActive?: boolean;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);
  const [sevFilter, setSevFilter] = React.useState<Severity | null>(null);

  // Pills count ALL of the run's findings, so they stay stable while filtering.
  const counts = React.useMemo(() => countBySeverity(findings), [findings]);
  const pills = SEVERITY_KEYS.filter(({ key }) => counts[key] > 0);
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, sevFilter),
    [findings, hideLow, sevFilter],
  );
  // Clamp during render: filtering can shrink the list below the stored index.
  const focused = Math.min(focusIdx, Math.max(shown.length - 1, 0));
  const toggleSeverity = (sev: Severity) => {
    setSevFilter((cur) => (cur === sev ? null : sev));
    setFocusIdx(0);
  };

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    if (!isKeyboardActive) return;
    const handler = (e: KeyboardEvent) => {
      if (isTextInput(e.target)) return;
      if (e.key === "j") setFocusIdx(Math.min(focused + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx(Math.max(focused - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focused]) {
        action.mutate({ findingId: shown[focused]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isKeyboardActive, shown, focused, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        {pills.map(({ severity, key }) => (
          <Chip
            key={severity}
            icon={SEV[severity].icon}
            count={counts[key]}
            active={sevFilter === severity}
            onClick={() => toggleSeverity(severity)}
          >
            {t(`panel.severity.${severity}`)}
          </Chip>
        ))}
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focused}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
