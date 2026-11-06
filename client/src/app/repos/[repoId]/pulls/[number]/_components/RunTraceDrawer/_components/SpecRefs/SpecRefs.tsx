/* SpecRefs — the project-context docs a run injected, in prompt order, with type
   and token weight (shown inside the trace's Project context block). Clicking
   one opens its full text exactly as it was in the prompt. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import type { SpecRef } from "@devdigest/shared";
import { extractSpecBlock } from "../../helpers";
import { s } from "../../styles";
import { PromptModalBody } from "../PromptModalBody";

export interface SpecRefsProps {
  refs: SpecRef[];
  /** The stored `prompt_assembly.specs` text the full documents are read from. */
  specs: string;
}

export function SpecRefs({ refs, specs }: SpecRefsProps) {
  const t = useTranslations("runs");
  const [openPath, setOpenPath] = React.useState<string | null>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);

  const close = React.useCallback(() => {
    setOpenPath(null);
    triggerRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (!openPath) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openPath, close]);

  if (refs.length === 0) return null;
  return (
    <>
      <ol style={s.skillRefs} data-testid="trace-spec-refs" aria-label={t("trace.prompt.specRefsLabel")}>
        {refs.map((r) => (
          <li key={r.path}>
            <button
              type="button"
              style={s.specRefBtn}
              onClick={(e) => {
                triggerRef.current = e.currentTarget;
                setOpenPath(r.path);
              }}
            >
              <span className="mono">{r.path}</span>
              <span style={s.specRefType}>{r.type}</span>
              <span className="mono" style={s.specRefTokens}>
                {t("trace.prompt.tokens", { count: r.tokens })}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {openPath && (
        <Modal width={1000} title={openPath} onClose={close}>
          <PromptModalBody text={extractSpecBlock(specs, openPath) ?? t("trace.prompt.specMissing")} />
        </Modal>
      )}
    </>
  );
}
