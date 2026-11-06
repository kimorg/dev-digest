/* ContextDocList — the left list of the Project Context page: one line per document, sorted by path. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { ContextDocument } from "@devdigest/shared";
import { sortByPath } from "./helpers";
import { s } from "./styles";

export interface ContextDocListProps {
  documents: ContextDocument[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function ContextDocList({ documents, selectedPath, onSelect }: ContextDocListProps) {
  const t = useTranslations("context");
  return (
    <ul style={s.list} aria-label={t("page.listLabel")}>
      {sortByPath(documents).map((d) => {
        const isSelected = d.path === selectedPath;
        return (
          <li key={d.path}>
            <button
              type="button"
              title={d.path}
              aria-current={isSelected}
              onClick={() => onSelect(d.path)}
              style={s.row(isSelected)}
            >
              <Icon.FileText size={14} style={s.icon} />
              <span className="mono" style={s.path}>
                {d.path}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
