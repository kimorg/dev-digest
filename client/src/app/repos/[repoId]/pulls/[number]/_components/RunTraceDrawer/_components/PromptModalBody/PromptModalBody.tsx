/* PromptModalBody — fullscreen modal body for a prompt block: monospace text +
   a line search. Fixed height so the modal stays stable even when the search
   finds nothing. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { TextInput } from "@devdigest/ui";
import { splitMatches } from "./helpers";
import { s } from "./styles";

/** One line with every occurrence of `q` highlighted. */
function HighlightedLine({ line, q }: { line: string; q: string }) {
  return (
    <div>
      {splitMatches(line, q).map((seg, i) =>
        seg.match ? (
          <mark key={i} style={s.mark}>
            {seg.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        ),
      )}
    </div>
  );
}

interface PromptModalBodyProps {
  text: string;
}

export function PromptModalBody({ text }: PromptModalBodyProps) {
  const t = useTranslations("runs");
  const [q, setQ] = React.useState("");
  const lines = React.useMemo(() => (text || "—").split("\n"), [text]);
  const ql = q.trim().toLowerCase();
  const shown = ql ? lines.filter((l) => l.toLowerCase().includes(ql)) : lines;
  return (
    <div style={s.root}>
      <div style={s.searchBar}>
        <TextInput
          value={q}
          onChange={setQ}
          placeholder={t("trace.prompt.search")}
          suffix={
            ql ? (
              <span style={s.matchCount}>
                {shown.length} / {lines.length}
              </span>
            ) : undefined
          }
        />
      </div>
      <div style={s.scroll}>
        {ql && shown.length === 0 ? (
          <div style={s.noMatches}>{t("trace.prompt.noMatches", { q: q.trim() })}</div>
        ) : (
          <pre className="mono" style={s.pre}>
            {ql ? shown.map((l, i) => <HighlightedLine key={i} line={l} q={q} />) : text || "—"}
          </pre>
        )}
      </div>
    </div>
  );
}
