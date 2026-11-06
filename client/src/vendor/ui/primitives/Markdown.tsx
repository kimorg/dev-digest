import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const SAFE_SCHEME_RE = /^(https?|mailto):/i;
const ANY_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** http, https, mailto and relative links are clickable; every other scheme (javascript:, data:…) is not. */
function isSafeHref(href: string | undefined): boolean {
  const h = (href ?? "").trim();
  if (!h) return false;
  // Control characters / whitespace inside the scheme are a classic bypass.
  const compact = h.replace(/[\u0000- ]/g, "");
  return SAFE_SCHEME_RE.test(compact) || !ANY_SCHEME_RE.test(compact);
}

/** Markdown renderer (replaces prototype mdLite). Inline + GFM. */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          code: ({ children }) => (
            <code
              className="mono"
              style={{
                fontSize: "0.92em",
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--bg-hover)",
                color: "var(--accent-text)",
              }}
            >
              {children}
            </code>
          ),
          a: ({ children, href }) =>
            isSafeHref(href) ? (
              <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
