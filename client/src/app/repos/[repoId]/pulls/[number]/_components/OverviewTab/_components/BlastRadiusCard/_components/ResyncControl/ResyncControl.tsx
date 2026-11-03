"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@devdigest/ui";
import { queryKeys } from "@/lib/hooks/query-keys";
import { useRepoIntelStatus, useResyncRepoIntel, type RepoIntelState } from "@/lib/hooks/repo-intel";
import { RESYNC_POLL_TIMEOUT_MS } from "../../constants";
import { indexAdvanced } from "../../helpers";
import { s } from "./styles";

interface ResyncControlProps {
  prId: string | null | undefined;
  repoId: string;
}

type Phase = "idle" | "running" | "done" | "slow" | "failed";

/** Resync button for a degraded blast map: starts the job, then refreshes the card once the index advances. */
export function ResyncControl({ prId, repoId }: ResyncControlProps) {
  const t = useTranslations("blast.degraded");
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const baseline = useRef<RepoIntelState | undefined>(undefined);
  const status = useRepoIntelStatus(repoId, phase === "running");
  const resync = useResyncRepoIntel(repoId);

  // The index row advancing is the completion signal (the status enum is terminal-only).
  useEffect(() => {
    if (phase === "running" && indexAdvanced(baseline.current, status.data)) {
      qc.invalidateQueries({ queryKey: queryKeys.prBlast(prId) });
      setPhase("done");
    }
  }, [phase, status.data, qc, prId]);

  useEffect(() => {
    if (phase !== "running") return;
    const timer = setTimeout(() => setPhase("slow"), RESYNC_POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  function start() {
    baseline.current = status.data;
    resync.mutate(undefined, {
      // The route answers 202 even when the job was not enqueued.
      onSuccess: (res) => setPhase(res.degraded ? "failed" : "running"),
    });
  }

  return (
    <div style={s.row}>
      <Button
        size="sm"
        icon="RefreshCw"
        loading={resync.isPending || phase === "running"}
        disabled={resync.isPending || phase === "running"}
        onClick={start}
      >
        {t("resync")}
      </Button>
      {phase !== "idle" && (
        <span role="status" style={s.status}>
          {t(
            phase === "running"
              ? "resyncRunning"
              : phase === "done"
                ? "resyncDone"
                : phase === "slow"
                  ? "resyncSlow"
                  : "resyncFailed",
          )}
        </span>
      )}
    </div>
  );
}
