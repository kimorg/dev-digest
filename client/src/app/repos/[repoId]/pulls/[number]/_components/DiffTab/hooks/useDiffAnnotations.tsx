"use client";

import { useTranslations } from "next-intl";
import type { DiffAnnotationApi } from "@/components/diff-viewer";
import { DiffFinding } from "../_components/DiffFinding";
import { lineLabelKey, toFindingAnnotation } from "../helpers";
import { useDiffFindings } from "./useDiffFindings";

/** The diff's findings as the viewer's annotation API (`show` = visible cards), plus the per-file flags. */
export function useDiffAnnotations(prId: string | null, show: boolean) {
  const t = useTranslations("prReview");
  const { byFile, flaggedPaths, reviewed, isReady } = useDiffFindings(prId);
  const annotations: DiffAnnotationApi = {
    show,
    flagLabel: t("smartDiff.fileHasFindings"),
    unplacedTitle: (count) => t("smartDiff.unplacedFindings", { count }),
    forFile: (path) =>
      (byFile.get(path) ?? []).map((f) =>
        toFindingAnnotation(f, t(`smartDiff.lineLabel.${lineLabelKey(f.severity)}`), <DiffFinding f={f} prId={prId} />),
      ),
  };
  return { annotations, flaggedPaths, reviewed, isReady };
}
