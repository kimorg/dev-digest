/* ConventionCard — one extracted convention (client/specs/004-conventions.md):
   the rule, the evidence file:lines with the real snippet, the model's
   confidence, and Accept / Reject / Edit. Edit turns the rule into an inline
   textarea — no navigation. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, IconBtn, MonoLink, ProgressBar, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, UpdateConventionRequest } from "@devdigest/shared";
import { useToast } from "@/lib/toast";
import { confidenceColor, evidenceLocation } from "./helpers";
import { s } from "./styles";

export interface ConventionCardProps {
  candidate: ConventionCandidate;
  /** GitHub link to the evidence lines; the location is plain text without it. */
  evidenceUrl?: string;
  isPending?: boolean;
  onChange: (patch: UpdateConventionRequest) => void;
}

export function ConventionCard({ candidate, evidenceUrl, isPending = false, onChange }: ConventionCardProps) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const [isEditing, setIsEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);

  const isAccepted = candidate.status === "accepted";
  const percent = Math.round(candidate.confidence * 100);
  const location = evidenceLocation(candidate);

  const startEdit = () => {
    setRule(candidate.rule);
    setIsEditing(true);
  };
  const save = () => {
    if (rule.trim() !== candidate.rule) onChange({ rule: rule.trim() });
    setIsEditing(false);
  };
  const copy = () => {
    void navigator.clipboard?.writeText(candidate.evidence_snippet).then(() => toast.success(t("card.copied")));
  };

  return (
    <article style={s.card(isAccepted)} data-testid={`convention-card-${candidate.status}`}>
      <div style={s.main}>
        {isEditing ? (
          <div style={s.editForm}>
            <FormField label={t("card.rule")}>
              <Textarea value={rule} onChange={setRule} rows={2} />
            </FormField>
            <div style={s.editRow}>
              <Button kind="primary" size="sm" onClick={save} disabled={!rule.trim()}>
                {t("card.save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={() => setIsEditing(false)}>
                {t("card.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div style={s.rule}>{candidate.rule}</div>
        )}

        <div style={s.evidence}>
          <div style={s.evidenceHead}>
            <span className="mono" style={s.evidencePath} title={location}>
              {evidenceUrl ? (
                <MonoLink href={evidenceUrl}>
                  {location}
                  <Icon.ExternalLink size={11} aria-hidden style={s.linkIcon} />
                </MonoLink>
              ) : (
                location
              )}
            </span>
            <IconBtn icon="Copy" label={t("card.copy")} size={26} onClick={copy} />
          </div>
          <pre className="mono" style={s.snippet}>
            {candidate.evidence_snippet}
          </pre>
        </div>

        <div style={s.confidenceRow}>
          <span>{t("card.confidence")}</span>
          <div style={s.confidenceBar}>
            <ProgressBar value={percent} color={confidenceColor(candidate.confidence)} />
          </div>
          <span className="mono tnum" style={s.confidenceValue}>
            {percent}%
          </span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind={isAccepted ? "primary" : "secondary"}
          icon="Check"
          full
          aria-pressed={isAccepted}
          disabled={isPending || isEditing}
          onClick={() => onChange({ status: isAccepted ? "pending" : "accepted" })}
        >
          {isAccepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button
          kind="ghost"
          icon="X"
          full
          disabled={isPending || isEditing}
          onClick={() => onChange({ status: "rejected" })}
        >
          {t("card.reject")}
        </Button>
        <Button kind="ghost" icon="Edit" full disabled={isPending || isEditing} onClick={startEdit}>
          {t("card.edit")}
        </Button>
      </div>
    </article>
  );
}
