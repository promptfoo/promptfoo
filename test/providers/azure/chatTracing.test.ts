import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { AzureChatCompletionProvider } from '../../../src/providers/azure/chat';
import { createUnsetOpenAiGenerationEnv } from '../../factories/literalFixtures';
import { mockProcessEnv } from '../../util/utils';
import { createMockFetchResponse } from '../mockProviderResponses';
import { installTracerSpy } from '../openai/tracing';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

describe('Azure Chat resolved request tracing', () => {
  let restoreEnv: () => void;
  beforeEach(() => {
    restoreEnv = mockProcessEnv(createUnsetOpenAiGenerationEnv());
    vi.mocked(fetchWithCache).mockReset();
    vi.mocked(fetchWithCache).mockResolvedValue(
      createMockFetchResponse({
        choices: [{ message: { role: 'assistant', content: 'ready' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
  });
  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it.each([
    [{ max_tokens: 37 }, 37],
    [{ max_completion_tokens: 38 }, 38],
    [{ passthrough: { max_completion_tokens: 39 } }, 39],
    [{ max_completion_tokens: 0 }, 0],
    [{ max_completion_tokens: null }, undefined],
  ])('traces the prompt limit actually sent for %j', async (promptConfig, expected) => {
    const spans = installTracerSpy();
    const provider = new AzureChatCompletionProvider('internal-model', {
      config: { apiHost: 'fixture.azure.test', apiKey: 'fixture-key', max_tokens: 9 },
    });
    const prepared = vi.spyOn(provider, 'getOpenAiBody');
    const result = await provider.callApi('Hello', {
      vars: {},
      prompt: { raw: 'Hello', label: 'Hello', config: promptConfig },
    });
    expect(result.output).toBe('ready');
    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    expect(body.max_completion_tokens).toBe(expected);
    expect(
      spans.find((span) => span.name === 'chat internal-model')?.attributes[
        'gen_ai.request.max_tokens'
      ],
    ).toBe(expected);
    expect(prepared).toHaveBeenCalledTimes(1);
  });

  it('traces an environment limit and evaluates reasoning only once', async () => {
    const reset = mockProcessEnv({ OPENAI_MAX_COMPLETION_TOKENS: '41' });
    try {
      const spans = installTracerSpy();
      const effort = vi.fn(() => 'low');
      const provider = new AzureChatCompletionProvider('internal-model', {
        config: {
          apiHost: 'fixture.azure.test',
          apiKey: 'fixture-key',
          passthrough: { reasoning_effort: effort },
        },
      });
      await provider.callApi('Hello', { vars: {}, prompt: { raw: 'Hello', label: 'Hello' } });
      expect(
        spans.find((span) => span.name === 'chat internal-model')?.attributes[
          'gen_ai.request.max_tokens'
        ],
      ).toBe(41);
      expect(effort).toHaveBeenCalledTimes(1);
    } finally {
      reset();
    }
  });

  it('records request preparation errors on a span', async () => {
    const spans = installTracerSpy();
    const provider = new AzureChatCompletionProvider('internal-model', {
      config: { apiHost: 'fixture.azure.test', apiKey: 'fixture-key' },
    });
    vi.spyOn(provider, 'getOpenAiBody').mockRejectedValue(new Error('invalid config'));
    await expect(provider.callApi('Hello')).rejects.toThrow('invalid config');
    expect(spans.find((span) => span.name === 'chat internal-model')).toMatchObject({
      ended: true,
      status: { code: 2 },
    });
    expect(fetchWithCache).not.toHaveBeenCalled();
  });
});
