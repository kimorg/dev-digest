"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import type { BlastRadius } from "@devdigest/shared";
import { GRAPH_COLUMNS, columnX, downstreamOf, graphModalWidth, layoutBlastGraph } from "./graph-layout";
import { edgeStroke, nodeState } from "./helpers";
import { COLUMN_COLOR, s } from "./styles";

interface BlastGraphModalProps {
  blast: BlastRadius;
  onClose: () => void;
}

/** Symbols → callers → endpoints/crons as four columns joined by curves. Labels render as SVG/React text only. */
export function BlastGraphModal({ blast, onClose }: BlastGraphModalProps) {
  const t = useTranslations("blast");
  const layout = useMemo(() => layoutBlastGraph(blast), [blast]);
  // Hovered (or focused) symbol node; its downstream lights up, the rest dims.
  const [hovered, setHovered] = useState<string | null>(null);
  const highlight = useMemo(() => (hovered ? downstreamOf(layout, hovered) : null), [layout, hovered]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Modal width={graphModalWidth(layout)} title={t("graph.title")} onClose={onClose}>
      {layout.nodes.length === 0 ? (
        <div style={s.empty}>{t("graph.empty")}</div>
      ) : (
        <div style={s.scroll}>
          <div style={s.canvas(layout.width, layout.height)} role="group" aria-label={t("graph.ariaLabel")}>
            <svg width={layout.width} height={layout.height} style={s.svg} aria-hidden="true">
              {layout.edges.map((e) => (
                <path key={e.id} d={e.d} fill="none" {...edgeStroke(e, highlight)} />
              ))}
            </svg>
            {GRAPH_COLUMNS.map((col) => (
              <div key={col} style={s.header(columnX(col), COLUMN_COLOR[col])}>
                {t(`graph.legend.${col}`)} ({layout.counts[col]})
              </div>
            ))}
            {layout.nodes.map((n) => {
              const isSymbol = n.column === "symbols";
              return (
                <div
                  key={n.id}
                  className="mono"
                  style={s.node(n.x, n.y, COLUMN_COLOR[n.column], nodeState(n.id, highlight, hovered))}
                  title={n.title}
                  data-state={nodeState(n.id, highlight, hovered)}
                  {...(isSymbol
                    ? {
                        tabIndex: 0,
                        onMouseEnter: () => setHovered(n.id),
                        onMouseLeave: () => setHovered(null),
                        onFocus: () => setHovered(n.id),
                        onBlur: () => setHovered(null),
                      }
                    : {})}
                >
                  <span style={s.nodeLine}>{n.label}</span>
                  {n.sublabel && <span style={s.nodeSub}>{n.sublabel}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
