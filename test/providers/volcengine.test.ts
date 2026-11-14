import { afterEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import {
  calculateVolcengineCost,
  createVolcengineProvider,
  VOLCENGINE_CHAT_MODELS,
  VolcengineProvider,
} from '../../src/providers/volcengine';
import { HttpRateLimitError } from '../../src/util/fetch/errors';

describe('calculateVolcengineCost', () => {
  it('should calculate cost without cache', () => {
    const cost = calculateVolcengineCost('doubao-seed-2-1-pro-260628', {}, 1000000, 1000000);
    // input 6.00 CNY, output 30.00 CNY -> (6.00 + 30.00) / 6.737012 ≈ 5.3436
    expect(cost).toBeCloseTo(36.0 / 6.737012);
  });

  it('should calculate cost with cache hits', () => {
    const cost = calculateVolcengineCost(
      'doubao-seed-2-1-pro-260628',
      {},
      1000000,
      1000000,
      500000,
    );
    // (6.00 * 0.5 + 1.20 * 0.5 + 30.00) / 6.737012 = 33.6 / 6.737012
    expect(cost).toBeCloseTo(33.6 / 6.737012);
  });

  it('should calculate cost for doubao-seed-evolving', () => {
    const cost = calculateVolcengineCost('doubao-seed-evolving', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(36.0 / 6.737012);
  });

  it('should calculate cost for doubao-seed-2-1-turbo-260628', () => {
    const cost = calculateVolcengineCost('doubao-seed-2-1-turbo-260628', {}, 1000000, 1000000);
    // input 3.00 CNY, output 15.00 CNY -> 18.0 / 6.737012
    expect(cost).toBeCloseTo(18.0 / 6.737012);
  });

  it('should calculate cost for doubao-seed-2-0-lite-260428', () => {
    const cost = calculateVolcengineCost('doubao-seed-2-0-lite-260428', {}, 1000000, 1000000);
    // input 0.60 CNY, output 3.60 CNY -> 4.2 / 6.737012
    expect(cost).toBeCloseTo(4.2 / 6.737012);
  });

  it('should calculate cost for doubao-seed-2-0-mini-260428', () => {
    const cost = calculateVolcengineCost('doubao-seed-2-0-mini-260428', {}, 1000000, 1000000);
    // input 0.20 CNY, output 2.00 CNY -> 2.2 / 6.737012
    expect(cost).toBeCloseTo(2.2 / 6.737012);
  });

  it('should return undefined if promptTokens is missing', () => {
    const cost = calculateVolcengineCost('doubao-seed-2-1-pro-260628', {}, undefined, 1000000);
    expect(cost).toBeUndefined();
  });

  it('should return undefined if completionTokens is missing', () => {
    const cost = calculateVolcengineCost('doubao-seed-2-1-pro-260628', {}, 1000000, undefined);
    expect(cost).toBeUndefined();
  });

  it('should use custom cost from config', () => {
    const config = { cost: 1.0 / 1e6 };
    const cost = calculateVolcengineCost('doubao-seed-2-1-pro-260628', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(2.0); // (1.0 + 1.0) from config override
  });

  it('should use separate custom input and output costs from config', () => {
    const config = { inputCost: 1.0 / 1e6, outputCost: 3.0 / 1e6 };
    const cost = calculateVolcengineCost('doubao-seed-2-1-pro-260628', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(4.0);
  });

  it('should use separate custom input and output costs with cache hits', () => {
    const config = { inputCost: 1.0 / 1e6, outputCost: 3.0 / 1e6 };
    const cost = calculateVolcengineCost(
      'doubao-seed-2-1-pro-260628',
      config,
      1000000,
      1000000,
      500000,
    );
    // inputCost applies to fresh and cached prompt tokens alike: 1.0 * 0.5 + 1.0 * 0.5 + 3.0
    const expected = 0.5 + 0.5 + 3.0;
    expect(cost).toBeCloseTo(expected);
  });

  it('should prefer separate custom costs over custom cost', () => {
    const config = { cost: 5.0 / 1e6, inputCost: 1.0 / 1e6, outputCost: 3.0 / 1e6 };
    const cost = calculateVolcengineCost('doubao-seed-2-1-pro-260628', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(4.0);
  });

  it('should return undefined when an unknown model has no pricing', () => {
    const cost = calculateVolcengineCost('unknown-model', {}, 1000000, 1000000);
    expect(cost).toBeUndefined();
  });

  it('should calculate cost with 100% cache hits', () => {
    const cost = calculateVolcengineCost(
      'doubao-seed-2-1-pro-260628',
      {},
      1000000,
      1000000,
      1000000,
    );
    // cache_read (1.20) + output (30.00) = 31.2 / 6.737012
    expect(cost).toBeCloseTo(31.2 / 6.737012);
  });

  it('should clamp cached tokens that exceed prompt tokens', () => {
    const cost = calculateVolcengineCost(
      'doubao-seed-2-1-pro-260628',
      {},
      1000000,
      1000000,
      1500000,
    );
    expect(cost).toBeCloseTo(31.2 / 6.737012);
  });

  it('should clamp negative cached tokens to zero', () => {
    const cost = calculateVolcengineCost(
      'doubao-seed-2-1-pro-260628',
      {},
      1000000,
      1000000,
      -500000,
    );
    expect(cost).toBeCloseTo(36.0 / 6.737012);
  });

  it('should treat non-finite cached tokens as no cache hits', () => {
    const cost = calculateVolcengineCost(
      'doubao-seed-2-1-pro-260628',
      {},
      1000000,
      1000000,
      Number.NaN,
    );
    expect(cost).toBeCloseTo(36.0 / 6.737012);
  });
});

describe('VOLCENGINE_CHAT_MODELS', () => {
  it('should have correct pricing for doubao-seed-evolving', () => {
    const model = VOLCENGINE_CHAT_MODELS.find((m) => m.id === 'doubao-seed-evolving');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(6.0 / 6.737012 / 1e6);
    expect(model!.cost.output).toBeCloseTo(30.0 / 6.737012 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(1.2 / 6.737012 / 1e6);
  });

  it('should have correct pricing for doubao-seed-2-1-pro-260628', () => {
    const model = VOLCENGINE_CHAT_MODELS.find((m) => m.id === 'doubao-seed-2-1-pro-260628');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(6.0 / 6.737012 / 1e6);
    expect(model!.cost.output).toBeCloseTo(30.0 / 6.737012 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(1.2 / 6.737012 / 1e6);
  });

  it('should have correct pricing for doubao-seed-2-1-turbo-260628', () => {
    const model = VOLCENGINE_CHAT_MODELS.find((m) => m.id === 'doubao-seed-2-1-turbo-260628');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(3.0 / 6.737012 / 1e6);
    expect(model!.cost.output).toBeCloseTo(15.0 / 6.737012 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(0.6 / 6.737012 / 1e6);
  });

  it('should have correct pricing for doubao-seed-2-0-pro-260215', () => {
    const model = VOLCENGINE_CHAT_MODELS.find((m) => m.id === 'doubao-seed-2-0-pro-260215');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(3.2 / 6.737012 / 1e6);
    expect(model!.cost.output).toBeCloseTo(16.0 / 6.737012 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(0.64 / 6.737012 / 1e6);
  });

  it('should have correct pricing for doubao-seed-2-0-lite-260428', () => {
    const model = VOLCENGINE_CHAT_MODELS.find((m) => m.id === 'doubao-seed-2-0-lite-260428');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(0.6 / 6.737012 / 1e6);
    expect(model!.cost.output).toBeCloseTo(3.6 / 6.737012 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(0.12 / 6.737012 / 1e6);
  });

  it('should have correct pricing for doubao-seed-2-0-mini-260428', () => {
    const model = VOLCENGINE_CHAT_MODELS.find((m) => m.id === 'doubao-seed-2-0-mini-260428');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(0.2 / 6.737012 / 1e6);
    expect(model!.cost.output).toBeCloseTo(2.0 / 6.737012 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(0.04 / 6.737012 / 1e6);
  });

  it('should only list fully versioned model IDs', () => {
    // Ark rejects the short console names (doubao-seed-2.1-pro etc.) with
    // InvalidEndpointOrModel.NotFound; doubao-seed-evolving is the one
    // unversioned alias it resolves.
    const unversioned = VOLCENGINE_CHAT_MODELS.filter(
      (m) => m.id !== 'doubao-seed-evolving' && !/-\d{6}$/.test(m.id),
    );
    expect(unversioned).toEqual([]);
  });
});

describe('createVolcengineProvider', () => {
  it('should default to doubao-seed-2-1-pro-260628 when no model is specified', () => {
    expect(createVolcengineProvider('volcengine').id()).toBe(
      'volcengine:doubao-seed-2-1-pro-260628',
    );
    expect(createVolcengineProvider('volcengine:').id()).toBe(
      'volcengine:doubao-seed-2-1-pro-260628',
    );
  });

  it('should create provider with specific model', () => {
    expect(createVolcengineProvider('volcengine:doubao-seed-evolving').id()).toBe(
      'volcengine:doubao-seed-evolving',
    );
  });
});

describe('VolcengineProvider', () => {
  it('should initialize with correct default config', () => {
    const provider = new VolcengineProvider('doubao-seed-2-1-pro-260628', {});
    expect(provider.id()).toBe('volcengine:doubao-seed-2-1-pro-260628');
    expect(provider.toString()).toBe('[Volcengine Provider doubao-seed-2-1-pro-260628]');
    expect(provider.config.apiKeyEnvar).toBe('ARK_API_KEY');
    expect(provider.config.apiBaseUrl).toBe('https://ark.cn-beijing.volces.com/api/v3');
  });

  it('should allow overriding apiBaseUrl and apiKeyEnvar', () => {
    const provider = new VolcengineProvider('doubao-seed-2-1-pro-260628', {
      config: {
        apiBaseUrl: 'https://custom-ark.volces.com/api/v3',
        apiKeyEnvar: 'CUSTOM_ARK_KEY',
      },
    });
    expect(provider.config.apiBaseUrl).toBe('https://custom-ark.volces.com/api/v3');
    expect(provider.config.apiKeyEnvar).toBe('CUSTOM_ARK_KEY');
  });

  it('should format toJSON correctly without leaking raw apiKey', () => {
    const provider = new VolcengineProvider('doubao-seed-2-1-pro-260628', {
      config: {
        apiKey: 'secret-key',
        headers: { Authorization: 'Bearer secret-header' },
        apiBaseUrl: 'https://user:secret-password@example.test/api',
        temperature: 0.5,
      },
    });
    const json = provider.toJSON();
    expect(json.provider).toBe('volcengine');
    expect(json.model).toBe('doubao-seed-2-1-pro-260628');
    expect(json.config.apiKey).toBeUndefined();
    expect(json.config.temperature).toBe(0.5);
    expect(JSON.stringify(json)).not.toMatch(/secret-(key|header|password)/);
  });
});

describe('VolcengineProvider.callApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const usage = {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
    prompt_tokens_details: { cached_tokens: 2 },
  };
  function mockResponse(data: unknown, cached = false) {
    return vi.spyOn(cache, 'fetchWithCache').mockResolvedValue({
      status: 200,
      statusText: 'OK',
      cached,
      data,
    });
  }

  it('sends only the selected Ark endpoint, credentials and tuning options through the public loader', async () => {
    vi.stubEnv('OPENAI_API_HOST', 'openai.invalid');
    vi.stubEnv('OPENAI_ORGANIZATION', 'unrelated-org');
    for (const name of [
      'OPENAI_TOP_P',
      'OPENAI_FREQUENCY_PENALTY',
      'OPENAI_PRESENCE_PENALTY',
      'OPENAI_TEMPERATURE',
      'OPENAI_MAX_TOKENS',
    ]) {
      vi.stubEnv(name, '42');
    }
    const fetch = mockResponse({
      choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }],
      usage,
    });
    const provider = await loadApiProvider('volcengine:unlisted', {
      env: { ARK_API_KEY: 'suite-key', ARK_API_BASE_URL: 'https://suite.invalid/v1' },
      options: {
        env: { ARK_API_KEY: 'provider-key', ARK_API_BASE_URL: 'https://provider.invalid/v1' },
        config: {
          apiBaseUrl: '',
          max_completion_tokens: 32,
          inputCost: 1,
          outputCost: 4,
          cacheReadCost: 0.5,
        },
      },
    });
    const response = await provider.callApi('hi', {
      prompt: { raw: 'hi', label: 'test', config: { apiBaseUrl: null, outputCost: 2 } },
      vars: {},
    });
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe('https://provider.invalid/v1/chat/completions');
    expect(request?.headers).toMatchObject({ Authorization: 'Bearer provider-key' });
    expect(request?.headers).not.toHaveProperty('OpenAI-Organization');
    expect(JSON.parse(String(request?.body))).toEqual({
      model: 'unlisted',
      messages: [{ role: 'user', content: 'hi' }],
      max_completion_tokens: 32,
    });
    expect(response).toMatchObject({
      output: 'answer',
      cost: 19,
      tokenUsage: { prompt: 10, completion: 5 },
    });
  });

  it('requires an Ark key even when an OpenAI key is available', async () => {
    vi.stubEnv('ARK_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', 'unrelated-key');
    const provider = new VolcengineProvider('unlisted');
    const fetch = mockResponse({});
    await expect(provider.callApi('hi')).rejects.toThrow('ARK_API_KEY');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns provider errors from the transport', async () => {
    mockResponse({ error: { message: 'Ark error', code: 'invalid_request' } });
    const provider = new VolcengineProvider('unlisted', { config: { apiKey: 'fixture' } });
    expect((await provider.callApi('hi')).error).toContain('Ark error');
  });

  it('keeps retryable Ark rate limits visible to the scheduler', async () => {
    vi.spyOn(cache, 'fetchWithCache').mockRejectedValue(
      new HttpRateLimitError({ status: 429, headers: { 'retry-after': '2' } }),
    );
    const provider = new VolcengineProvider('unlisted', { config: { apiKey: 'fixture' } });
    expect(await provider.callApi('hi')).toMatchObject({
      error: expect.stringContaining('Rate limit exceeded'),
      metadata: {
        rateLimitKind: 'rate_limit',
        http: { status: 429, headers: { 'retry-after': '2' } },
      },
    });
  });

  it('prices a cached response at zero', async () => {
    mockResponse(
      { choices: [{ message: { content: 'answer' }, finish_reason: 'stop' }], usage },
      true,
    );
    const provider = new VolcengineProvider('unlisted', { config: { apiKey: 'fixture', cost: 1 } });
    expect(await provider.callApi('hi')).toMatchObject({ cached: true, cost: 0 });
  });
});

describe('createVolcengineProvider routing', () => {
  it('defaults the model for the bare provider ID', () => {
    expect(createVolcengineProvider('volcengine').id()).toBe(
      'volcengine:doubao-seed-2-1-pro-260628',
    );
  });

  it('defaults the model for a trailing colon', () => {
    expect(createVolcengineProvider('volcengine:').id()).toBe(
      'volcengine:doubao-seed-2-1-pro-260628',
    );
  });

  it('throws on sub-types this provider does not implement', () => {
    expect(() => createVolcengineProvider('volcengine:responses')).toThrow(/only.*chat models/i);
    expect(() => createVolcengineProvider('volcengine:embedding:doubao-embedding')).toThrow(
      /only.*chat models/i,
    );
  });

  it('still accepts a model name containing a colon', () => {
    expect(createVolcengineProvider('volcengine:doubao-seed-evolving').id()).toBe(
      'volcengine:doubao-seed-evolving',
    );
  });
});

describe('calculateVolcengineCost zero tokens', () => {
  it('prices a response with zero completion tokens', () => {
    const cost = calculateVolcengineCost('doubao-seed-2-1-pro-260628', {}, 1000000, 0);
    expect(cost).toBeCloseTo(6.0 / 6.737012);
  });
});

describe('cost override edge cases', () => {
  const RATE = 6.737012;

  it('applies an inputCost override to cached tokens too', () => {
    const cost = calculateVolcengineCost(
      'doubao-seed-2-1-pro-260628',
      { inputCost: 1.0 / 1e6 },
      1000000,
      1000000,
      500000,
    );
    // 500k fresh + 500k cached both at the override, output from the model table
    expect(cost).toBeCloseTo(0.5 + 0.5 + 30.0 / RATE);
  });

  it('still honors an explicit cacheReadCost over the input override', () => {
    const cost = calculateVolcengineCost(
      'doubao-seed-2-1-pro-260628',
      { inputCost: 1.0 / 1e6, cacheReadCost: 0.1 / 1e6 },
      1000000,
      1000000,
      500000,
    );
    expect(cost).toBeCloseTo(0.5 + 0.05 + 30.0 / RATE);
  });
});
