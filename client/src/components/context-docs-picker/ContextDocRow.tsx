/* ContextDocRow — one document in the picker, on a single line: [grip] checkbox,
   file name + folder, then type (or "missing"), tokens and a Preview button. The grip
   is passed in and only attached rows get one. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { TYPE_COLOR } from "./constants";
import type { ContextRow } from "./helpers";
import { s } from "./styles";

export interface ContextDocRowProps {
  row: ContextRow;
  isAttached: boolean;
  isDragging?: boolean;
  handle?: React.ReactNode;
  onToggle: (isOn: boolean) => void;
  onPreview: (trigger: HTMLElement) => void;
}

export function ContextDocRow({ row, isAttached, isDragging = false, handle, onToggle, onPreview }: ContextDocRowProps) {
  const t = useTranslations("context");
  // A too-large doc can't be attached; if it somehow is, it can still be detached.
  const isDisabled = row.isTooLarge && !isAttached;
  return (
    <div style={s.row(isDragging)} data-testid="context-doc-row" data-attached={isAttached}>
      <span style={s.handleSlot} data-testid="context-doc-handle-slot">
        {handle}
      </span>
      <input
        type="checkbox"
        checked={isAttached}
        disabled={isDisabled}
        aria-label={row.path}
        title={isDisabled ? t("picker.tooLargeTitle") : row.path}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span style={s.text} title={row.path}>
        <span className="mono" style={s.name}>
          {row.name}
        </span>
        {row.dir && (
          <span className="mono" style={s.dir}>
            {`${row.dir}/`}
          </span>
        )}
      </span>
      <span style={s.meta}>
        {row.isMissing ? (
          <span style={s.missing} title={t("picker.missingTitle")}>
            {t("picker.missing")}
          </span>
        ) : (
          <>
            {row.type && <span style={s.type(TYPE_COLOR[row.type])}>{t(`type.${row.type}`)}</span>}
            <span className="mono" style={s.tokens}>
              {row.isTooLarge ? t("doc.tooLarge") : t("doc.tokens", { count: row.tokens })}
            </span>
          </>
        )}
        {!row.isMissing && !row.isTooLarge && (
          <button type="button" style={s.previewBtn} onClick={(e) => onPreview(e.currentTarget)}>
            <Icon.Eye size={13} />
            {t("picker.preview")}
          </button>
        )}
      </span>
    </div>
  );
}
