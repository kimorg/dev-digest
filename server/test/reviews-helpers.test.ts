import { describe, it, expect } from 'vitest';
import { countPromptTokens, taskLine } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

describe('countPromptTokens', () => {
  it('counts the intent slot; null when the slot is absent', () => {
    const count = (t: string) => t.length;
    const base = { system: 'sys', user: 'user' };
    expect(countPromptTokens({ ...base, intent: 'abcde' }, count).intent).toBe(5);
    expect(countPromptTokens({ ...base, intent: null }, count).intent).toBeNull();
    expect(countPromptTokens(base, count).intent).toBeNull();
  });
});
