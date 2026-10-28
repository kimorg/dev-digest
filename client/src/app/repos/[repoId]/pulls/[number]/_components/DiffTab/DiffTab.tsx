"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Skeleton } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment } from "@/lib/hooks/reviews";
import { usePrSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { DiffOrderToggle } from "./_components/DiffOrderToggle";
import { RoleGroup } from "./_components/RoleGroup";
import type { CommentsMode, DiffOrder } from "./constants";
import { countFlagged, diffStats, toRoleGroups } from "./helpers";
import { useDiffAnnotations } from "./hooks/useDiffAnnotations";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const smartDiff = usePrSmartDiff(prId);
  const [order, setOrder] = React.useState<DiffOrder>("smart");
  // GitHub comments start hidden, findings visible; the button flips both together.
  const [commentsMode, setCommentsMode] = React.useState<CommentsMode>("default");

  const { annotations, flaggedPaths, reviewed, isReady } = useDiffAnnotations(prId, commentsMode !== "hidden");

  const commentCount = comments?.length ?? 0;
  const stats = diffStats(files);

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments: commentsMode === "shown",
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setCommentsMode("shown"); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : t("diff.postFailed"));
        throw err;
      }
    },
  };

  const isShown = commentsMode === "shown";
  const flat = <DiffViewer files={files} commenting={commenting} annotations={annotations} />;

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.controls}>
            <DiffOrderToggle value={order} onChange={setOrder} />
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={isShown ? "EyeOff" : "Eye"}
                onClick={() => setCommentsMode(isShown ? "hidden" : "shown")}
              >
                {t(isShown ? "diff.hideComments" : "diff.showComments", { count: commentCount })}
              </Button>
            )}
          </div>
        }
      >
        {t("diff.title", { count: filesCount })}
      </SectionLabel>
      <div style={s.summary}>
        {t.rich("diff.summary", {
          count: stats.count,
          additions: stats.additions,
          deletions: stats.deletions,
          add: (chunks) => <span style={s.addText}>{chunks}</span>,
          del: (chunks) => <span style={s.delText}>{chunks}</span>,
        })}
      </div>
      {order === "smart" && isReady && !reviewed && <div style={s.note}>{t("smartDiff.notReviewedYet")}</div>}
      {order === "original" ? (
        flat
      ) : smartDiff.isLoading ? (
        <Skeleton height={120} />
      ) : !smartDiff.data ? (
        <>
          <div style={s.note}>{t("smartDiff.loadError")}</div>
          {flat}
        </>
      ) : (
        toRoleGroups(smartDiff.data, files).map((g) => (
          <RoleGroup
            key={g.role}
            role={g.role}
            files={g.files}
            flaggedCount={countFlagged(g.files, flaggedPaths)}
            commenting={commenting}
            annotations={annotations}
          />
        ))
      )}
    </section>
  );
}
