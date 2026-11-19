export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';

export interface SummaryFinding {
  severity: Severity;
  title: string;
  file: string;
  line: number | null;
}

export interface ReviewSummaryInput {
  repo: string;
  prNumber: number;
  prTitle: string;
  agentName: string;
  findings: SummaryFinding[];
}

export interface SlackMessage {
  text: string;
  blocks: { type: 'section'; text: { type: 'mrkdwn'; text: string } }[];
}
