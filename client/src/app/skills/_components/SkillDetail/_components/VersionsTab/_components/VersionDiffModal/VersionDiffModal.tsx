/* VersionDiffModal — line diff of an older skill version against the current body. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import { toDiffRows } from "./helpers";
import { s } from "./styles";

const SIGN = { add: "+", del: "−", same: " " } as const;

export interface VersionDiffModalProps {
  fromVersion: number;
  fromBody: string;
  toVersion: number;
  toBody: string;
  onClose: () => void;
}

export function VersionDiffModal({ fromVersion, fromBody, toVersion, toBody, onClose }: VersionDiffModalProps) {
  const t = useTranslations("skills");
  const rows = toDiffRows(fromBody, toBody);
  return (
    <Modal width={900} title={t("versions.diffTitle", { from: fromVersion, to: toVersion })} onClose={onClose}>
      <div className="mono" style={s.body} data-testid="skill-version-diff">
        {rows.length === 0 && <div style={s.empty}>{t("versions.noChanges")}</div>}
        {rows.map((row, i) =>
          row.kind === "gap" ? (
            <div key={i} style={s.row("gap")}>
              <span style={s.sign}>⋯</span>
              <span>{row.count}</span>
            </div>
          ) : (
            <div key={i} style={s.row(row.kind)} data-diff={row.kind}>
              <span style={s.sign}>{SIGN[row.kind]}</span>
              <span>{row.text || " "}</span>
            </div>
          ),
        )}
      </div>
    </Modal>
  );
}
