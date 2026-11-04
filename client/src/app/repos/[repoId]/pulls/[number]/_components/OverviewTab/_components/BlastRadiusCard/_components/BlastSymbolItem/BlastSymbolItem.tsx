"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { pathSegments, symbolLabel } from "../../helpers";
import { s } from "./styles";

interface BlastSymbolItemProps {
  impact: DownstreamImpact;
  kind: string | undefined;
  repoFullName: string | null | undefined;
  headSha: string | null | undefined;
  defaultOpen?: boolean;
}

/** One changed symbol: collapsible list of its callers, plus the endpoints and crons they reach. */
export function BlastSymbolItem({ impact, kind, repoFullName, headSha, defaultOpen = false }: BlastSymbolItemProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <div style={s.item}>
      <button type="button" style={s.toggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Chevron size={14} />
        <span className="mono" style={s.name}>
          {symbolLabel(impact.symbol, kind)}
        </span>
        <span style={s.count}>{t("callerCount", { count: impact.callers.length })}</span>
      </button>

      {open && (
        <div style={s.body}>
          <ul style={s.callers}>
            {impact.callers.map((c) => {
              const label = `${c.file}:${c.line}`;
              // <wbr> after each "/" → long paths wrap at folder boundaries, never past the card.
              const path = pathSegments(label).map((seg, i) => (
                <React.Fragment key={i}>
                  {seg}
                  <wbr />
                </React.Fragment>
              ));
              return (
                <li key={label} style={s.caller}>
                  <span aria-hidden="true" style={s.arrow}>
                    ↳
                  </span>
                  <span style={s.callerText}>
                    {repoFullName && headSha ? (
                      <MonoLink href={githubBlobUrl(repoFullName, headSha, c.file, c.line)}>{path}</MonoLink>
                    ) : (
                      <span className="mono">{path}</span>
                    )}
                    <span style={s.callerName}>{c.name}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {(impact.endpoints_affected.length > 0 || impact.crons_affected.length > 0) && (
            <div style={s.chips}>
              {impact.endpoints_affected.map((e) => (
                <Badge key={e} icon="Globe" color="var(--accent)" bg="var(--accent-bg)" mono style={s.chip}>
                  {e}
                </Badge>
              ))}
              {impact.crons_affected.map((c) => (
                <Badge key={c} icon="Clock" color="var(--warn)" bg="var(--warn-bg)" mono style={s.chip}>
                  {c}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
