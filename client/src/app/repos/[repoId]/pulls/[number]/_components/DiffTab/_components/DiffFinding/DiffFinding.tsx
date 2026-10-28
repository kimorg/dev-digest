/* DiffFinding — a FindingCard under a diff line, wired to accept/dismiss. */
"use client";

import React from "react";
import type { FindingRecord } from "@devdigest/shared";
import { useFindingAction } from "@/lib/hooks/reviews";
import { FindingCard } from "../../../FindingCard";

interface DiffFindingProps {
  f: FindingRecord;
  prId: string | null;
}

export function DiffFinding({ f, prId }: DiffFindingProps) {
  const action = useFindingAction();
  return (
    <FindingCard
      f={f}
      defaultExpanded
      pending={action.isPending}
      onAction={(kind, reply) => action.mutate({ findingId: f.id, action: kind, reply, prId: prId ?? undefined })}
    />
  );
}
