/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { commentTargetFor, type CommentThread, type DiffCommentApi } from "../comments";
import { cs } from "../comments.styles";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor, markLabelFor, markRowFor } from "../styles";
import type { DiffAnnotation } from "../annotations";
import { Icon } from "@devdigest/ui";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  annotations,
  showAnnotations,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Annotations anchored to this line; bars/labels always show, bodies only when `showAnnotations`. */
  annotations?: DiffAnnotation[];
  showAnnotations?: boolean;
}) {
  const t = useTranslations("shell");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const mark = annotations?.find((a) => a.mark)?.mark ?? null;
  const MarkIcon = mark ? Icon[mark.icon] : null;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={mark ? { ...lineRowFor(ln.kind), ...markRowFor(mark.color) } : lineRowFor(ln.kind)}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title={t("diffViewer.addComment")}
              aria-label={t("diffViewer.addComment")}
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {mark && MarkIcon && (
          <span style={markLabelFor(mark.color)}>
            <MarkIcon size={12} />
            {mark.label}
          </span>
        )}
      </div>

      {showAnnotations &&
        annotations?.map((a) => (
          <div key={a.id} style={cs.annotation}>
            {a.body}
          </div>
        ))}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
