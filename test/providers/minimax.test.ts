import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import {
  calculateMiniMaxCost,
  createMiniMaxProvider,
  MINIMAX_CHAT_MODELS,
} from '../../src/providers/minimax';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { HttpRateLimitError } from '../../src/util/fetch/errors';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('calculateMiniMaxCost', () => {
  it('should calculate cost without cache for MiniMax-M3', () => {
    const cost = calculateMiniMaxCost('MiniMax-M3', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(3.0); // (0.6 + 2.4)
  });

  it('should calculate cost with cache hits for MiniMax-M3', () => {
    const cost = calculateMiniMaxCost('MiniMax-M3', {}, 1000000, 1000000, 500000);
    expect(cost).toBeCloseTo(2.76); // (0.6 * 0.5 + 0.12 * 0.5 + 2.4)
  });

  it('should calculate cost without cache for MiniMax-M2.7', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(1.5); // (0.3 + 1.2)
  });

  it('should calculate cost with cache hits for MiniMax-M2.7', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7', {}, 1000000, 1000000, 500000);
    expect(cost).toBeCloseTo(1.38); // (0.3 * 0.5 + 0.06 * 0.5 + 1.2)
  });

  it('should calculate cost for MiniMax-M2.7-highspeed', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7-highspeed', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(3.0); // (0.6 + 2.4)
  });

  it('should calculate cost with cache hits for MiniMax-M2.7-highspeed', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7-highspeed', {}, 1000000, 1000000, 500000);
    expect(cost).toBeCloseTo(2.73); // (0.6 * 0.5 + 0.06 * 0.5 + 2.4)
  });

  it('should return undefined if promptTokens is missing', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7', {}, undefined, 1000000);
    expect(cost).toBeUndefined();
  });

  it('should return undefined if completionTokens is missing', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7', {}, 1000000, undefined);
    expect(cost).toBeUndefined();
  });

  it('should charge input cost when a response has zero completion tokens', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7', {}, 1000000, 0);
    expect(cost).toBeCloseTo(0.3);
  });

  it('should clamp inconsistent cached-token usage to prompt token usage', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7', {}, 1000000, 0, 2000000);
    expect(cost).toBeCloseTo(0.06);
  });

  it('should use custom cost from config', () => {
    const config = { cost: 1.0 / 1e6 };
    const cost = calculateMiniMaxCost('MiniMax-M2.7', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(2.0); // (1.0 + 1.0) from config override
  });

  it('should use separate input and output cost overrides', () => {
    const cost = calculateMiniMaxCost(
      'MiniMax-M2.7',
      { inputCost: 1.0 / 1e6, outputCost: 2.0 / 1e6 },
      1000000,
      1000000,
    );
    expect(cost).toBeCloseTo(3.0);
  });

  it('should use object-shaped input and output cost overrides', () => {
    const cost = calculateMiniMaxCost(
      'MiniMax-M2.7',
      { cost: { input: 1.0 / 1e6, output: 2.0 / 1e6 } },
      1000000,
      1000000,
    );
    expect(cost).toBeCloseTo(3.0);
  });

  it('should handle unknown model names', () => {
    const cost = calculateMiniMaxCost('unknown-model', {}, 1000000, 1000000);
    expect(cost).toBeUndefined();
  });

  it('should calculate cost with 100% cache hits for M2.7', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7', {}, 1000000, 1000000, 1000000);
    expect(cost).toBeCloseTo(1.26); // (0.06 + 1.2) - all input tokens are cached
  });
});

describe('MINIMAX_CHAT_MODELS', () => {
  it('should have correct pricing for MiniMax-M3', () => {
    const model = MINIMAX_CHAT_MODELS.find((m) => m.id === 'MiniMax-M3');
    expect(model).toBeDefined();
    expect(model?.cost.input).toBeCloseTo(0.6 / 1e6);
    expect(model?.cost.output).toBeCloseTo(2.4 / 1e6);
    expect(model?.cost.cache_read).toBeCloseTo(0.12 / 1e6);
  });

  it('should have correct pricing for MiniMax-M2.7', () => {
    const model = MINIMAX_CHAT_MODELS.find((m) => m.id === 'MiniMax-M2.7');
    expect(model).toBeDefined();
    expect(model?.cost.input).toBeCloseTo(0.3 / 1e6);
    expect(model?.cost.output).toBeCloseTo(1.2 / 1e6);
    expect(model?.cost.cache_read).toBeCloseTo(0.06 / 1e6);
  });

  it('should have correct pricing for MiniMax-M2.7-highspeed', () => {
    const model = MINIMAX_CHAT_MODELS.find((m) => m.id === 'MiniMax-M2.7-highspeed');
    expect(model).toBeDefined();
    expect(model?.cost.input).toBeCloseTo(0.6 / 1e6);
    expect(model?.cost.output).toBeCloseTo(2.4 / 1e6);
    expect(model?.cost.cache_read).toBeCloseTo(0.06 / 1e6);
  });

  it('should contain exactly three models', () => {
    expect(MINIMAX_CHAT_MODELS).toHaveLength(3);
  });

  it('should have M3 as first model in the list', () => {
    expect(MINIMAX_CHAT_MODELS[0].id).toBe('MiniMax-M3');
  });

  it('should have M2.7 as second model in the list', () => {
    expect(MINIMAX_CHAT_MODELS[1].id).toBe('MiniMax-M2.7');
  });

  it('should have M2.7-highspeed as third model in the list', () => {
    expect(MINIMAX_CHAT_MODELS[2].id).toBe('MiniMax-M2.7-highspeed');
  });

  it('should no longer include the older M2.5 models', () => {
    const ids = MINIMAX_CHAT_MODELS.map((m) => m.id);
    expect(ids).not.toContain('MiniMax-M2.5');
    expect(ids).not.toContain('MiniMax-M2.5-highspeed');
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
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7-highspeed');
    expect(provider.id()).toBe('minimax:MiniMax-M2.7-highspeed');
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
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7');
    expect(provider.id()).toBe('minimax:MiniMax-M2.7');
  });

  it('should return correct string representation', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7');
    expect(provider.toString()).toBe('[MiniMax Provider MiniMax-M2.7]');
  });

  it('should serialize to JSON correctly', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7', {
      config: {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      },
    });
    const json = (provider as any).toJSON();
    expect(json.provider).toBe('minimax');
    expect(json.model).toBe('MiniMax-M2.7');
  });

  it('should not expose apiKey in JSON serialization', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7', {
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
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7');
    const json = (provider as any).toJSON();
    expect(json.config.apiBaseUrl).toBe('https://api.minimax.io/v1');
  });

  it('should set apiKeyEnvar to MINIMAX_API_KEY', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7');
    const json = (provider as any).toJSON();
    expect(json.config.apiKeyEnvar).toBe('MINIMAX_API_KEY');
  });

  it('should reject deprecated function_call configuration', async () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7', {
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
      const provider = createMiniMaxProvider('minimax:MiniMax-M2.7', {
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
      const provider = createMiniMaxProvider('minimax:MiniMax-M2.7') as any;

      expect(provider.getApiKey()).toBeUndefined();
      expect(provider.getOrganization()).toBeUndefined();
      expect(provider.getApiUrl()).toBe('https://api.minimax.io/v1');
    } finally {
      restoreOpenAiEnv();
    }
  });

  it('should send MiniMax completion limits and omit its invalid inherited temperature default', async () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7', {
      config: { config: { max_tokens: 256 } },
    }) as any;
    const { body } = await provider.getOpenAiBody('Test prompt');

    expect(body.max_completion_tokens).toBe(256);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
  });

  it('should preserve explicit supported MiniMax request parameters', async () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7', {
      config: { config: { max_completion_tokens: 512, temperature: 0.7 } },
    }) as any;
    const { body } = await provider.getOpenAiBody('Test prompt');

    expect(body.max_completion_tokens).toBe(512);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBe(0.7);
  });

  it('should not leak OpenAI sampling env defaults (OPENAI_TOP_P / OPENAI_PRESENCE_PENALTY / OPENAI_FREQUENCY_PENALTY) into MiniMax requests', async () => {
    const restoreOpenAiSamplingEnv = mockProcessEnv({
      OPENAI_TOP_P: '0.5',
      OPENAI_PRESENCE_PENALTY: '0.7',
      OPENAI_FREQUENCY_PENALTY: '0.9',
    });
    try {
      const provider = createMiniMaxProvider('minimax:MiniMax-M2.7') as any;
      const { body } = await provider.getOpenAiBody('Test prompt');

      expect(body.top_p).toBeUndefined();
      expect(body.presence_penalty).toBeUndefined();
      expect(body.frequency_penalty).toBeUndefined();
    } finally {
      restoreOpenAiSamplingEnv();
    }
  });

  it('should preserve explicit MiniMax sampling parameters even when OPENAI_* sampling envs are set', async () => {
    const restoreOpenAiSamplingEnv = mockProcessEnv({
      OPENAI_TOP_P: '0.5',
      OPENAI_PRESENCE_PENALTY: '0.7',
      OPENAI_FREQUENCY_PENALTY: '0.9',
    });
    try {
      const provider = createMiniMaxProvider('minimax:MiniMax-M2.7', {
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

  it('should call a configured MiniMax-compatible endpoint and charge prompt-cache reads', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [{ message: { content: 'MiniMax output' }, finish_reason: 'stop' }],
        usage: {
          total_tokens: 15,
          prompt_tokens: 10,
          completion_tokens: 5,
          prompt_tokens_details: { cached_tokens: 4 },
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7', {
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
    expect(result.cost).toBe(calculateMiniMaxCost('MiniMax-M2.7', {}, 10, 5, 4));
  });

  it('should return API errors from the MiniMax endpoint', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: { error: { message: 'invalid model' } },
      cached: false,
      status: 400,
      statusText: 'Bad Request',
    } as never);

    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7', {
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

    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7', {
      config: { config: { apiKey: 'minimax-key' } },
    });
    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('Rate limit exceeded');
    expect(result.metadata?.rateLimitKind).toBe('rate_limit');
  });

  it('should calculate cost from cached token metadata in string raw responses', async () => {
    vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValueOnce({
      output: 'MiniMax response',
      tokenUsage: {
        total: 150,
        prompt: 100,
        completion: 50,
      },
      raw: JSON.stringify({
        usage: {
          prompt_tokens_details: {
            cached_tokens: 40,
          },
        },
      }),
    });

    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7');
    const result = await provider.callApi('Test prompt');

    expect(result.cost).toBe(calculateMiniMaxCost('MiniMax-M2.7', {}, 100, 50, 40));
  });

  it('should calculate cost from cached token metadata in object raw responses', async () => {
    vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValueOnce({
      output: 'MiniMax response',
      tokenUsage: {
        total: 150,
        prompt: 100,
        completion: 50,
      },
      raw: {
        usage: {
          prompt_tokens_details: {
            cached_tokens: 25,
          },
        },
      },
    });

    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7-highspeed');
    const result = await provider.callApi('Test prompt');

    expect(result.cost).toBe(calculateMiniMaxCost('MiniMax-M2.7-highspeed', {}, 100, 50, 25));
  });

  it('should still calculate cost when cache metadata is malformed', async () => {
    vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValueOnce({
      output: 'MiniMax response',
      tokenUsage: {
        total: 150,
        prompt: 100,
        completion: 50,
      },
      raw: '{"usage":',
    });

    const provider = createMiniMaxProvider('minimax:MiniMax-M3');
    const result = await provider.callApi('Test prompt');

    expect(result.cost).toBe(calculateMiniMaxCost('MiniMax-M3', {}, 100, 50, 0));
  });

  it('should preserve cached responses without recalculating cost', async () => {
    vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi').mockResolvedValueOnce({
      output: 'Cached MiniMax response',
      tokenUsage: {
        total: 150,
        prompt: 100,
        completion: 50,
      },
      raw: {
        usage: {
          prompt_tokens_details: {
            cached_tokens: 100,
          },
        },
      },
      cached: true,
    });

    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7-highspeed');
    const result = await provider.callApi('Test prompt');

    expect(result.cached).toBe(true);
    expect(result.cost).toBeUndefined();
  });

  it('should pass through empty and error parent responses', async () => {
    const callApi = vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi');
    callApi.mockResolvedValueOnce(undefined as any);
    callApi.mockResolvedValueOnce({ error: 'API error' });

    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7');

    await expect(provider.callApi('Empty response')).resolves.toBeUndefined();
    await expect(provider.callApi('Error response')).resolves.toEqual({ error: 'API error' });
  });
});
