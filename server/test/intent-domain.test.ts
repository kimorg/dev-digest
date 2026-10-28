import { describe, it, expect } from 'vitest';
import {
  buildIntentSources,
  computeIntentFingerprint,
  contentFromAddedFilePatch,
  deriveConfidence,
  extractDocRefs,
  extractIssueRef,
  normalizeIntent,
  shouldApplyScopeFilter,
} from '../src/modules/intent/domain.js';

const REPO = 'acme/payments-api';

describe('extractDocRefs', () => {
  it('keeps relative text docs and same-repo blob URLs (reduced to a path); rejects the rest', () => {
    const body = [
      'See docs/rate-limits.md and ./specs/004.mdx',
      `Also https://github.com/${REPO}/blob/main/notes/plan.txt`,
      'https://github.com/evil/other/blob/main/secret.md',
      'https://example.com/docs/x.md',
      '../outside.md and .env',
      `https://github.com/${REPO}/blob/main/../../etc.md`,
    ].join('\n');
    expect(extractDocRefs(body, REPO)).toEqual(['notes/plan.txt', 'docs/rate-limits.md', 'specs/004.mdx']);
  });

  it('rejects percent-encoded paths that decode to delimiter characters', () => {
    const body = `https://github.com/${REPO}/blob/main/docs/%22%3E%3C/untrusted%3E.md and docs/ok.md`;
    expect(extractDocRefs(body, REPO)).toEqual(['docs/ok.md']);
  });

  it('follows linked OpenAPI / JSON-schema specs', () => {
    expect(extractDocRefs('Contract: api/openapi.yaml, schema in config/app.json', REPO)).toEqual([
      'api/openapi.yaml',
      'config/app.json',
    ]);
  });

  it('caps the number of docs', () => {
    expect(extractDocRefs('a.md b.md c.md d.md e.md', REPO)).toHaveLength(3);
  });
});

describe('extractIssueRef', () => {
  it('prefers a closing keyword, then a same-repo issue URL, then a bare #N', () => {
    expect(extractIssueRef('relates to #5, fixes #12', REPO)).toBe(12);
    expect(extractIssueRef(`see https://github.com/${REPO}/issues/33`, REPO)).toBe(33);
    expect(extractIssueRef('https://github.com/other/repo/issues/33', REPO)).toBeUndefined();
    expect(extractIssueRef('part of #7', REPO)).toBe(7);
    expect(extractIssueRef('nothing', REPO)).toBeUndefined();
  });
});

describe('contentFromAddedFilePatch', () => {
  it('returns the + lines of an added file, undefined for a modified one', () => {
    expect(contentFromAddedFilePatch('@@ -0,0 +1,2 @@\n+# Title\n+body')).toBe('# Title\nbody');
    expect(contentFromAddedFilePatch('@@ -1,2 +1,3 @@\n a\n+b')).toBeUndefined();
    expect(contentFromAddedFilePatch(null)).toBeUndefined();
  });
});

describe('computeIntentFingerprint', () => {
  const base = {
    provider: 'openai',
    model: 'gpt-4.1',
    title: 't',
    body: 'b',
    headSha: 'abc',
    docs: [{ path: 'a.md', content: 'x' }],
  };
  it('changes with title, body, head, doc content, provider and model; not with doc order', () => {
    const f = computeIntentFingerprint(base);
    expect(computeIntentFingerprint({ ...base })).toBe(f);
    for (const change of [
      { title: 't2' },
      { body: 'b2' },
      { headSha: 'def' },
      { docs: [{ path: 'a.md', content: 'y' }] },
      { docs: [{ path: 'a.md', content: undefined }] },
      { model: 'gpt-5' },
      { provider: 'anthropic' },
    ]) {
      expect(computeIntentFingerprint({ ...base, ...change })).not.toBe(f);
    }
    const two = [
      { path: 'a.md', content: 'x' },
      { path: 'b.md', content: 'y' },
    ];
    expect(computeIntentFingerprint({ ...base, docs: two })).toBe(
      computeIntentFingerprint({ ...base, docs: [...two].reverse() }),
    );
  });
});

describe('deriveConfidence / buildIntentSources / normalizeIntent', () => {
  it('scores confidence from the evidence read', () => {
    expect(deriveConfidence({ docsLoaded: 1, issueLoaded: false, bodyChars: 0 })).toBe('high');
    expect(deriveConfidence({ docsLoaded: 0, issueLoaded: true, bodyChars: 0 })).toBe('high');
    expect(deriveConfidence({ docsLoaded: 0, issueLoaded: false, bodyChars: 200 })).toBe('medium');
    expect(deriveConfidence({ docsLoaded: 0, issueLoaded: false, bodyChars: 10 })).toBe('low');
  });

  it('lists the sources actually used', () => {
    const s = buildIntentSources({
      hasBody: true,
      issueNumber: 4,
      docPaths: ['a.md'],
      hasCommits: true,
      hasFiles: false,
    });
    expect(s.map((x) => x.kind)).toEqual(['title', 'branch', 'description', 'issue', 'doc', 'commits']);
    expect(s[3]!.ref).toBe('#4');
  });

  it('trims and clamps the model answer', () => {
    const out = normalizeIntent({
      intent: '  x  ',
      in_scope: [' a ', '', ...Array.from({ length: 10 }, (_, i) => `i${i}`)],
      out_of_scope: [],
    });
    expect(out.intent).toBe('x');
    expect(out.in_scope).toHaveLength(6);
  });

  it('drops duplicate scope items case-insensitively before clamping', () => {
    const out = normalizeIntent({
      intent: 'x',
      in_scope: ['Add tests', ' add tests ', 'ADD TESTS', 'Add limiter'],
      out_of_scope: ['Auth', 'auth'],
    });
    expect(out.in_scope).toEqual(['Add tests', 'Add limiter']);
    expect(out.out_of_scope).toEqual(['Auth']);
  });
});

describe('shouldApplyScopeFilter', () => {
  it('skips the scope filter only at low confidence', () => {
    expect(shouldApplyScopeFilter('low')).toBe(false);
    expect(shouldApplyScopeFilter('medium')).toBe(true);
    expect(shouldApplyScopeFilter('high')).toBe(true);
  });
});
