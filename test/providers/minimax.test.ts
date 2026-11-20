const { createLoggerModule } = await vi.hoisted(async () => import('../factories/logger'));

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import {
  calculateMiniMaxCost,
  createMiniMaxProvider,
  MINIMAX_CHAT_MODELS,
} from '../../src/providers/minimax';
import { HttpRateLimitError } from '../../src/util/fetch/errors';
import { mockProcessEnv } from '../util/utils';
import { createMockFetchResponse } from './mockProviderResponses';

const createSamplingEnvironment = () => ({
  OPENAI_TOP_P: '0.5',
  OPENAI_PRESENCE_PENALTY: '0.7',
  OPENAI_FREQUENCY_PENALTY: '0.9',
});

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));
vi.mock('../../src/logger', () => createLoggerModule());

describe('calculateMiniMaxCost', () => {
  it('should calculate cost without cache for MiniMax-M3', () => {
    const cost = calculateMiniMaxCost('MiniMax-M3', {}, 500000, 1000000);
    expect(cost).toBeCloseTo(1.35); // (0.3 * 0.5 + 1.2) — standard <=512k tier
  });

  it('should calculate cost with cache hits for MiniMax-M3', () => {
    const cost = calculateMiniMaxCost('MiniMax-M3', {}, 500000, 1000000, 250000);
    expect(cost).toBeCloseTo(1.29); // (0.3 * 0.25 + 0.06 * 0.25 + 1.2)
  });

  it('should calculate long-context cost for MiniMax-M3 above 512k prompt tokens', () => {
    const cost = calculateMiniMaxCost('MiniMax-M3', {}, 1000000, 1000000, 500000);
    expect(cost).toBeCloseTo(2.76); // (0.6 * 0.5 + 0.12 * 0.5 + 2.4)
  });

  it('should switch MiniMax-M3 to long-context pricing only above the 512k threshold', () => {
    // Exactly at the threshold stays on the standard tier (exclusive >).
    expect(calculateMiniMaxCost('MiniMax-M3', {}, 512_000, 1_000_000)).toBeCloseTo(
      (0.3 * 512_000 + 1.2 * 1_000_000) / 1e6,
      10,
    );
    // One token over switches the whole request to the long-context tier.
    expect(calculateMiniMaxCost('MiniMax-M3', {}, 512_001, 1_000_000)).toBeCloseTo(
      (0.6 * 512_001 + 2.4 * 1_000_000) / 1e6,
      10,
    );
  });

  it('should calculate cost without cache for MiniMax-M3.1-Flash', () => {
    const cost = calculateMiniMaxCost('MiniMax-M3.1-Flash', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(0.75, 10); // (0.15 + 0.6)
  });

  it('should calculate cost with cache hits for MiniMax-M3.1-Flash', () => {
    const cost = calculateMiniMaxCost('MiniMax-M3.1-Flash', {}, 1000000, 1000000, 500000);
    expect(cost).toBeCloseTo(0.6825, 10); // (0.15 * 0.5 + 0.015 * 0.5 + 0.6)
  });

  it('should keep MiniMax-M3.1-Flash on flat pricing above 512k prompt tokens', () => {
    const cost = calculateMiniMaxCost('MiniMax-M3.1-Flash', {}, 900_000, 100_000, 300_000);
    expect(cost).toBeCloseTo((0.15 * 600_000 + 0.015 * 300_000 + 0.6 * 100_000) / 1e6, 10);
  });

  it('should not apply the M3 priority multiplier to MiniMax-M3.1-Flash', () => {
    const cost = calculateMiniMaxCost(
      'MiniMax-M3.1-Flash',
      { service_tier: 'priority' },
      1000000,
      1000000,
    );
    expect(cost).toBeCloseTo(0.75, 10);
  });

  it('should return undefined if promptTokens is missing', () => {
    const cost = calculateMiniMaxCost('MiniMax-M3.1-Flash', {}, undefined, 1000000);
    expect(cost).toBeUndefined();
  });

  it('should return undefined if completionTokens is missing', () => {
    const cost = calculateMiniMaxCost('MiniMax-M3.1-Flash', {}, 1000000, undefined);
    expect(cost).toBeUndefined();
  });

  it('should charge input cost when a response has zero completion tokens', () => {
    const cost = calculateMiniMaxCost('MiniMax-M3.1-Flash', {}, 1000000, 0);
    expect(cost).toBeCloseTo(0.15, 10);
  });

  it('should clamp inconsistent cached-token usage to prompt token usage', () => {
    const cost = calculateMiniMaxCost('MiniMax-M3.1-Flash', {}, 1000000, 0, 2000000);
    expect(cost).toBeCloseTo(0.015, 10);
  });

  it('should use custom cost from config', () => {
    const config = { cost: 1.0 / 1e6 };
    const cost = calculateMiniMaxCost('MiniMax-M3.1-Flash', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(2.0); // (1.0 + 1.0) from config override
  });

  it('should use separate input and output cost overrides', () => {
    const cost = calculateMiniMaxCost(
      'MiniMax-M3.1-Flash',
      { inputCost: 1.0 / 1e6, outputCost: 2.0 / 1e6 },
      1000000,
      1000000,
    );
    expect(cost).toBeCloseTo(3.0);
  });

  it('should handle unknown model names', () => {
    const cost = calculateMiniMaxCost('unknown-model', {}, 1000000, 1000000);
    expect(cost).toBeUndefined();
  });

  it('should calculate cost with 100% cache hits for M3.1-Flash', () => {
    const cost = calculateMiniMaxCost('MiniMax-M3.1-Flash', {}, 1000000, 1000000, 1000000);
    expect(cost).toBeCloseTo(0.615, 10); // (0.015 + 0.6) - all input tokens are cached
  });
});

describe('MINIMAX_CHAT_MODELS', () => {
  it('should have correct pricing for MiniMax-M3.1-Flash', () => {
    const model = MINIMAX_CHAT_MODELS.find((m) => m.id === 'MiniMax-M3.1-Flash');
    // Flat rates: no long-context tier.
    expect(model?.cost).toEqual({
      input: 0.15 / 1e6,
      output: 0.6 / 1e6,
      cache_read: 0.015 / 1e6,
    });
  });

  it('should have correct pricing for MiniMax-M3', () => {
    const model = MINIMAX_CHAT_MODELS.find((m) => m.id === 'MiniMax-M3');
    expect(model).toBeDefined();
    expect(model?.cost.input).toBeCloseTo(0.3 / 1e6);
    expect(model?.cost.output).toBeCloseTo(1.2 / 1e6);
    expect(model?.cost.cache_read).toBeCloseTo(0.06 / 1e6);
    expect(model?.cost.longContext).toEqual({
      threshold: 512_000,
      input: 0.6 / 1e6,
      output: 2.4 / 1e6,
      cache_read: 0.12 / 1e6,
    });
  });

  it('should list the available MiniMax chat models newest first', () => {
    expect(MINIMAX_CHAT_MODELS.map((m) => m.id)).toEqual(['MiniMax-M3.1-Flash', 'MiniMax-M3']);
  });

  it('should no longer include the retired M2.x models', () => {
    const ids = MINIMAX_CHAT_MODELS.map((m) => m.id);
    for (const retired of [
      'MiniMax-M2.5',
      'MiniMax-M2.5-highspeed',
      'MiniMax-M2.7',
      'MiniMax-M2.7-highspeed',
    ]) {
      expect(ids).not.toContain(retired);
    }
  });
});

describe('createMiniMaxProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use default model MiniMax-M3 when no model specified', () => {
    const provider = createMiniMaxProvider('minimax');
    expect(provider.id()).toBe('minimax:MiniMax-M3');
  });

  it('should parse model name from provider path', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M3');
    expect(provider.id()).toBe('minimax:MiniMax-M3');
  });

  it('should handle model names with colons', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash');
    expect(provider.id()).toBe('minimax:MiniMax-M3.1-Flash');
  });

  it('should pass options to the provider', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M3', {
      config: {
        config: {
          temperature: 0.8,
          max_tokens: 2000,
        },
      },
    });
    expect(provider.id()).toBe('minimax:MiniMax-M3');
  });
});

describe('MiniMaxProvider', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.mocked(fetchWithCache).mockReset();
    restoreEnv = mockProcessEnv({
      MINIMAX_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
      OPENAI_ORGANIZATION: undefined,
      OPENAI_API_HOST: undefined,
      OPENAI_API_BASE_URL: undefined,
      OPENAI_BASE_URL: undefined,
      OPENAI_TEMPERATURE: undefined,
      OPENAI_MAX_TOKENS: undefined,
      OPENAI_TOP_P: undefined,
      OPENAI_PRESENCE_PENALTY: undefined,
      OPENAI_FREQUENCY_PENALTY: undefined,
    });
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it('should return correct id', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash');
    expect(provider.id()).toBe('minimax:MiniMax-M3.1-Flash');
  });

  it('should return correct string representation', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash');
    expect(provider.toString()).toBe('[MiniMax Provider MiniMax-M3.1-Flash]');
  });

  it('should serialize to JSON correctly', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
      config: {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      },
    });
    const json = (provider as any).toJSON();
    expect(json.provider).toBe('minimax');
    expect(json.model).toBe('MiniMax-M3.1-Flash');
  });

  it('should not expose apiKey in JSON serialization', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
      config: {
        config: {
          apiKey: 'secret-key',
        },
      },
    });
    const json = (provider as any).toJSON();
    expect(json.config.apiKey).toBeUndefined();
  });

  it('should set apiBaseUrl to MiniMax API endpoint', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash');
    const json = (provider as any).toJSON();
    expect(json.config.apiBaseUrl).toBe('https://api.minimax.io/v1');
  });

  it('should set apiKeyEnvar to MINIMAX_API_KEY', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash');
    const json = (provider as any).toJSON();
    expect(json.config.apiKeyEnvar).toBe('MINIMAX_API_KEY');
  });

  it('should reject deprecated function_call configuration', async () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
      config: {
        config: {
          function_call: 'auto',
        },
      },
    });

    await expect((provider as any).getOpenAiBody('Call a tool')).rejects.toThrow(
      'MiniMax does not support function_call. Use tools and tool_choice for tool calling instead.',
    );
  });

  it('should preserve explicit API endpoint and API key environment overrides', () => {
    const restoreCustomEnv = mockProcessEnv({ CUSTOM_MINIMAX_KEY: 'custom-minimax-key' });
    try {
      const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
        config: {
          config: {
            apiBaseUrl: 'https://proxy.example.com/minimax/v1',
            apiKeyEnvar: 'CUSTOM_MINIMAX_KEY',
          },
        },
      }) as any;

      expect(provider.getApiUrl()).toBe('https://proxy.example.com/minimax/v1');
      expect(provider.getApiKey()).toBe('custom-minimax-key');
    } finally {
      restoreCustomEnv();
    }
  });

  it('should not forward OpenAI credentials, organization, or endpoint environment values', () => {
    const restoreOpenAiEnv = mockProcessEnv({
      OPENAI_API_KEY: 'sk-openai-secret',
      OPENAI_ORGANIZATION: 'org-openai-secret',
      OPENAI_API_HOST: 'wrong-service.example.com',
      OPENAI_API_BASE_URL: 'https://wrong-service.example.com/v1',
    });
    try {
      const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash') as any;

      expect(provider.getApiKey()).toBeUndefined();
      expect(provider.getOrganization()).toBeUndefined();
      expect(provider.getApiUrl()).toBe('https://api.minimax.io/v1');
    } finally {
      restoreOpenAiEnv();
    }
  });

  it('should send MiniMax completion limits and omit its invalid inherited temperature default', async () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
      config: { config: { max_tokens: 256 } },
    }) as any;
    const { body } = await provider.getOpenAiBody('Test prompt');

    expect(body.max_completion_tokens).toBe(256);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it('should preserve explicit supported MiniMax request parameters', async () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
      config: { config: { max_completion_tokens: 512, temperature: 0.7 } },
    }) as any;
    const { body } = await provider.getOpenAiBody('Test prompt');

    expect(body.max_completion_tokens).toBe(512);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBe(0.7);
  });

  it('should not leak OpenAI sampling env defaults (OPENAI_TOP_P / OPENAI_PRESENCE_PENALTY / OPENAI_FREQUENCY_PENALTY) into MiniMax requests', async () => {
    const restoreOpenAiSamplingEnv = mockProcessEnv(createSamplingEnvironment());
    try {
      const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash') as any;
      const { body } = await provider.getOpenAiBody('Test prompt');

      expect(body.top_p).toBeUndefined();
      expect(body.presence_penalty).toBeUndefined();
      expect(body.frequency_penalty).toBeUndefined();
    } finally {
      restoreOpenAiSamplingEnv();
    }
  });

  it('should preserve explicit MiniMax sampling parameters even when OPENAI_* sampling envs are set', async () => {
    const restoreOpenAiSamplingEnv = mockProcessEnv(createSamplingEnvironment());
    try {
      const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
        config: { config: { top_p: 0.95, presence_penalty: 0.1, frequency_penalty: 0.2 } },
      }) as any;
      const { body } = await provider.getOpenAiBody('Test prompt');

      expect(body.top_p).toBe(0.95);
      expect(body.presence_penalty).toBe(0.1);
      expect(body.frequency_penalty).toBe(0.2);
    } finally {
      restoreOpenAiSamplingEnv();
    }
  });

  it('should forward reasoning_effort, which the base provider drops for non-OpenAI models', async () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
      config: { config: { reasoning_effort: 'low' } },
    }) as any;
    const { body } = await provider.getOpenAiBody('Test prompt');

    expect(body.reasoning_effort).toBe('low');
  });

  it('should leave reasoning_effort to the MiniMax default when it is not configured', async () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash') as any;
    const { body } = await provider.getOpenAiBody('Test prompt');

    expect(body).not.toHaveProperty('reasoning_effort');
  });

  it('should render reasoning_effort from test vars', async () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
      config: { config: { reasoning_effort: '{{ effort }}' as any } },
    }) as any;
    const { body } = await provider.getOpenAiBody('Test prompt', {
      vars: { effort: 'xhigh' },
      prompt: { raw: 'Test prompt', label: 'fixture' },
    });

    expect(body.reasoning_effort).toBe('xhigh');
  });

  it.each([
    [{ reasoning_effort: 'low' }, { reasoning_effort: 'high' }, 'high'],
    [{ passthrough: { reasoning_effort: 'low' } }, { reasoning_effort: 'high' }, 'high'],
    [{ reasoning_effort: 'low' }, { passthrough: { reasoning_effort: 'medium' } }, 'medium'],
    [{ reasoning_effort: 'low', passthrough: { reasoning_effort: 'max' } }, {}, 'max'],
  ])(
    'should resolve reasoning_effort from provider config %j and prompt config %j',
    async (config, promptConfig, expected) => {
      const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
        config: { config: config as any },
      }) as any;
      const { body } = await provider.getOpenAiBody('Test prompt', {
        vars: {},
        prompt: { raw: 'Test prompt', label: 'fixture', config: promptConfig },
      });

      expect(body.reasoning_effort).toBe(expected);
    },
  );

  it('should call MiniMax-M3.1-Flash with reasoning_effort and price its cached usage', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse({
        model: 'MiniMax-M3.1-Flash',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Paris',
              reasoning_content: 'The user asks for the capital of France.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          total_tokens: 1500,
          prompt_tokens: 1200,
          completion_tokens: 300,
          prompt_tokens_details: { cached_tokens: 800 },
        },
      }),
    );

    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
      config: { config: { apiKey: 'fixture-key', reasoning_effort: 'medium' } },
    });
    const result = await provider.callApi('What is the capital of France?');

    const [url, init] = vi.mocked(fetchWithCache).mock.calls[0] ?? [];
    expect(url).toBe('https://api.minimax.io/v1/chat/completions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ model: 'MiniMax-M3.1-Flash', reasoning_effort: 'medium' });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Thinking: The user asks for the capital of France.\n\nParis');
    // MiniMax's documented example: (400 * 0.15 + 800 * 0.015 + 300 * 0.60) / 1M = $0.000252
    expect(result.cost).toBeCloseTo(0.000252, 12);
    expect(result.tokenUsage).toMatchObject({ prompt: 1200, completion: 300, total: 1500 });
  });

  it('should call a configured MiniMax-compatible endpoint and charge prompt-cache reads', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(
      createMockFetchResponse({
        choices: [{ message: { content: 'MiniMax output' }, finish_reason: 'stop' }],
        usage: {
          total_tokens: 15,
          prompt_tokens: 10,
          completion_tokens: 5,
          prompt_tokens_details: { cached_tokens: 4 },
        },
      }),
    );

    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
      config: {
        config: {
          apiKey: 'minimax-key',
          apiBaseUrl: 'https://proxy.example.com/minimax/v1',
          max_tokens: 256,
          temperature: 0.7,
        },
      },
    });
    const result = await provider.callApi('Test prompt');

    const [url, init] = vi.mocked(fetchWithCache).mock.calls[0] ?? [];
    expect(url).toBe('https://proxy.example.com/minimax/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer minimax-key',
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ max_completion_tokens: 256, temperature: 0.7 });
    expect(body.max_tokens).toBeUndefined();
    expect(result.output).toBe('MiniMax output');
    expect(result.cost).toBe(calculateMiniMaxCost('MiniMax-M3.1-Flash', {}, 10, 5, 4));
  });

  it('should return API errors from the MiniMax endpoint', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: { error: { message: 'invalid model' } },
      cached: false,
      status: 400,
      statusText: 'Bad Request',
    } as never);

    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
      config: { config: { apiKey: 'minimax-key' } },
    });
    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('API error: 400 Bad Request');
    expect(result.error).toContain('invalid model');
  });

  it('should preserve structured rate-limit errors', async () => {
    vi.mocked(fetchWithCache).mockRejectedValueOnce(
      new HttpRateLimitError({
        status: 429,
        code: 'rate_limit_exceeded',
        retryAfterMs: 1000,
      }),
    );

    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
      config: { config: { apiKey: 'minimax-key' } },
    });
    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('Rate limit exceeded');
    expect(result.metadata?.rateLimitKind).toBe('rate_limit');
  });

  it.each([0, 25, 100])(
    'calculates native cached token usage %s before normalization',
    async (cachedTokens) => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse({
          choices: [{ message: { content: 'MiniMax response' }, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            prompt_tokens_details: { cached_tokens: cachedTokens },
          },
        }),
      );
      const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
        config: { config: { apiKey: 'fixture-key' } },
      });
      const result = await provider.callApi('Test prompt');
      expect(result.cost).toBe(
        calculateMiniMaxCost('MiniMax-M3.1-Flash', {}, 100, 50, cachedTokens),
      );
      expect(result.tokenUsage?.prompt).toBe(100);
    },
  );

  it('reports zero incremental cost for promptfoo cache hits', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [{ message: { content: 'Cached MiniMax response' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      },
      cached: true,
      status: 200,
      statusText: 'OK',
    });
    const provider = createMiniMaxProvider('minimax:MiniMax-M3.1-Flash', {
      config: { config: { apiKey: 'fixture-key' } },
    });
    const result = await provider.callApi('Test prompt');
    expect(result).toMatchObject({ cached: true, cost: 0 });
  });
});
