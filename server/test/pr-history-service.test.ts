import { describe, it, expect } from 'vitest';
import type { AssociatedPullRef } from '@devdigest/shared';
import { PrHistoryService } from '../src/modules/pr-history/service.js';
import type { PrHistoryStore, PullHistorySource } from '../src/modules/pr-history/ports.js';
import type { PullForHistory } from '../src/modules/pr-history/types.js';
import { ConfigError, NotFoundError } from '../src/platform/errors.js';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f'].map((p, i) => ({
  path: `${p}.ts`,
  additions: 10 - i,
  deletions: 0,
}));

const PULL: PullForHistory = {
  repo: { owner: 'acme', name: 'api' },
  number: 500,
  base: 'main',
  headSha: 'head1',
  files: FILES,
};

const merged = (n: number): AssociatedPullRef => ({
  number: n,
  title: `PR ${n}`,
  author: 'dev',
  merged_at: `2026-01-${String(n).padStart(2, '0')}T00:00:00Z`,
});

function build(opts: {
  pull?: PullForHistory | undefined;
  shas?: (path: string) => string[];
  pulls?: (sha: string) => AssociatedPullRef[];
  fail?: Error;
  now?: () => number;
}) {
  const calls: string[] = [];
  const store: PrHistoryStore = {
    getPullForHistory: async () => ('pull' in opts ? opts.pull : PULL),
  };
  const source: PullHistorySource = {
    listCommitShasForPath: async (_repo, path) => {
      calls.push(`commits:${path}`);
      if (opts.fail) throw opts.fail;
      return (opts.shas ?? ((p) => [`${p}-1`, `${p}-2`]))(path);
    },
    listPullsForCommit: async (_repo, sha) => {
      calls.push(`pulls:${sha}`);
      return (opts.pulls ?? (() => []))(sha);
    },
  };
  const service = new PrHistoryService({ store, source, now: opts.now ?? (() => 0) });
  return { service, calls };
}

describe('PrHistoryService', () => {
  it('unknown PR is a NotFoundError', async () => {
    const { service } = build({ pull: undefined });
    await expect(service.get('ws', 'pr')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('degrades to no_token on a ConfigError and to github_error on anything else, without throwing', async () => {
    const a = await build({ fail: new ConfigError('GITHUB_TOKEN is not configured') }).service.get('ws', 'pr');
    expect(a).toEqual({ history: [], degraded: true, reason: 'no_token' });
    const b = await build({ fail: new Error('boom') }).service.get('ws', 'pr');
    expect(b).toEqual({ history: [], degraded: true, reason: 'github_error' });
  });

  it('serves a repeated request from the cache until the TTL passes; degraded results are not cached', async () => {
    let t = 0;
    const { service, calls } = build({ pulls: (sha) => (sha === 'a.ts-1' ? [merged(3)] : []), now: () => t });
    const first = await service.get('ws', 'pr');
    expect(first.history.map((h) => h.pr_number)).toEqual([3]);
    const n = calls.length;
    await service.get('ws', 'pr');
    expect(calls.length).toBe(n);
    t = 11 * 60_000;
    await service.get('ws', 'pr');
    expect(calls.length).toBeGreaterThan(n);

    const failing = build({ fail: new Error('x') });
    await failing.service.get('ws', 'pr');
    const before = failing.calls.length;
    await failing.service.get('ws', 'pr');
    expect(failing.calls.length).toBeGreaterThan(before);
  });

  it('stops after the first sha batch once 5 merged PRs are found', async () => {
    const { service, calls } = build({
      shas: (p) => [`${p}-1`, `${p}-2`],
      pulls: (sha) => (sha.endsWith('-1') ? [merged(sha.charCodeAt(0))] : []),
    });
    const out = await service.get('ws', 'pr');
    expect(out.history).toHaveLength(5);
    // 5 files x commits, then ONE batch of 5 shas (the newest of each file); the second batch is never requested.
    expect(calls.filter((c) => c.startsWith('commits:'))).toHaveLength(5);
    expect(calls.filter((c) => c.startsWith('pulls:'))).toHaveLength(5);
  });

  it('worst case with no merged PRs: 5 + 10 = 15 requests', async () => {
    const { service, calls } = build({ shas: (p) => [`${p}-1`, `${p}-2`, `${p}-3`], pulls: () => [] });
    const out = await service.get('ws', 'pr');
    expect(out.history).toEqual([]);
    expect(out.degraded).toBe(false);
    expect(calls).toHaveLength(15);
  });
});
