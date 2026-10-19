import type { ChatMessage } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from '@devdigest/reviewer-core';
import { MAX_CANDIDATES } from './constants.js';
import { renderSample } from './domain.js';
import { ConventionCategory, type ConventionSample } from './types.js';

const SYSTEM = `You extract the house coding conventions of one repository from sample files.

Return up to ${MAX_CANDIDATES} candidates. Each candidate is a rule that is specific to THIS codebase
and that a reviewer could check in a pull request — not generic advice ("write clean code").
Prefer rules that hold across several samples; lint / tsconfig / prettier configs show rules
the tooling enforces.

For every candidate give:
- category: one of ${ConventionCategory.options.join(', ')}.
- rule: one imperative sentence ("Always use async/await instead of .then() chains").
- evidence.file: the sample path exactly as written after "File:".
- evidence.line_start / evidence.line_end: line numbers from the left margin of that sample
  (at most 20 lines).
- evidence.code: the code of those lines copied verbatim, WITHOUT the "NN | " margin.
- confidence: 0..1 — how consistently the rule holds across the samples.

Evidence is checked mechanically against the repository: a candidate whose file, lines or code
don't match is discarded.`;

/** System + user messages for one extraction call; every sample is untrusted data. */
export function buildExtractionMessages(repoName: string, samples: ConventionSample[]): ChatMessage[] {
  const blocks = samples.map((s) => wrapUntrusted(`file:${s.path}`, renderSample(s.path, s.text)));
  return [
    { role: 'system', content: `${SYSTEM}\n\n${INJECTION_GUARD}` },
    {
      role: 'user',
      content: `Repository: ${repoName}\nSample files (${samples.length}):\n\n${blocks.join('\n\n')}`,
    },
  ];
}
