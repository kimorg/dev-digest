import type { ChatMessage } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from '@devdigest/reviewer-core';
import { MAX_FOCUS, MAX_RISKS } from './constants.js';
import type { BriefSections } from './types.js';

export const BRIEF_SYSTEM = `You write a brief of one pull request for the engineer who must review it.

Answer with:
- summary: at most 3 sentences — what the PR does and why.
- risks: up to ${MAX_RISKS} areas where the change is dangerous. Each has a kind (a short word such as security, data, performance, api, concurrency, tests), a short title, an explanation, a severity (high, medium or low) and file_refs: paths from the information below, optionally with a line as "path:line".
- review_focus: up to ${MAX_FOCUS} places to read first, each a file path from the information below, a line number in the new version of that file (at least 1) and a short reason.

Use only file paths that appear in the information below. Never invent a path. Use only the information given; if it is thin, stay general rather than inventing detail.`;

/** System + user messages for one brief call; every section is untrusted data. */
export function buildBriefMessages(s: BriefSections): ChatMessage[] {
  const blocks: string[] = [`## PR title\n${wrapUntrusted('pr-title', s.title)}`];
  if (s.description) blocks.push(`## PR description\n${wrapUntrusted('pr-description', s.description)}`);
  if (s.issue) blocks.push(`## Linked issue\n${wrapUntrusted('linked-issue', s.issue)}`);
  if (s.intent) blocks.push(`## PR intent\n${wrapUntrusted('pr-intent', s.intent)}`);
  blocks.push(`## Blast radius\n${wrapUntrusted('blast-radius', s.blast)}`);
  blocks.push(`## Changed files\n${wrapUntrusted('diff-stats', s.stats)}`);
  for (const d of s.docs) blocks.push(`## Project context\n${wrapUntrusted(`doc:${d.path}`, d.content)}`);
  return [
    { role: 'system', content: `${BRIEF_SYSTEM}\n\n${INJECTION_GUARD}` },
    { role: 'user', content: blocks.join('\n\n') },
  ];
}
