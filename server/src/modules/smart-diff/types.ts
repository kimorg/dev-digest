/** Smart-diff module types (plain data, no rows). Used by domain, ports and the repository. */

export interface SmartDiffSourceFile {
  path: string;
  additions: number;
  deletions: number;
}

/** A review's identity only; heads are listed newest-first. */
export interface ReviewHead {
  id: string;
  agentId: string | null;
}

export interface FindingAnchor {
  file: string;
  startLine: number;
  dismissed: boolean;
}
