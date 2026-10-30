"use client";

import React from "react";

/**
 * Publishes an element's height as a CSS custom property on its parent (the
 * scroller), so sticky content below it can pin under it: `top: var(--name)`.
 * The header's height changes (the title wraps), which plain CSS can't follow.
 */
export function usePublishHeight(ref: React.RefObject<HTMLElement | null>, name: string) {
  React.useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const publish = () => host.style.setProperty(name, `${el.getBoundingClientRect().height}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      host.style.removeProperty(name);
    };
  }, [ref, name]);
}
