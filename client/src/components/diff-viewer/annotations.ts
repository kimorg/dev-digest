/* Generic line annotations for the DiffViewer: a caller (e.g. review findings)
   attaches a marked line + a body to a file. The viewer knows nothing about what
   an annotation is — `body` is a ReactNode slot. Pure helpers + the API shape. */
import type { ReactNode } from "react";
import type { IconName } from "@devdigest/ui";
import { lineKey } from "./comments";

/** The bar + label drawn on an annotated line. */
export interface DiffLineMark {
  color: string;
  icon: IconName;
  label: string;
}

export interface DiffAnnotation {
  id: string;
  /** New-file line the annotation sits on, or null when it has no line. */
  line: number | null;
  /** null = shown under the line only, no bar/label and no file dot. */
  mark: DiffLineMark | null;
  body: ReactNode;
}

export interface DiffAnnotationApi {
  forFile: (path: string) => DiffAnnotation[];
  /** When false, bodies are hidden (bars, labels and the file dot stay). */
  show: boolean;
  /** Accessible name of the file dot. */
  flagLabel: string;
  /** Title of the block for annotations not on a diff line; defaults to the shell text. */
  unplacedTitle?: (count: number) => string;
}

/** Lets a parent control which files are expanded. */
export interface DiffFileOpenApi {
  isOpen: (path: string) => boolean;
  onOpenChange: (path: string, open: boolean) => void;
}

/** Split annotations into those whose line is rendered in this patch (keyed) and the rest. */
export function partitionAnnotations(
  items: DiffAnnotation[],
  renderedKeys: Set<string>,
): { byKey: Map<string, DiffAnnotation[]>; unplaced: DiffAnnotation[] } {
  const byKey = new Map<string, DiffAnnotation[]>();
  const unplaced: DiffAnnotation[] = [];
  for (const a of items) {
    const key = lineKey("RIGHT", a.line);
    if (key && renderedKeys.has(key)) {
      const list = byKey.get(key) ?? [];
      list.push(a);
      byKey.set(key, list);
    } else {
      unplaced.push(a);
    }
  }
  return { byKey, unplaced };
}
