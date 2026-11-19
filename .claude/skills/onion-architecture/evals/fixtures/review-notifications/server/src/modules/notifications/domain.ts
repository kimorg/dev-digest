import { MAX_FINDINGS_IN_MESSAGE } from './constants.js';
import type { ReviewSummaryInput, Severity, SlackMessage, SummaryFinding } from './types.js';

const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

export function countBySeverity(findings: SummaryFinding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

export function topFindings(findings: SummaryFinding[], max = MAX_FINDINGS_IN_MESSAGE): SummaryFinding[] {
  return [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]).slice(0, max);
}

export function formatSummary(input: ReviewSummaryInput): SlackMessage {
  const counts = countBySeverity(input.findings);
  const headline =
    `*${input.repo}#${input.prNumber}* ${input.prTitle} — ${input.agentName}: ` +
    `${counts.CRITICAL} critical, ${counts.WARNING} warnings, ${counts.SUGGESTION} suggestions`;
  const lines = topFindings(input.findings).map(
    (f) => `• [${f.severity}] ${f.title} (${f.file}${f.line ? `:${f.line}` : ''})`,
  );
  return {
    text: headline,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: headline } },
      ...(lines.length ? [{ type: 'section' as const, text: { type: 'mrkdwn' as const, text: lines.join('\n') } }] : []),
    ],
  };
}
