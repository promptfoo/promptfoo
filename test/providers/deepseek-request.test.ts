import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { createDeepSeekProvider } from '../../src/providers/deepseek';
import { mockProcessEnv } from '../util/utils';

import type { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { OpenAiCompletionOptions } from '../../src/providers/openai/types';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

let restoreEnv: () => void;
beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset();
  restoreEnv = mockProcessEnv({ DEEPSEEK_API_KEY: 'test-key', OPENAI_MAX_TOKENS: undefined });
});
afterEach(() => restoreEnv());

function provider(config: OpenAiCompletionOptions = {}) {
  return createDeepSeekProvider('deepseek:deepseek-flash', {
    config: { config },
  }) as OpenAiChatCompletionProvider;
}

describe('DeepSeek current models', () => {
  it('uses a configured endpoint and keeps the direct API as the default', () => {
    expect(provider({ apiBaseUrl: 'http://localhost:1234/v1' }).getApiUrl()).toBe(
      'http://localhost:1234/v1',
    );
    expect(provider().getApiUrl()).toBe('https://api.deepseek.com/v1');
  });

  it('prefers nested endpoint config over wrapper config', () => {
    const configured = createDeepSeekProvider('deepseek:deepseek-flash', {
      config: {
        apiBaseUrl: 'https://proxy.example.com/v1',
        config: { apiBaseUrl: 'http://localhost:1234/v1' },
      },
    }) as OpenAiChatCompletionProvider;
    expect(configured.getApiUrl()).toBe('http://localhost:1234/v1');
    const wrapper = createDeepSeekProvider('deepseek:deepseek-flash', {
      config: { apiBaseUrl: 'https://proxy.example.com/v1' },
    }) as OpenAiChatCompletionProvider;
    expect(wrapper.getApiUrl()).toBe('https://proxy.example.com/v1');
  });

  it('forwards reasoning effort and lets DeepSeek choose the output budget', async () => {
    const { body } = await provider({ reasoning_effort: 'max' }).getOpenAiBody('Hello');
    expect(body.reasoning_effort).toBe('max');
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it('preserves explicit prompt-level effort and output limits', async () => {
    const { body } = await provider({ reasoning_effort: 'high', max_tokens: 8192 }).getOpenAiBody(
      'Hello',
      {
        vars: { effort: 'none' },
        prompt: {
          raw: 'Hello',
          label: 'fixture',
          config: { reasoning_effort: '{{ effort }}', max_tokens: 32 },
        },
      },
    );
    expect(body).toMatchObject({ reasoning_effort: 'none', max_tokens: 32 });
  });

  it('preserves an explicit environment output cap and lets config override it', async () => {
    const restoreTokenCap = mockProcessEnv({ OPENAI_MAX_TOKENS: '512' });
    try {
      expect((await provider().getOpenAiBody('Hello')).body.max_tokens).toBe(512);
      expect((await provider({ max_tokens: 2048 }).getOpenAiBody('Hello')).body.max_tokens).toBe(
        2048,
      );
    } finally {
      restoreTokenCap();
    }
  });

  it('preserves passthrough reasoning and token limits', async () => {
    const { body } = await provider({
      passthrough: { reasoning_effort: 'low', max_tokens: 2048 },
    }).getOpenAiBody('Hello');
    expect(body).toMatchObject({ reasoning_effort: 'low', max_tokens: 2048 });
  });

  it.each([
    { prompt_cache_hit_tokens: 500_000 },
    { prompt_tokens_details: { cached_tokens: 500_000 } },
  ])('prices current Flash cache reads from the API usage fields', async (cacheUsage) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000, ...cacheUsage },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const result = await provider().callApi('Hello');
    expect(result.output).toBe('Hello');
    expect(result.cost).toBeCloseTo(1.353);
  });

  it('uses prompt-level cost overrides', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 1_000_000,
          completion_tokens: 1_000_000,
          prompt_cache_hit_tokens: 500_000,
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const result = await provider().callApi('Hello', {
      vars: {},
      prompt: {
        raw: 'Hello',
        label: 'off-peak',
        config: { inputCost: 0.15 / 1e6, outputCost: 0.6 / 1e6, cacheReadCost: 0.003 / 1e6 },
      },
    });
    expect(result.cost).toBeCloseTo(0.6765);
  });

  it('returns API errors without a cost estimate', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { error: { message: 'Invalid reasoning effort', type: 'invalid_request_error' } },
      cached: false,
      status: 400,
      statusText: 'Bad Request',
    });
    const result = await provider().callApi('Hello');
    expect(result.error).toContain('Invalid reasoning effort');
    expect(result.cost).toBeUndefined();
  });
});
