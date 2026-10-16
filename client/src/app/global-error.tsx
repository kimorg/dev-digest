"use client";

/* Last-resort boundary for errors in the root layout itself. It replaces the
   layout, so no providers (theme, i18n) are available — plain markup only. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 48, background: "#0b0d10", color: "#e6e8eb" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>DevDigest hit an unexpected error</h1>
        <p style={{ opacity: 0.7, marginBottom: 16 }}>Reload the page, or try again.</p>
        <button type="button" onClick={reset} style={{ padding: "6px 14px", cursor: "pointer" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
