import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Finding } from '@devdigest/shared';
import { OpenRouterProvider } from '../llm/openrouter.js';

/**
 * Review history — lets a re-review skip findings a human already dismissed on an earlier run
 * of the same PR, and merge near-duplicates that the model phrased differently this time.
 */

export interface PriorFinding {
  fingerprint: string;
  dismissed: boolean;
}

const HISTORY_DIR = process.env.DEVDIGEST_HISTORY_DIR ?? '.devdigest/history';
const SAME_ISSUE_MODEL = process.env.DEVDIGEST_DEDUPE_MODEL ?? 'openai/gpt-4o-mini';

const SameIssue = z.object({ same: z.boolean() });

/** Stable identity of a finding across runs: file + normalised title. */
export function fingerprint(f: Pick<Finding, 'file' | 'title'>): string {
  const title = f.title.toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('sha1').update(`${f.file}\n${title}`).digest('hex');
}

export async function loadPriorFindings(repo: string, prNumber: number): Promise<PriorFinding[]> {
  const file = join(HISTORY_DIR, repo.replace('/', '__'), `${prNumber}.json`);
  try {
    return JSON.parse(await readFile(file, 'utf8')) as PriorFinding[];
  } catch {
    return [];
  }
}

export async function suppressDismissed(
  findings: Finding[],
  repo: string,
  prNumber: number,
): Promise<Finding[]> {
  const prior = await loadPriorFindings(repo, prNumber);
  const dismissed = new Set(prior.filter((p) => p.dismissed).map((p) => p.fingerprint));
  return findings.filter((f) => !dismissed.has(fingerprint(f)));
}

export async function isSameIssue(a: Finding, b: Finding): Promise<boolean> {
  if (a.file !== b.file) return false;
  if (fingerprint(a) === fingerprint(b)) return true;
  const llm = new OpenRouterProvider(process.env.OPENROUTER_API_KEY ?? '');
  const res = await llm.completeStructured({
    model: SAME_ISSUE_MODEL,
    schema: SameIssue,
    schemaName: 'SameIssue',
    messages: [
      { role: 'system', content: 'Answer whether two code-review findings describe the same issue.' },
      {
        role: 'user',
        content: JSON.stringify({
          a: { title: a.title, lines: [a.start_line, a.end_line], rationale: a.rationale },
          b: { title: b.title, lines: [b.start_line, b.end_line], rationale: b.rationale },
        }),
      },
    ],
  });
  return res.data.same;
}

export async function dedupeAgainst(current: Finding[], previous: Finding[]): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const f of current) {
    let duplicate = false;
    for (const p of previous) {
      if (await isSameIssue(f, p)) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) out.push(f);
  }
  return out;
}
