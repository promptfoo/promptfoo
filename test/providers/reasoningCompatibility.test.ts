import Ajv from 'ajv';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import {
  AnthropicMessagesConfigInputJsonSchema,
  AnthropicMessagesConfigInputSchema,
  AzureResponsesConfigInputSchema,
} from '../../src/contracts';
import { AzureChatCompletionProvider } from '../../src/providers/azure/chat';
import { AzureResponsesProvider } from '../../src/providers/azure/responses';
import { GroqProvider } from '../../src/providers/groq/chat';
import { createMetaProvider } from '../../src/providers/meta';
import { OpenAiResponsesProvider } from '../../src/providers/openai/responses';
import { createMockFetchResponse } from './mockProviderResponses';
import { installTracerSpy } from './openai/tracing';

import type {
  AzureCompletionOptions,
  AzureResponsesOptions,
} from '../../src/providers/azure/types';
import type { CallApiContextParams } from '../../src/types';

vi.mock('../../src/cache', async (original) => ({
  ...(await original<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));
const fixture = { apiKey: 'fixture', apiBaseUrl: 'http://127.0.0.1:1/v1' };
const context = (config: any) => ({ vars: {}, prompt: { raw: 'Hello', label: 'Hello', config } });
beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset();
});
afterEach(() => vi.restoreAllMocks());
describe('reasoning request compatibility', () => {
  it.each([true, false, 'vendor-mode', ['low', 'high']])(
    'forwards compatible raw reasoning %j',
    async (reasoning) => {
      const p = new OpenAiResponsesProvider('vendor-model', {
        config: { ...fixture, passthrough: { reasoning } },
      });
      expect((await p.getOpenAiBody('Hello')).body.reasoning).toEqual(reasoning);
    },
  );
  it.each([true, 'vendor-mode', ['low']])(
    'retains native object-only reasoning policy %j',
    async (reasoning) => {
      const p = new OpenAiResponsesProvider('vendor-model', {
        requestPolicy: 'openai',
        config: { ...fixture, passthrough: { reasoning } },
      });
      await expect(p.getOpenAiBody('Hello')).rejects.toThrow(/reasoning must be an object/i);
    },
  );
  it('lets prompt raw reasoning replace inherited options without executing inherited callbacks', async () => {
    const inherited = vi.fn(() => {
      throw new Error('overridden');
    });
    const provider = new OpenAiResponsesProvider('vendor-model', {
      config: { ...fixture, passthrough: { reasoning: { effort: inherited, summary: 'auto' } } },
    });
    const { body } = await provider.getOpenAiBody(
      'Hello',
      context({ passthrough: { reasoning: true } }),
    );
    expect(body.reasoning).toBe(true);
    expect(inherited).not.toHaveBeenCalled();
  });
  it('honors compatible named full clear over raw value', async () => {
    const p = new OpenAiResponsesProvider('vendor-model', {
      config: { ...fixture, passthrough: { reasoning: true } },
    });
    expect((await p.getOpenAiBody('Hello', context({ reasoning: null }))).body).not.toHaveProperty(
      'reasoning',
    );
  });
  for (const adapter of ['groq', 'meta']) {
    for (const field of ['max_tokens', 'max_completion_tokens']) {
      for (const raw of [false, true]) {
        it(`${adapter} clears ${raw ? 'raw' : 'named'} ${field}`, async () => {
          const p =
            adapter === 'groq'
              ? new GroqProvider('openai/gpt-oss-120b', {
                  config: { ...fixture, max_completion_tokens: 128 },
                })
              : createMetaProvider('meta:chat:muse-spark', {
                  config: { ...fixture, max_completion_tokens: 128 },
                });
          const cfg = raw ? { passthrough: { [field]: null } } : { [field]: null };
          const { body } = await (p as any).getOpenAiBody('Hello', context(cfg));
          expect(body).not.toHaveProperty('max_completion_tokens');
          expect(body).not.toHaveProperty('max_tokens');
        });
      }
    }
  }
  for (const adapter of ['groq', 'meta']) {
    it(`${adapter} preserves zero and prompt alias precedence`, async () => {
      const p =
        adapter === 'groq'
          ? new GroqProvider('openai/gpt-oss-120b', {
              config: { ...fixture, max_completion_tokens: 128 },
            })
          : createMetaProvider('meta:chat:muse-spark', {
              config: { ...fixture, max_completion_tokens: 128 },
            });
      for (const value of [0, 7]) {
        expect(
          (await (p as any).getOpenAiBody('Hello', context({ max_tokens: value }))).body
            .max_completion_tokens,
        ).toBe(value);
      }
    });
  }
  for (const ctx of [undefined, { prompt: { raw: 'Hello', label: 'Hello' } }]) {
    it(`Azure callbacks run once without vars ${ctx ? 'prompt' : 'no context'}`, async () => {
      const chat = vi.fn(() => 'low'),
        responses = vi.fn(() => ({ effort: 'low' }));
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        }),
      );
      const p = new AzureChatCompletionProvider('opaque-alias', {
        config: {
          ...fixture,
          reasoning_effort: chat as unknown as AzureCompletionOptions['reasoning_effort'],
        },
      });
      // JavaScript callers can omit vars and supply runtime callbacks.
      await p.callApi('Hello', ctx as CallApiContextParams | undefined);
      expect(chat).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string).reasoning_effort,
      ).toBe('low');
      vi.mocked(fetchWithCache).mockReset();
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          output: [
            { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] },
          ],
        }),
      );
      const r = new AzureResponsesProvider('opaque-alias', {
        config: {
          ...fixture,
          reasoning: responses as unknown as AzureResponsesOptions['reasoning'],
        },
      });
      await r.callApi('Hello', ctx as CallApiContextParams | undefined);
      expect(responses).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string).reasoning,
      ).toEqual({ effort: 'low' });
    });
  }
  it.each(['END', ['END', 'STOP']])('normalizes Azure traced stops %j', async (stop) => {
    vi.mocked(fetchWithCache).mockResolvedValue(
      createMockFetchResponse({
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
      }),
    );
    const spans = installTracerSpy();
    await new AzureChatCompletionProvider('opaque-alias', { config: { ...fixture, stop } }).callApi(
      'Hello',
    );
    expect(
      spans.find((s) => s.name === 'chat opaque-alias')?.attributes[
        'gen_ai.request.stop_sequences'
      ],
    ).toEqual(typeof stop === 'string' ? [stop] : stop);
    expect(JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string).stop).toEqual(
      stop,
    );
  });
  it.each([0, 1, 5, -1, 0.5, 1.5])('aligns Anthropic MCP Zod/Ajv limit %s', (limit) => {
    const valid = Number.isInteger(limit) && limit >= 0;
    expect(AnthropicMessagesConfigInputSchema.safeParse({ max_tool_calls: limit }).success).toBe(
      valid,
    );
    const validate = new Ajv({ strict: false }).compile(AnthropicMessagesConfigInputJsonSchema);
    expect(validate({ max_tool_calls: limit })).toBe(valid);
  });
  it('keeps Azure tool limits positive while Anthropic zero is supported', () => {
    expect(AzureResponsesConfigInputSchema.safeParse({ max_tool_calls: 0 }).success).toBe(false);
    expect(AnthropicMessagesConfigInputSchema.safeParse({ max_tool_calls: 0 }).success).toBe(true);
  });
});
