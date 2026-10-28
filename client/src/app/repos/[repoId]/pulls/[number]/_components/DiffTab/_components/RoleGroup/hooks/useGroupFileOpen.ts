"use client";

import React from "react";
import { isAutoExpanded, type DiffFileOpenApi } from "@/components/diff-viewer";
import type { PrFile } from "@devdigest/shared";

/**
 * Per-file expansion of one group. Files the user hasn't touched follow the
 * viewer's size rule; `setAll` (the ⇕ button) overrides every file at once.
 */
export function useGroupFileOpen(files: PrFile[]) {
  const [overrides, setOverrides] = React.useState<ReadonlyMap<string, boolean>>(new Map());
  const isOpen = (path: string) => overrides.get(path) ?? isAutoExpanded(files.find((f) => f.path === path) ?? {});
  const api: DiffFileOpenApi = {
    isOpen,
    onOpenChange: (path, open) => setOverrides((m) => new Map(m).set(path, open)),
  };
  const allOpen = files.every((f) => isOpen(f.path));
  const setAll = (open: boolean) => setOverrides(new Map(files.map((f) => [f.path, open])));
  return { api, allOpen, setAll };
}
