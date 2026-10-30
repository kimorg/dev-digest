import type { ChatMessage } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from '@devdigest/reviewer-core';
import { MAX_SCOPE_ITEMS } from './constants.js';

const SYSTEM = `You work out what one pull request sets out to change, from the information the author and repository give about it.

Answer with:
- intent: one or two sentences — what the PR is for.
- in_scope: up to ${MAX_SCOPE_ITEMS} short items the PR is meant to change.
- out_of_scope: up to ${MAX_SCOPE_ITEMS} short items the PR does NOT set out to change (explicit non-goals, or neighbouring areas it leaves alone). Empty if nothing is stated.

Use only the information given. If it is thin, stay general rather than inventing detail.`;

export interface IntentIssue {
  number: number;
  title: string;
  body: string | null;
}

export interface IntentPromptSources {
  title: string;
  branch: string;
  body: string | null;
  issue?: IntentIssue;
  docs: { path: string; content: string }[];
  commits: string[];
  files: { path: string; additions: number; deletions: number }[];
}

/** System + user messages for one intent call; every source is untrusted data. */
export function buildIntentMessages(src: IntentPromptSources): ChatMessage[] {
  const blocks: string[] = [
    wrapUntrusted('pr-title', src.title),
    wrapUntrusted('pr-branch', src.branch),
  ];
  if (src.body) blocks.push(wrapUntrusted('pr-description', src.body));
  if (src.issue) {
    blocks.push(
      wrapUntrusted(
        `issue-#${src.issue.number}`,
        `${src.issue.title}\n\n${src.issue.body ?? ''}`.trim(),
      ),
    );
  }
  for (const d of src.docs) blocks.push(wrapUntrusted(`doc:${d.path}`, d.content));
  if (src.commits.length > 0) blocks.push(wrapUntrusted('commits', src.commits.join('\n')));
  if (src.files.length > 0) {
    blocks.push(
      wrapUntrusted(
        'files',
        src.files.map((f) => `${f.path} (+${f.additions} -${f.deletions})`).join('\n'),
      ),
    );
  }
  return [
    { role: 'system', content: `${SYSTEM}\n\n${INJECTION_GUARD}` },
    { role: 'user', content: blocks.join('\n\n') },
  ];
}
