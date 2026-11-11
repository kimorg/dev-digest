/* ReviewFocusCard — "read these first" list from the brief: `▸ file:line — reason`,
   in the model's order. Plain text only; links go to Files changed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { PrFile, ReviewFocusItem } from "@devdigest/shared";
import { BriefFileLink } from "../BriefFileLink";
import { s } from "./styles";

interface ReviewFocusCardProps {
  items: ReviewFocusItem[];
  files: PrFile[];
  fileHref: (path: string, line: number | null) => string;
}

export function ReviewFocusCard({ items, files, fileHref }: ReviewFocusCardProps) {
  const t = useTranslations("brief");
  // Index of the item whose file is not in the diff (shows the status note under it).
  const [missing, setMissing] = React.useState<number | null>(null);

  return (
    <section aria-label={t("focus.title")} style={s.card}>
      <div style={s.header}>
        <span style={s.title}>
          <Icon.ListChecks size={14} />
          {t("focus.title")}
        </span>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {items.length}
        </Badge>
      </div>

      {items.length === 0 ? (
        <div style={s.muted}>{t("noFocus")}</div>
      ) : (
        <ul style={s.list}>
          {items.map((item, i) => (
            <li key={`${i}:${item.file}:${item.line}`} style={s.row}>
              <span aria-hidden style={s.marker}>
                ▸
              </span>
              <span>
                <BriefFileLink
                  fileRef={`${item.file}:${item.line}`}
                  files={files}
                  fileHref={fileHref}
                  onNotInDiff={() => setMissing(i)}
                />
                <span style={s.reason}> — {item.reason}</span>
                {missing === i && (
                  <div role="status" style={s.note}>
                    {t("notInDiff")}
                  </div>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
