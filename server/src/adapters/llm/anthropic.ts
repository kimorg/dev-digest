import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  ChatMessage,
} from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { toJsonSchema, parseWithRepair } from '../../platform/structured.js';
import { estimateCost } from './pricing.js';
import { ExternalServiceError } from '../../platform/errors.js';

// Claude 5.x thinks by default: thinking adds latency and counts toward max_tokens.
const DEFAULT_TIMEOUT = 180_000;
const DEFAULT_MAX_TOKENS = 16_000;

/** Anthropic has no embeddings API; embeddings come from the OpenAI Embedder. */
function splitSystem(messages: ChatMessage[]): {
  system: string;
  rest: Anthropic.MessageParam[];
} {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  return { system, rest };
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * Anthropic LLMProvider.
 * - listModels: dynamic via GET /models.
 * - completeStructured: tool-use with tool_choice `auto` (Claude Sonnet 5.5,
 *   Opus 5.5 and Fable 5.1 reject a forced tool_choice) — the system prompt asks
 *   for the tool; parse tool_use.input (or JSON in text), Zod validate + reprompt.
 * - No `temperature`: Claude 5.x models reject non-default sampling values.
 * - embed: NOT supported (throws) — use the OpenAI Embedder for vectors.
 */
export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const;
  private client: Anthropic;

  /** `options` lets tests inject `fetch` and turn off SDK retries. */
  constructor(apiKey: string, options: Pick<ClientOptions, 'fetch' | 'maxRetries'> = {}) {
    this.client = new Anthropic({ apiKey, ...options });
  }

  async listModels(): Promise<ModelInfo[]> {
    return withRetry(async () => {
      // SDK 0.33 exposes models.list()
      const res = await this.client.models.list();
      return res.data.map((m) => ({
        id: m.id,
        provider: 'anthropic' as const,
        label: m.display_name,
      }));
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return withRetry(() => withTimeout(this.doComplete(req), req.timeoutMs ?? DEFAULT_TIMEOUT));
  }

  private async doComplete(req: CompletionRequest): Promise<CompletionResult> {
    const { system, rest } = splitSystem(req.messages);
    const res = await this.client.messages.create({
      model: req.model,
      system: system || undefined,
      messages: rest,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    });
    const text = textOf(res.content);
    const tokensIn = res.usage.input_tokens;
    const tokensOut = res.usage.output_tokens;
    return {
      text,
      model: req.model,
      tokensIn,
      tokensOut,
      costUsd: estimateCost(req.model, tokensIn, tokensOut),
    };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const jsonSchema = toJsonSchema(req.schema, req.schemaName);
    const toolName = req.schemaName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const maxRetries = req.maxRetries ?? 2;
    const { system, rest } = splitSystem(req.messages);
    const instruction = `Always answer by calling the \`${toolName}\` tool exactly once.`;
    const messages: Anthropic.MessageParam[] = [...rest];
    let tokensIn = 0;
    let tokensOut = 0;
    let lastRaw = '';

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const res = await withRetry(() =>
        withTimeout(
          this.client.messages.create({
            model: req.model,
            system: system ? `${system}\n\n${instruction}` : instruction,
            messages,
            max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
            tools: [
              {
                name: toolName,
                description: `Return the result as ${req.schemaName}.`,
                input_schema: jsonSchema.schema as Anthropic.Tool.InputSchema,
              },
            ],
            tool_choice: { type: 'auto', disable_parallel_tool_use: true },
          }),
          req.timeoutMs ?? DEFAULT_TIMEOUT,
        ),
      );
      tokensIn += res.usage.input_tokens;
      tokensOut += res.usage.output_tokens;

      // SDK 0.33 types don't list 'refusal'; the same request would be refused again.
      if ((res.stop_reason as string) === 'refusal') {
        throw new ExternalServiceError('Anthropic declined the request (stop_reason: refusal)', {
          model: req.model,
        });
      }

      const toolUse = res.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      // With tool_choice `auto` the model may answer in text instead of calling the tool.
      lastRaw = toolUse ? JSON.stringify(toolUse.input) : textOf(res.content);

      const parsed = parseWithRepair(req.schema, lastRaw);
      if (parsed.ok) {
        return {
          data: parsed.data,
          model: req.model,
          tokensIn,
          tokensOut,
          costUsd: estimateCost(req.model, tokensIn, tokensOut),
          raw: lastRaw,
          attempts: attempt,
        };
      }
      // A retry with the same budget would be cut off again.
      if (res.stop_reason === 'max_tokens') {
        throw new ExternalServiceError('Anthropic output hit max_tokens before a valid result', {
          raw: lastRaw,
        });
      }
      messages.push({ role: 'assistant', content: res.content });
      // The API requires a tool_use to be answered by a tool_result with the same id.
      messages.push({
        role: 'user',
        content: toolUse
          ? [
              {
                type: 'tool_result',
                tool_use_id: toolUse.id,
                is_error: true,
                content: parsed.repromptMessage,
              },
            ]
          : `${parsed.repromptMessage}\n\n${instruction}`,
      });
    }

    throw new ExternalServiceError('Anthropic structured output failed schema validation', {
      raw: lastRaw,
    });
  }

  async embed(): Promise<number[][]> {
    throw new ExternalServiceError(
      'Anthropic does not provide embeddings; use the OpenAI Embedder.',
    );
  }
}
