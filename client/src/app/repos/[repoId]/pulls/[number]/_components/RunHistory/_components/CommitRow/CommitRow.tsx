"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import type { PrCommit } from "@devdigest/shared";
import { formatTime } from "@/lib/format-date";
import { shortSha, subjectLine } from "../../helpers";
import { s } from "./styles";

interface CommitRowProps {
  commit: PrCommit;
}

/** One commit in the PR timeline (a marker between runs). */
export function CommitRow({ commit }: CommitRowProps) {
  return (
    <div style={s.row}>
      <Icon.GitCommit size={15} style={s.icon} />
      <span className="mono" style={s.sha}>
        {shortSha(commit.sha)}
      </span>
      <span style={s.message} title={commit.message}>
        {subjectLine(commit.message)}
      </span>
      <span style={s.meta}>{commit.author}</span>
      {commit.committed_at && <span style={s.meta}>{formatTime(commit.committed_at)}</span>}
    </div>
  );
}
