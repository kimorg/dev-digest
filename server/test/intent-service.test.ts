import { describe, expect, it } from 'vitest';
import type { PrIntentRecord } from '@devdigest/shared';
import { IntentService } from '../src/modules/intent/service.js';
import type { IntentPull, NewPrIntent } from '../src/modules/intent/ports.js';

const WS_A = 'ws-a';
const WS_B = 'ws-b';
const PR = 'pr-1';

const PULL: IntentPull = {
  id: PR,
  repo: { owner: 'acme', name: 'api', fullName: 'acme/api' },
  title: 'Add rate limiting',
  branch: 'feat/rl',
  headSha: 'abc',
  body: null,
  files: [],
  commits: [],
};

/** A service whose PR exists only in WS_A and whose model call waits until released. */
function setup() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let modelCalls = 0;
  const service = new IntentService({
    store: {
      getPullSources: async (ws) => (ws === WS_A ? PULL : undefined),
      getIntent: async () => undefined,
      upsertIntent: async (prId: string, rec: NewPrIntent): Promise<PrIntentRecord> => ({
        ...rec.intent,
        pr_id: prId,
        confidence: rec.confidence,
        sources: rec.sources,
        provider: rec.provider,
        model: rec.model,
        generated_at: new Date(0).toISOString(),
      }),
    },
    files: { readFile: async () => undefined },
    issues: { getIssue: async () => undefined },
    model: {
      resolve: async () => ({ provider: 'openai', model: 'gpt-4.1' }),
      derive: async () => {
        modelCalls += 1;
        await gate;
        return {
          data: { intent: 'Add rate limiting', in_scope: [], out_of_scope: [] },
          provider: 'openai',
          model: 'gpt-4.1',
          tokensIn: 10,
          tokensOut: 5,
          costUsd: null,
        };
      },
    },
  });
  return { service, release, modelCalls: () => modelCalls };
}

describe('IntentService.ensure — single-flight', () => {
  it('shares one in-flight generation within a workspace', async () => {
    const { service, release, modelCalls } = setup();
    const a = service.ensure(WS_A, PR);
    const b = service.ensure(WS_A, PR);
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(modelCalls()).toBe(1);
    expect(rb).toBe(ra);
  });

  it('never hands another workspace the in-flight result for the same PR id', async () => {
    const { service, release, modelCalls } = setup();
    const a = service.ensure(WS_A, PR);
    await expect(service.ensure(WS_B, PR)).rejects.toMatchObject({ code: 'not_found' });
    release();
    await expect(a).resolves.toMatchObject({ result: { regenerated: true } });
    expect(modelCalls()).toBe(1);
  });
});
