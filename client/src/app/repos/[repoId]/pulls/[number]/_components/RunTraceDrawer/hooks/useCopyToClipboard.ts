"use client";

import React from "react";

/** Copy text to the clipboard and flag `copied` for `resetMs` (button feedback).
    The reset timer is cleared on unmount and restarted on each copy. */
export function useCopyToClipboard(resetMs: number) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const copy = React.useCallback(
    (text: string) => {
      void navigator.clipboard?.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), resetMs);
    },
    [resetMs],
  );

  return { copied, copy };
}
