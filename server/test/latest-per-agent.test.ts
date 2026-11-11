import { describe, it, expect } from 'vitest';
import { pickLatestPerAgent } from '@devdigest/shared';

type R = { id: string; agent: string | null | undefined; pr?: string };

describe('pickLatestPerAgent (AC-20 rule)', () => {
  it('newest-first input keeps the first item per agent, in input order', () => {
    const items: R[] = [
      { id: '3', agent: 'A' },
      { id: '2', agent: 'B' },
      { id: '1', agent: 'A' },
    ];
    expect(pickLatestPerAgent(items, (r) => r.agent).map((r) => r.id)).toEqual(['3', '2']);
  });

  it('null and undefined agents form one group', () => {
    const items: R[] = [
      { id: '4', agent: null },
      { id: '3', agent: undefined },
      { id: '2', agent: 'A' },
      { id: '1', agent: null },
    ];
    expect(pickLatestPerAgent(items, (r) => r.agent).map((r) => r.id)).toEqual(['4', '2']);
  });

  it('a composite key groups per PR and agent', () => {
    const items: R[] = [
      { id: '4', agent: 'A', pr: 'p1' },
      { id: '3', agent: 'A', pr: 'p2' },
      { id: '2', agent: 'A', pr: 'p1' },
    ];
    expect(pickLatestPerAgent(items, (r) => `${r.pr}:${r.agent}`).map((r) => r.id)).toEqual(['4', '3']);
  });

  it('empty input gives empty output', () => {
    expect(pickLatestPerAgent([], () => 'x')).toEqual([]);
  });
});
