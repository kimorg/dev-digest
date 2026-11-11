import { describe, it, expect, vi } from 'vitest';
import type { BlastRadius, PrBriefRecord } from '@devdigest/shared';
import { BriefService, type BriefServiceDeps } from '../src/modules/brief/service.js';
import type { BriefPull } from '../src/modules/brief/ports.js';
import { ExternalServiceError } from '../src/platform/errors.js';

const blast: BlastRadius = {
  changed_symbols: [],
  downstream: [],
  summary: 'blast',
  degraded: false,
  reason: null,
  caller_facts: [],
};

const pull: BriefPull = {
  id: 'pr1',
  repo: { owner: 'acme', name: 'api', fullName: 'acme/api', clonePath: '/clone' },
  title: 'Title',
  body: 'Fixes #7',
  headSha: 'sha-1',
  files: [{ path: 'a.ts', additions: 3, deletions: 1 }],
};

const modelOut = {
  data: {
    summary: 'sum',
    risks: [{ kind: 'k', title: 't', explanation: 'e', severity: 'high' as const, file_refs: ['a.ts', 'ghost.ts'] }],
    review_focus: [
      { file: 'a.ts', line: 2, reason: 'r' },
      { file: 'ghost.ts', line: 2, reason: 'x' },
    ],
  },
  provider: 'openai',
  model: 'gpt-4.1',
  tokensIn: 10,
  tokensOut: 5,
  costUsd: 0.01,
};

function setup(over: Partial<BriefServiceDeps> = {}) {
  const stored: PrBriefRecord[] = [];
  const messagesSeen: { role: string; content: string }[][] = [];
  const log = { info: vi.fn() };
  const deps: BriefServiceDeps = {
    store: {
      getPullSources: async () => pull,
      getBrief: async () => stored[0],
      listReviewRunsForPull: async () => [],
      listSpecsReadForRuns: async () => [],
      upsertBrief: vi.fn(async (_id: string, r: PrBriefRecord) => {
        stored[0] = r;
        return r;
      }),
    },
    blast: { get: async () => blast },
    intent: { get: async () => null },
    issues: { getIssue: async () => undefined },
    docs: { read: async () => undefined },
    model: {
      resolve: async () => ({ provider: 'openai', model: 'gpt-4.1' }),
      generate: vi.fn(async (_c, m) => {
        messagesSeen.push(m);
        return modelOut;
      }),
    },
    log,
    ...over,
  };
  return { svc: new BriefService(deps), deps, log, stored, messagesSeen };
}

describe('BriefService.generate', () => {
  it('concurrent calls share one model call and one result (AC-10, EC-2)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { svc, deps } = setup({
      model: {
        resolve: async () => ({ provider: 'openai', model: 'gpt-4.1' }),
        generate: vi.fn(async () => {
          await gate;
          return modelOut;
        }),
      },
    });
    const a = svc.generate('ws', 'pr1');
    const b = svc.generate('ws', 'pr1');
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(deps.model.generate).toHaveBeenCalledTimes(1);
    expect(ra).toEqual(rb);
    // after settling, a new call generates again
    await svc.generate('ws', 'pr1');
    expect(deps.model.generate).toHaveBeenCalledTimes(2);
  });

  it('regenerates even when the stored brief is fresh (AC-9)', async () => {
    const { svc, deps, stored } = setup();
    await svc.generate('ws', 'pr1');
    expect((await svc.get('ws', 'pr1')).stale).toBe(false);
    await svc.generate('ws', 'pr1');
    expect(deps.model.generate).toHaveBeenCalledTimes(2);
    expect(stored[0]!.head_sha).toBe('sha-1');
  });

  it('a failing or timing-out model → ExternalServiceError and nothing stored (AC-12)', async () => {
    for (const err of [new Error('boom'), new Error('Request timed out')]) {
      const { svc, deps } = setup({
        model: {
          resolve: async () => ({ provider: 'openai', model: 'gpt-4.1' }),
          generate: async () => {
            throw err;
          },
        },
      });
      await expect(svc.generate('ws', 'pr1')).rejects.toBeInstanceOf(ExternalServiceError);
      expect(deps.store.upsertBrief).not.toHaveBeenCalled();
    }
  });

  it('with no intent, issue or docs: sections missing and intent null (AC-21…AC-23)', async () => {
    const { svc, messagesSeen } = setup();
    const view = await svc.generate('ws', 'pr1');
    expect(view.brief!.intent).toBeNull();
    const user = messagesSeen[0]!.find((m) => m.role === 'user')!.content;
    expect(user).not.toContain('Linked issue');
    expect(user).not.toContain('PR intent');
    expect(user).not.toContain('Project context');
    expect(user).toContain('PR description');
  });

  it('a failing issue/doc read does not abort; present sections are included (AC-20, AC-21)', async () => {
    const { svc, messagesSeen } = setup({
      issues: { getIssue: async () => ({ number: 7, title: 'Bug seven', body: null }) },
      intent: { get: async () => ({ intent: 'do it', in_scope: [], out_of_scope: [] }) },
      store: {
        getPullSources: async () => pull,
        getBrief: async () => undefined,
        listReviewRunsForPull: async () => [
          { agentId: 'A', runId: 'r2' },
          { agentId: 'A', runId: 'r1' },
        ],
        listSpecsReadForRuns: async () => [
          { runId: 'r1', specsRead: ['old.md'] },
          { runId: 'r2', specsRead: ['new.md', 'missing.md'] },
        ],
        upsertBrief: async (_i, r) => r,
      },
      docs: { read: async (_c, p) => (p === 'missing.md' ? undefined : `content of ${p}`) },
    });
    const view = await svc.generate('ws', 'pr1');
    const user = messagesSeen[0]!.find((m) => m.role === 'user')!.content;
    expect(user).toContain('Bug seven');
    expect(view.brief!.intent!.intent).toBe('do it');
    expect(user).toContain('content of new.md');
    expect(user).not.toContain('content of old.md'); // only the newest run per agent
    expect(user).not.toContain('missing.md');
  });

  it('logs once: provider, model, tokens, cost, dropped counts, promptChars (R4, NFR-5)', async () => {
    const { svc, log, messagesSeen } = setup();
    await svc.generate('ws', 'pr1');
    expect(log.info).toHaveBeenCalledTimes(1);
    const [obj] = log.info.mock.calls[0]!;
    const chars = messagesSeen[0]!.reduce((n, m) => n + m.content.length, 0);
    expect(obj).toMatchObject({
      provider: 'openai',
      model: 'gpt-4.1',
      tokensIn: 10,
      tokensOut: 5,
      costUsd: 0.01,
      droppedRisks: 0,
      droppedFocus: 1,
      promptChars: chars,
    });
    // never logs prompt text or the summary
    expect(JSON.stringify(obj)).not.toContain('Title');
  });
});
