/* toast.tsx — A6 cross-cutting: system-level notifications.
   Error UX taxonomy: system errors → toast (here); form errors → inline;
   critical → full-screen (ErrorState fullScreen). */
"use client";

import React from "react";
import { Toaster, type ToastItem, type ToastKind } from "@/components/toaster";

interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void;
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const ToastCtx = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/* Module-level bridge so non-React code (e.g. the React Query cache) can raise
   toasts without the hook. The mounted <ToastProvider> registers its pusher. */
type Pusher = (message: string, kind?: ToastKind) => void;
let activePusher: Pusher | null = null;
export const notify = {
  toast: (m: string, k?: ToastKind) => activePusher?.(m, k),
  success: (m: string) => activePusher?.(m, "success"),
  error: (m: string) => activePusher?.(m, "error"),
  info: (m: string) => activePusher?.(m, "info"),
};

/** Toasts auto-dismiss after this long (ms). */
const TOAST_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const seq = React.useRef(1);
  const timers = React.useRef(new Set<ReturnType<typeof setTimeout>>());

  // Drop pending auto-dismiss timers if the provider unmounts.
  React.useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const push = React.useCallback((message: string, kind: ToastKind = "info") => {
    const id = seq.current++;
    setItems((prev) => [...prev, { id, kind, message }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DISMISS_MS);
    timers.current.add(timer);
  }, []);

  const api = React.useMemo<ToastApi>(
    () => ({
      toast: push,
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error"),
      info: (m) => push(m, "info"),
    }),
    [push],
  );

  // Expose this provider's pusher to the module-level `notify` bridge.
  React.useEffect(() => {
    activePusher = push;
    return () => {
      if (activePusher === push) activePusher = null;
    };
  }, [push]);

  const dismiss = React.useCallback((id: number) => setItems((prev) => prev.filter((x) => x.id !== id)), []);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <Toaster items={items} onDismiss={dismiss} />
    </ToastCtx.Provider>
  );
}
