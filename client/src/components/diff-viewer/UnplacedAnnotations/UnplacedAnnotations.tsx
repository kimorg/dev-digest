/* UnplacedAnnotations — footer block for annotations whose line isn't in this
   file's patch (or that have no line), so none is silently dropped. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { DiffAnnotation } from "../annotations";
import { cs } from "../comments.styles";

export function UnplacedAnnotations({
  items,
  title,
}: {
  items: DiffAnnotation[];
  /** Overrides the default title (the caller knows what the items are). */
  title?: (count: number) => string;
}) {
  const t = useTranslations("shell");
  if (items.length === 0) return null;
  return (
    <div style={cs.outdatedWrap}>
      <span style={cs.outdatedTitle}>{title ? title(items.length) : t("diffViewer.unplacedTitle", { count: items.length })}</span>
      {items.map((a) => (
        <React.Fragment key={a.id}>{a.body}</React.Fragment>
      ))}
    </div>
  );
}
