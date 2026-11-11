/* BriefFileLink — a monospace `file:line` link from the brief. In the PR's diff it is a
   link to Files changed (a new history entry); otherwise a look-alike button that
   reports the miss through `onNotInDiff`, so the parent can show its message. */
"use client";

import React from "react";
import Link from "next/link";
import type { PrFile } from "@devdigest/shared";
import { isInDiff, parseFileRef } from "../../helpers";
import { s } from "./styles";

interface BriefFileLinkProps {
  /** Text shown; also parsed for the target (`path`, `path:12`, `path:12-18`). */
  fileRef: string;
  files: PrFile[];
  fileHref: (path: string, line: number | null) => string;
  onNotInDiff: () => void;
}

export function BriefFileLink({ fileRef, files, fileHref, onNotInDiff }: BriefFileLinkProps) {
  const { path, line } = parseFileRef(fileRef);
  if (isInDiff(files, path)) {
    return (
      <Link href={fileHref(path, line)} className="mono" style={s.link}>
        {fileRef}
      </Link>
    );
  }
  return (
    <button type="button" className="mono" style={s.link} onClick={onNotInDiff}>
      {fileRef}
    </button>
  );
}
