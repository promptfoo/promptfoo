import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { calculateCerebrasCost, createCerebrasProvider } from '../../src/providers/cerebras';
import { loadApiProvider } from '../../src/providers/index';
import { mockProcessEnv } from '../util/utils';
import type { z } from 'zod';

import type { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { ProviderEnvOverridesSchema } from '../../src/types/env';
import type { ApiProvider } from '../../src/types/index';

type ProviderEnvOverrides = z.infer<typeof ProviderEnvOverridesSchema>;

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

describe('Cerebras provider', () => {
  let provider: ApiProvider;
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.mocked(fetchWithCache).mockReset();
    restoreEnv = mockProcessEnv({ CEREBRAS_API_KEY: 'test-key' });
  });

  afterEach(() => {
    vi.resetAllMocks();
    restoreEnv();
  });

  describe('createCerebrasProvider', () => {
    it('should create a chat provider', async () => {
      provider = createCerebrasProvider('cerebras:llama3.1-8b');
      expect(provider.id()).toBe('llama3.1-8b');
      expect(provider.toString()).toContain('OpenAI');
      expect((provider as OpenAiChatCompletionProvider).config).toMatchObject({
        apiKeyEnvar: 'CEREBRAS_API_KEY',
        apiBaseUrl: 'https://api.cerebras.ai/v1',
        passthrough: {},
      });
    });

    it('should handle custom config options', async () => {
      provider = createCerebrasProvider('cerebras:llama3.1-8b', {
        config: {
          config: {
            basePath: '/custom/path',
            temperature: 0.8,
          },
        },
      });
      expect((provider as OpenAiChatCompletionProvider).config).toMatchObject({
        apiKeyEnvar: 'CEREBRAS_API_KEY',
        apiBaseUrl: 'https://api.cerebras.ai/v1',
        passthrough: {
          temperature: 0.8,
        },
      });
    });

    it('should keep custom pricing overrides out of the API request body', async () => {
      const provider = createCerebrasProvider('cerebras:gpt-oss-120b', {
        config: {
          config: {
            cost: 9 / 1e6,
            inputCost: 1 / 1e6,
            outputCost: 2 / 1e6,
            apiKey: 'catalog-fixture-key',
            apiBaseUrl: 'https://cerebras.example.invalid/v1',
            headers: { 'x-catalog-fixture': 'local-options' },
            temperature: 0.8,
            passthrough: { top_p: 0.6 },
          },
        },
      });

      const cerebras = provider as OpenAiChatCompletionProvider & {
        calculateResponseCost(
          data: Record<string, unknown>,
          config: Record<string, unknown>,
          cached: boolean,
        ): number | undefined;
      };
      const { body, config } = await cerebras.getOpenAiBody('test prompt');

      expect(body).not.toHaveProperty('cost');
      expect(body).not.toHaveProperty('inputCost');
      expect(body).not.toHaveProperty('outputCost');
      expect(body.temperature).toBe(0.8);
      expect(config).toMatchObject({
        cost: 9 / 1e6,
        inputCost: 1 / 1e6,
        outputCost: 2 / 1e6,
      });
      expect(config.passthrough).toEqual({ temperature: 0.8, top_p: 0.6 });
      expect(
        cerebras.calculateResponseCost(
          { usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 } },
          config,
          false,
        ),
      ).toBeCloseTo(3, 10);

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: 'fixture response' } }],
          usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const result = await provider.callApi('test prompt');
      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toBe('https://cerebras.example.invalid/v1/chat/completions');
      expect(request?.headers).toMatchObject({
        Authorization: 'Bearer catalog-fixture-key',
        'x-catalog-fixture': 'local-options',
      });
      const requestBody = JSON.parse(request?.body as string);
      expect(requestBody).toMatchObject({
        model: 'gpt-oss-120b',
        temperature: 0.8,
        top_p: 0.6,
      });
      for (const field of ['apiKey', 'apiBaseUrl', 'headers', 'cost', 'inputCost', 'outputCost']) {
        expect(requestBody).not.toHaveProperty(field);
      }
      expect(result.output).toBe('fixture response');
      expect(result.cost).toBeCloseTo(3, 10);
    });

    it('should handle max_tokens correctly', async () => {
      const provider = createCerebrasProvider('cerebras:llama3.1-8b');
      const { body } = await (provider as OpenAiChatCompletionProvider).getOpenAiBody(
        'test prompt',
        undefined,
        {
          max_tokens: 1024,
        } as any,
      );

      expect(body).toMatchObject({
        messages: [
          {
            role: 'user',
            content: 'test prompt',
          },
        ],
        model: 'llama3.1-8b',
        max_tokens: 1024,
      });
    });

    it('should handle model name parsing', async () => {
      const provider = createCerebrasProvider('cerebras:model:with:colons');
      expect(provider.id()).toBe('model:with:colons');
    });

    it('should merge env overrides', async () => {
      const provider = createCerebrasProvider('cerebras:test-model', {
        env: {
          OPENAI_API_KEY: 'override-key',
        } as ProviderEnvOverrides,
      });
      expect((provider as OpenAiChatCompletionProvider).config.apiKeyEnvar).toBe(
        'CEREBRAS_API_KEY',
      );
    });

    it('should handle empty config', async () => {
      const provider = createCerebrasProvider('cerebras:test-model');
      expect((provider as OpenAiChatCompletionProvider).config).toMatchObject({
        apiKeyEnvar: 'CEREBRAS_API_KEY',
        apiBaseUrl: 'https://api.cerebras.ai/v1',
        passthrough: {},
      });
    });

    it('should not remove max_tokens if max_completion_tokens is not present', async () => {
      const provider = createCerebrasProvider('cerebras:llama3.1-8b');
      const { body } = await (provider as OpenAiChatCompletionProvider).getOpenAiBody(
        'prompt',
        undefined,
        {
          max_tokens: 123,
        } as any,
      );
      expect(body.max_tokens).toBe(1024);
      expect(body.max_completion_tokens).toBeUndefined();
    });

    it('should support both empty and undefined options', async () => {
      const provider1 = createCerebrasProvider('cerebras:foo');
      const provider2 = createCerebrasProvider('cerebras:foo', undefined);
      expect((provider1 as OpenAiChatCompletionProvider).config).toMatchObject({
        apiKeyEnvar: 'CEREBRAS_API_KEY',
        apiBaseUrl: 'https://api.cerebras.ai/v1',
        passthrough: {},
      });
      expect((provider2 as OpenAiChatCompletionProvider).config).toMatchObject({
        apiKeyEnvar: 'CEREBRAS_API_KEY',
        apiBaseUrl: 'https://api.cerebras.ai/v1',
        passthrough: {},
      });
    });

    it('should not include basePath in passthrough config', async () => {
      const provider = createCerebrasProvider('cerebras:llama3.1-8b', {
        config: {
          config: {
            basePath: '/should/not/be/included',
            foo: 'bar',
          },
        },
      });
      expect((provider as OpenAiChatCompletionProvider).config.passthrough).toMatchObject({
        foo: 'bar',
      });

      expect(
        ((provider as OpenAiChatCompletionProvider).config.passthrough as any).basePath,
      ).toBeUndefined();
    });

    it('should keep credentials and headers out of passthrough', async () => {
      // Regression: the whole config was spread into `passthrough`, so a configured
      // apiKey was serialized into the request body and custom headers never became
      // HTTP headers.
      const provider = createCerebrasProvider('cerebras:llama3.1-8b', {
        config: {
          config: {
            apiKey: 'CEREBRAS-SECRET',
            headers: { 'X-Tenant': 'acme' },
            temperature: 0.5,
          },
        },
      });

      const config = (provider as OpenAiChatCompletionProvider).config;
      expect(config.passthrough).toEqual({ temperature: 0.5 });
      expect(config.apiKey).toBe('CEREBRAS-SECRET');
      expect(config.headers).toEqual({ 'X-Tenant': 'acme' });
    });

    it('should pass through arbitrary passthrough config', async () => {
      const provider = createCerebrasProvider('cerebras:llama3.1-8b', {
        config: {
          config: {
            customParam: 'myValue',
          },
        },
      });
      expect((provider as OpenAiChatCompletionProvider).config.passthrough).toMatchObject({
        customParam: 'myValue',
      });
    });

    it('keeps authentication and transport settings out of the model request', async () => {
      const provider = createCerebrasProvider('cerebras:llama3.1-8b', {
        config: {
          config: {
            apiKey: 'configured-key',
            headers: { 'x-test': 'test-header' },
            linkedTargetId: 'internal-target',
            temperature: 0.4,
          },
        },
      }) as OpenAiChatCompletionProvider;
      const { body } = await provider.getOpenAiBody('prompt');
      expect(provider.getApiKey()).toBe('configured-key');
      expect(provider.config.headers).toEqual({ 'x-test': 'test-header' });
      expect(body).toMatchObject({ temperature: 0.4 });
      expect(JSON.stringify(body)).not.toContain('configured-key');
      expect(JSON.stringify(body)).not.toContain('internal-target');
      expect(JSON.stringify(body)).not.toContain('test-header');
    });

    it('should allow id and env options', async () => {
      const provider = createCerebrasProvider('cerebras:llama3.1-8b', {
        id: 'custom-id',
        env: {
          CEREBRAS_API_KEY: 'another-key',
        } as ProviderEnvOverrides,
      });
      expect(provider.id()).toBe('custom-id');
      expect((provider as OpenAiChatCompletionProvider).config.apiKeyEnvar).toBe(
        'CEREBRAS_API_KEY',
      );
    });

    it('should not include max_tokens or max_completion_tokens if neither provided', async () => {
      const provider = createCerebrasProvider('cerebras:llama3.1-8b');
      const { body } = await (provider as OpenAiChatCompletionProvider).getOpenAiBody(
        'prompt',
        undefined,
        {} as any,
      );
      expect(body.max_tokens).toBe(1024);
      expect(body.max_completion_tokens).toBeUndefined();
    });
  });

  describe('request model billing', () => {
    it.each([
      {
        name: 'ignores a top-level prompt model that is not sent',
        model: 'gemma-4-31b',
        providerConfig: {},
        promptConfig: { model: 'gpt-oss-120b' },
        expectedModel: 'gemma-4-31b',
        expectedCost: 2.48,
      },
      {
        name: 'preserves the provider passthrough model over a top-level prompt model',
        model: 'gemma-4-31b',
        providerConfig: { model: 'zai-glm-4.7' },
        promptConfig: { model: 'gpt-oss-120b' },
        expectedModel: 'zai-glm-4.7',
        expectedCost: 5,
      },
      {
        name: 'uses the prompt passthrough model over provider and top-level prompt models',
        model: 'gemma-4-31b',
        providerConfig: { model: 'zai-glm-4.7' },
        promptConfig: { model: 'gemma-4-31b', passthrough: { model: 'gpt-oss-120b' } },
        expectedModel: 'gpt-oss-120b',
        expectedCost: 1.1,
      },
      {
        name: 'uses the provider selector when prompt passthrough replaces the model override',
        model: 'gemma-4-31b',
        providerConfig: { model: 'zai-glm-4.7' },
        promptConfig: { model: 'gpt-oss-120b', passthrough: {} },
        expectedModel: 'gemma-4-31b',
        expectedCost: 2.48,
      },
      {
        name: 'leaves opaque provider models unpriced despite a known top-level prompt model',
        model: 'opaque-model',
        providerConfig: {},
        promptConfig: { model: 'gpt-oss-120b' },
        expectedModel: 'opaque-model',
        expectedCost: undefined,
      },
      {
        name: 'leaves opaque passthrough models unpriced despite a known top-level prompt model',
        model: 'gemma-4-31b',
        providerConfig: {},
        promptConfig: { model: 'gpt-oss-120b', passthrough: { model: 'opaque-model' } },
        expectedModel: 'opaque-model',
        expectedCost: undefined,
      },
      {
        name: 'preserves prompt pricing overrides over provider pricing defaults',
        model: 'gemma-4-31b',
        providerConfig: {
          model: 'gpt-oss-120b',
          cost: 9 / 1e6,
          inputCost: 1 / 1e6,
          outputCost: 2 / 1e6,
        },
        promptConfig: { model: 'zai-glm-4.7', inputCost: 3 / 1e6, outputCost: 4 / 1e6 },
        expectedModel: 'gpt-oss-120b',
        expectedCost: 7,
      },
      {
        name: 'prices an uncatalogued model with explicit input and output rates',
        model: 'qwen-3.8-27b',
        providerConfig: { inputCost: 1 / 1e6, outputCost: 2 / 1e6 },
        promptConfig: {},
        expectedModel: 'qwen-3.8-27b',
        expectedCost: 3,
      },
      {
        name: 'prices a dedicated model with a flat rate',
        model: 'dedicated-model',
        providerConfig: { cost: 2 / 1e6 },
        promptConfig: {},
        expectedModel: 'dedicated-model',
        expectedCost: 4,
      },
      {
        name: 'honors prompt pricing for an uncatalogued passthrough model',
        model: 'gemma-4-31b',
        providerConfig: { model: 'dedicated-model', inputCost: 1 / 1e6, outputCost: 2 / 1e6 },
        promptConfig: { inputCost: 3 / 1e6, outputCost: 4 / 1e6 },
        expectedModel: 'dedicated-model',
        expectedCost: 7,
      },
      {
        name: 'does not fill incomplete custom rates from the OpenAI catalog',
        model: 'gpt-4o',
        providerConfig: { inputCost: 1 / 1e6 },
        promptConfig: {},
        expectedModel: 'gpt-4o',
        expectedCost: undefined,
      },
    ])('$name', async ({ model, providerConfig, promptConfig, expectedModel, expectedCost }) => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          choices: [{ message: { content: 'response' } }],
          usage: {
            prompt_tokens: 1_000_000,
            completion_tokens: 1_000_000,
            total_tokens: 2_000_000,
          },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const provider = createCerebrasProvider(`cerebras:${model}`, {
        config: { config: providerConfig },
      });
      const context = { prompt: { raw: 'hello', label: 'hello', config: promptConfig }, vars: {} };

      const result = await provider.callApi('hello', context);

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('response');
      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledTimes(1);
      const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
      expect(body.model).toBe(expectedModel);
      for (const field of ['cost', 'inputCost', 'outputCost']) {
        expect(body).not.toHaveProperty(field);
      }
      if (expectedCost === undefined) {
        expect(result.cost).toBeUndefined();
      } else {
        expect(result.cost).toBeCloseTo(expectedCost, 10);
      }

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: { choices: [{ message: { content: 'response' } }] },
        cached: true,
        status: 200,
        statusText: 'OK',
      });
      const cachedResult = await provider.callApi('hello', context);
      expect(cachedResult.cached).toBe(true);
      expect(cachedResult.cost).toBe(0);
    });
  });

  const customRates = { inputCost: 1e-6, outputCost: 2e-6 };
  const completeUsage = { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 };
  const audioUsage = { ...completeUsage, prompt_tokens_details: { audio_tokens: 200 } };

  it.each(
    [
      {
        name: 'absent usage',
        usage: undefined,
        config: customRates,
        costs: [undefined, undefined],
      },
      { name: 'null usage', usage: null, config: customRates, costs: [undefined, undefined] },
      { name: 'falsy usage', usage: 0, config: customRates, costs: [undefined, undefined] },
      { name: 'empty usage with explicit rates', usage: {}, config: customRates, costs: [0, 0] },
      {
        name: 'input-only usage',
        usage: { prompt_tokens: 1000 },
        config: customRates,
        costs: [0.001, 0.001],
      },
      {
        name: 'output-only usage',
        usage: { completion_tokens: 500 },
        config: customRates,
        costs: [0.001, 0.001],
      },
      {
        name: 'total-only usage',
        usage: { total_tokens: 1500 },
        config: customRates,
        costs: [0.0015, 0.0015],
      },
      {
        name: 'zero directions with a positive total',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 1500 },
        config: customRates,
        costs: [0.0015, 0.0015],
      },
      {
        name: 'complete usage and split rates',
        usage: completeUsage,
        config: customRates,
        costs: [0.002, 0.002],
      },
      {
        name: 'complete usage and scalar rate',
        usage: completeUsage,
        config: { cost: 2e-6 },
        costs: [0.003, 0.003],
      },
      { name: 'explicit zero rate', usage: completeUsage, config: { cost: 0 }, costs: [0, 0] },
      {
        name: 'incomplete rates with catalog fallback',
        usage: completeUsage,
        config: { inputCost: 1e-6 },
        costs: [undefined, 0.001745],
      },
      {
        name: 'uncovered normalized input for an unknown model',
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 1500 },
        config: { outputCost: 2e-6 },
        costs: [undefined],
      },
      {
        name: 'explicit text and audio rates',
        usage: audioUsage,
        config: { ...customRates, audioInputCost: 3e-6 },
        costs: [0.0024, 0.0024],
      },
      {
        name: 'uncovered audio for an unknown model',
        usage: audioUsage,
        config: customRates,
        costs: [undefined],
      },
      {
        name: 'normalization of a nonfinite input count',
        usage: { ...completeUsage, prompt_tokens: Number.NaN },
        config: customRates,
        costs: [0.001, 0.001],
      },
      { name: 'no explicit rates', usage: completeUsage, config: {}, costs: [undefined, 0.001735] },
    ].flatMap(({ costs, ...testCase }) =>
      // Expectations list unknown-model cost first, then catalog cost when that contract is in scope.
      costs.map((cost, index) => ({
        ...testCase,
        model: ['dedicated-model', 'gemma-4-31b'][index],
        cost,
      })),
    ),
  )('$name ($model)', async ({ model, usage, config, cost }) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { choices: [{ message: { content: 'response' } }], usage },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const provider = createCerebrasProvider(`cerebras:${model}`, { config: { config } });

    const result = await provider.callApi('hello');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('response');
    if (cost === undefined) {
      expect(result.cost).toBeUndefined();
    } else {
      expect(result.cost).toBeCloseTo(cost, 10);
    }
  });

  describe('calculateCerebrasCost', () => {
    it.each([
      ['gpt-oss-120b', 1.1],
      ['gemma-4-31b', 2.48],
      ['zai-glm-4.7', 5],
    ])('calculates the published cost for %s', (model, expectedCost) => {
      expect(calculateCerebrasCost(model, {}, 1_000_000, 1_000_000)).toBeCloseTo(expectedCost, 10);
    });

    it('returns undefined for unknown models or incomplete usage', () => {
      expect(calculateCerebrasCost('unknown-model', {}, 1_000_000, 1_000_000)).toBeUndefined();
      expect(calculateCerebrasCost('gpt-oss-120b', {}, undefined, 1_000_000)).toBeUndefined();
      expect(calculateCerebrasCost('gpt-oss-120b', {}, 1_000_000, undefined)).toBeUndefined();
    });

    it('honors explicit input and output cost overrides', () => {
      expect(
        calculateCerebrasCost(
          'gpt-oss-120b',
          { inputCost: 1 / 1e6, outputCost: 2 / 1e6 },
          1_000_000,
          1_000_000,
        ),
      ).toBeCloseTo(3, 10);
    });

    it.each([
      {
        config: { inputCost: 1 / 1e6, outputCost: 2 / 1e6 },
        prompt: 1e6,
        completion: 1e6,
        cost: 3,
      },
      { config: { cost: 2 / 1e6 }, prompt: 1e6, completion: 1e6, cost: 4 },
      { config: { cost: 2 / 1e6, inputCost: 0 }, prompt: 1e6, completion: 1e6, cost: 2 },
      { config: { cost: 0 }, prompt: 1e6, completion: 1e6, cost: 0 },
      { config: { inputCost: 1 / 1e6 }, prompt: 1e6, completion: 0, cost: 1 },
      { config: { outputCost: 2 / 1e6 }, prompt: 0, completion: 1e6, cost: 2 },
      { config: { cost: 1 / 1e6 }, prompt: 0, completion: 0, cost: 0 },
    ])(
      'prices uncatalogued usage with explicit rates: %j',
      ({ config, prompt, completion, cost }) => {
        expect(calculateCerebrasCost('dedicated-model', config, prompt, completion)).toBeCloseTo(
          cost,
          10,
        );
      },
    );

    it.each([{}, { inputCost: 1 / 1e6 }, { outputCost: 2 / 1e6 }])(
      'requires explicit rates for all nonzero uncatalogued usage: %j',
      (config) => {
        expect(calculateCerebrasCost('dedicated-model', config, 1e6, 1e6)).toBeUndefined();
      },
    );

    it.each([
      [undefined, 1e6],
      [1e6, undefined],
      [Number.NaN, 1e6],
      [1e6, Number.NaN],
      [Number.POSITIVE_INFINITY, 1e6],
      [1e6, Number.POSITIVE_INFINITY],
    ])(
      'rejects incomplete or nonfinite usage even with explicit rates (%s, %s)',
      (prompt, completion) => {
        for (const model of ['gpt-oss-120b', 'dedicated-model']) {
          expect(
            calculateCerebrasCost(model, { cost: 1 / 1e6 }, prompt, completion),
          ).toBeUndefined();
        }
      },
    );

    it('reports the published model cost through the provider response hook', () => {
      const provider = createCerebrasProvider('cerebras:gpt-oss-120b') as unknown as {
        calculateResponseCost(
          data: Record<string, unknown>,
          config: Record<string, unknown>,
          cached: boolean,
        ): number | undefined;
      };

      const cost = provider.calculateResponseCost(
        { usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 } },
        {},
        false,
      );

      expect(cost).toBeCloseTo(1.1, 10);
    });

    it('gives prompt-level pricing overrides precedence over provider defaults', () => {
      const provider = createCerebrasProvider('cerebras:gpt-oss-120b') as unknown as {
        calculateResponseCost(
          data: Record<string, unknown>,
          config: Record<string, unknown>,
          cached: boolean,
        ): number | undefined;
      };

      const cost = provider.calculateResponseCost(
        { usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 } },
        {
          inputCost: 3 / 1e6,
          outputCost: 4 / 1e6,
          passthrough: { inputCost: 1 / 1e6, outputCost: 2 / 1e6 },
        },
        false,
      );

      expect(cost).toBeCloseTo(7, 10);
    });
  });

  describe('loadApiProvider', () => {
    it('should load the provider from the registry', async () => {
      provider = await loadApiProvider('cerebras:llama3.1-8b');
      expect(provider.id()).toBe('llama3.1-8b');
      expect(provider.toString()).toContain('OpenAI');
      expect((provider as OpenAiChatCompletionProvider).config).toMatchObject({
        apiKeyEnvar: 'CEREBRAS_API_KEY',
        apiBaseUrl: 'https://api.cerebras.ai/v1',
        passthrough: {},
      });
    });
  });
});
