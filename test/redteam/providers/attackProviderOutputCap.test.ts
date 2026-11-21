import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { AzureChatCompletionProvider } from '../../../src/providers/azure/chat';
import { AzureCompletionProvider } from '../../../src/providers/azure/completion';
import { AzureResponsesProvider } from '../../../src/providers/azure/responses';
import { createLiteLLMProvider } from '../../../src/providers/litellm';
import { MetaResponsesProvider } from '../../../src/providers/meta';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';
import { createXAIProvider } from '../../../src/providers/xai/chat';
import { XAIResponsesProvider } from '../../../src/providers/xai/responses';
import { redteamProviderManager as manager } from '../../../src/redteam/providers/shared';
import { createMockFetchResponse } from '../../providers/mockProviderResponses';

vi.mock(import('../../../src/cache'), async (original) => ({
  ...(await original()),
  fetchWithCache: vi.fn(),
}));

const options = { config: { apiKey: 'test-key', apiBaseUrl: 'https://provider.example' } };
const requests = () =>
  vi.mocked(fetchWithCache).mock.calls.map(([, init]) => JSON.parse(String(init?.body)));

describe('red-team output limits', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_MAX_TOKENS', '32768');
    vi.stubEnv('OPENAI_MAX_COMPLETION_TOKENS', '32768');
    vi.stubEnv('PROMPTFOO_REDTEAM_PROVIDER_MAX_TOKENS', undefined);
    vi.mocked(fetchWithCache)
      .mockReset()
      .mockResolvedValue(
        createMockFetchResponse({
          choices: [{ text: 'ok', message: { content: 'ok' } }],
          status: 'completed',
          output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
        }),
      );
  });

  afterEach(() => {
    manager.clearProvider();
    vi.unstubAllEnvs();
  });

  it.each([
    ['OpenAI chat', () => new OpenAiChatCompletionProvider('gpt-4.1', options), 'max_tokens'],
    [
      'OpenAI reasoning',
      () => new OpenAiChatCompletionProvider('gpt-6', options),
      'max_completion_tokens',
    ],
    [
      'OpenAI Responses',
      () => new OpenAiResponsesProvider('gpt-5.5', options),
      'max_output_tokens',
    ],
    [
      'Azure chat',
      () => new AzureChatCompletionProvider('gpt-5', options),
      'max_completion_tokens',
    ],
    ['Azure completion', () => new AzureCompletionProvider('text', options), 'max_tokens'],
    ['Azure Responses', () => new AzureResponsesProvider('gpt-5', options), 'max_output_tokens'],
    [
      'LiteLLM chat',
      () => createLiteLLMProvider('litellm:gpt-4.1', { config: options }),
      'max_tokens',
    ],
    [
      'LiteLLM completion',
      () => createLiteLLMProvider('litellm:completion:text', { config: options }),
      'max_tokens',
    ],
    [
      'xAI chat',
      () => createXAIProvider('xai:grok-4.7', { config: options }),
      'max_completion_tokens',
    ],
    ['xAI Responses', () => new XAIResponsesProvider('grok-4.7', options), 'max_output_tokens'],
    ['Meta Responses', () => new MetaResponsesProvider('muse-spark', options), 'max_output_tokens'],
  ] as const)('sends the supported %s field', async (_, create, field) => {
    const provider = await manager.getProvider({ provider: create(), purpose: 'attack' });
    await provider.callApi('hello');
    const [body] = requests();
    expect(body[field]).toBe(4096);
    expect(Object.keys(body).filter((key) => /^max_.*tokens$/.test(key))).toEqual([field]);
  });

  it('isolates cached grading from concurrent generation and preserves the original receiver', async () => {
    class Custom extends OpenAiChatCompletionProvider {
      #prefix = 'example';
      override callApi(
        ...[prompt, context, options]: Parameters<OpenAiChatCompletionProvider['callApi']>
      ) {
        return super.callApi(this.#prefix + prompt, context, options);
      }
    }
    const original = new Custom('gpt-4.1', options);
    await manager.setProvider(original);
    const generation = await manager.getProvider({});
    const grader = await manager.getGradingProvider({ jsonOnly: true });
    expect(generation).toBe(original);
    await Promise.all([grader.callApi('grade'), generation.callApi('batch')]);
    expect(requests()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          messages: [{ role: 'user', content: 'examplegrade' }],
          max_tokens: 4096,
        }),
        expect.objectContaining({
          messages: [{ role: 'user', content: 'examplebatch' }],
          max_tokens: 32768,
        }),
      ]),
    );
    expect(original.config.max_tokens).toBeUndefined();
  });

  it('preserves explicit token limits and leaves native providers alone', async () => {
    const provider = new OpenAiChatCompletionProvider('gpt-5', {
      config: { ...options.config, max_tokens: 8000 },
    });
    await manager.setGradingProvider(provider);
    const grader = await manager.getGradingProvider();
    await grader.callApi('grade');
    await grader.callApi('grade', {
      vars: {},
      prompt: { label: '', raw: '', config: { max_completion_tokens: 10 } },
    });
    expect(requests().map((body) => body.max_completion_tokens)).toEqual([8000, 10]);
    const native = { id: () => 'native', callApi: vi.fn() };
    expect(await manager.getGradingProvider({ provider: native })).toBe(native);
  });

  it.each([
    ['9000', 9000],
    ['-1', 1],
    ['invalid', 4096],
  ] as const)('reads %s from the current env file', async (value, expected) => {
    await cliState.withEnvFileOverrides(
      { PROMPTFOO_REDTEAM_PROVIDER_MAX_TOKENS: value },
      async () => {
        const provider = new OpenAiChatCompletionProvider('gpt-4.1', options);
        await (await manager.getGradingProvider({ provider })).callApi('grade');
        expect(requests()[0].max_tokens).toBe(expected);
      },
    );
  });
});
