import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { ClientOptions } from '@anthropic-ai/sdk';
import { AnthropicProvider } from '../src/adapters/llm/anthropic.js';
import { ExternalServiceError } from '../src/platform/errors.js';

/**
 * AnthropicProvider.completeStructured against a stubbed `fetch` — no network.
 * Claude Sonnet 5.5 / Opus 5.5 / Fable 5.1 reject a forced tool_choice and
 * non-default temperature, so the request shape is asserted here.
 */

const Answer = z.object({ answer: z.string() });
const MODEL = 'claude-sonnet-5-5';

type Block = Record<string, unknown>;

function message(content: Block[], stopReason = 'end_turn') {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 100 },
  };
}

const toolUse = (input: unknown, id = 'toolu_1'): Block => ({
  type: 'tool_use',
  id,
  name: 'Answer',
  input,
});

/** Returns the queued responses in order and records every request body. */
function stubProvider(responses: unknown[]) {
  const bodies: Record<string, any>[] = [];
  const fetch = async (_url: unknown, init?: { body?: unknown }) => {
    bodies.push(JSON.parse(String(init?.body)));
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    return new Response(JSON.stringify(next), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const llm = new AnthropicProvider('test-key', {
    fetch: fetch as unknown as ClientOptions['fetch'],
    maxRetries: 0,
  });
  return { llm, bodies };
}

const request = {
  model: MODEL,
  schema: Answer,
  schemaName: 'Answer',
  messages: [
    { role: 'system' as const, content: 'You are a reviewer.' },
    { role: 'user' as const, content: 'Review this.' },
  ],
};

describe('AnthropicProvider.completeStructured', () => {
  it('offers the tool with tool_choice auto and sends no temperature', async () => {
    const { llm, bodies } = stubProvider([message([toolUse({ answer: 'ok' })], 'tool_use')]);

    const res = await llm.completeStructured(request);

    expect(res.data).toEqual({ answer: 'ok' });
    expect(res.attempts).toBe(1);
    expect(res.costUsd).not.toBeNull();
    const body = bodies[0]!;
    expect(body.tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: true });
    expect(body).not.toHaveProperty('temperature');
    expect(body.max_tokens).toBe(16_000);
    expect(body.system).toContain('You are a reviewer.');
    expect(body.system).toContain('calling the `Answer` tool');
  });

  it('answers an invalid tool_use with a tool_result for the same id', async () => {
    const { llm, bodies } = stubProvider([
      message([toolUse({ wrong: 1 }, 'toolu_bad')], 'tool_use'),
      message([toolUse({ answer: 'fixed' }, 'toolu_good')], 'tool_use'),
    ]);

    const res = await llm.completeStructured(request);

    expect(res.data).toEqual({ answer: 'fixed' });
    expect(res.attempts).toBe(2);
    const retry = bodies[1]!.messages;
    expect(retry.at(-2).role).toBe('assistant');
    expect(retry.at(-1).role).toBe('user');
    expect(retry.at(-1).content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'toolu_bad',
      is_error: true,
    });
  });

  it('accepts JSON returned as text instead of a tool call', async () => {
    const { llm } = stubProvider([message([{ type: 'text', text: '{"answer":"from text"}' }])]);

    const res = await llm.completeStructured(request);

    expect(res.data).toEqual({ answer: 'from text' });
  });

  it('reprompts with plain text when the model neither calls the tool nor returns JSON', async () => {
    const { llm, bodies } = stubProvider([
      message([{ type: 'text', text: 'Looks fine to me.' }]),
      message([toolUse({ answer: 'ok' })], 'tool_use'),
    ]);

    const res = await llm.completeStructured(request);

    expect(res.attempts).toBe(2);
    const last = bodies[1]!.messages.at(-1);
    expect(typeof last.content).toBe('string');
    expect(last.content).toContain('calling the `Answer` tool');
  });

  it('fails without retrying on a refusal', async () => {
    const { llm, bodies } = stubProvider([message([], 'refusal')]);

    await expect(llm.completeStructured(request)).rejects.toBeInstanceOf(ExternalServiceError);
    expect(bodies).toHaveLength(1);
  });

  it('fails without retrying when the output hits max_tokens', async () => {
    const { llm, bodies } = stubProvider([
      message([{ type: 'text', text: '{"answer": "cut' }], 'max_tokens'),
    ]);

    await expect(llm.completeStructured(request)).rejects.toThrow(/max_tokens/);
    expect(bodies).toHaveLength(1);
  });
});
