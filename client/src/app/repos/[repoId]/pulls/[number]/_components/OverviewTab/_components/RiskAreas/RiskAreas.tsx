/* RiskAreas — the brief's risks as a list of boxes (icon, title, first file link,
   chevron). One risk is expanded at a time; its explanation and all file refs show
   in a panel under the list. All model text renders as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, Risk } from "@devdigest/shared";
import { BriefFileLink } from "../BriefFileLink";
import { SEVERITY_COLOR } from "./constants";
import { riskIconName, sortRisksBySeverity } from "./helpers";
import { s } from "./styles";

interface RiskAreasProps {
  risks: Risk[];
  files: PrFile[];
  fileHref: (path: string, line: number | null) => string;
}

export function RiskAreas({ risks, files, fileHref }: RiskAreasProps) {
  const t = useTranslations("brief");
  const panelId = React.useId();
  const sorted = React.useMemo(() => sortRisksBySeverity(risks), [risks]);
  const [expanded, setExpanded] = React.useState<number | null>(null);
  // Which ref link was clicked while its file is not in the diff (shows the status note).
  const [missing, setMissing] = React.useState<string | null>(null);

  const open = expanded != null ? sorted[expanded] : undefined;
  const notInDiff = (key: string) =>
    missing === key && (
      <div role="status" style={s.note}>
        {t("notInDiff")}
      </div>
    );

  return (
    <div style={s.wrap}>
      <h4 style={s.heading}>
        <Icon.AlertTriangle size={14} />
        {t("block.risks")}
      </h4>

      {sorted.length === 0 ? (
        <div style={s.muted}>{t("noRisks")}</div>
      ) : (
        <ul style={s.list}>
          {sorted.map((risk, i) => {
            const isOpen = expanded === i;
            const RiskIcon = Icon[riskIconName(risk.kind)];
            const first = risk.file_refs[0];
            return (
              <li key={`${i}:${risk.title}`}>
                <div style={s.box(isOpen ? SEVERITY_COLOR[risk.severity] : null)}>
                  <div style={s.boxMain}>
                    <span style={s.titleRow}>
                      <RiskIcon size={14} style={s.icon(SEVERITY_COLOR[risk.severity])} />
                      {risk.title}
                    </span>
                    {first && (
                      <BriefFileLink
                        fileRef={first}
                        files={files}
                        fileHref={fileHref}
                        onNotInDiff={() => setMissing(`box:${i}`)}
                      />
                    )}
                    {notInDiff(`box:${i}`)}
                  </div>
                  <button
                    type="button"
                    style={s.chevronBtn}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? panelId : undefined}
                    aria-label={t(isOpen ? "risk.collapse" : "risk.expand", { title: risk.title })}
                    onClick={() => setExpanded(isOpen ? null : i)}
                  >
                    <Icon.ChevronDown size={14} style={s.chevron(isOpen)} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <div id={panelId} role="region" aria-label={t("risk.details")} style={s.panel}>
          <p style={s.explanation}>{open.explanation}</p>
          {open.file_refs.length > 0 && (
            <div style={s.refs}>
              {open.file_refs.map((ref, j) => (
                <div key={`${j}:${ref}`}>
                  <BriefFileLink
                    fileRef={ref}
                    files={files}
                    fileHref={fileHref}
                    onNotInDiff={() => setMissing(`panel:${j}`)}
                  />
                  {notInDiff(`panel:${j}`)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
