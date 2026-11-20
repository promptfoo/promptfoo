const { createErrorFirstLoggerModule } = await vi.hoisted(
  async () => import('../factories/logger'),
);

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, isCacheEnabled, withCacheNamespace } from '../../src/cache';
import logger from '../../src/logger';
import {
  MistralChatCompletionProvider,
  MistralEmbeddingProvider,
} from '../../src/providers/mistral';
import { maybeLoadToolsFromExternalFile } from '../../src/util';
import { createChatCompletion } from '../factories/literalFixtures';
import { createMockChatResponse, createMockFetchResponse } from './mockProviderResponses';

const createMistralEmbeddingResponse = () => ({
  model: 'mistral-embed',
  data: [{ embedding: [0.1, 0.2, 0.3] }],
  usage: { total_tokens: 5, prompt_tokens: 5 },
});

vi.mock('../../src/logger', () => createErrorFirstLoggerModule());

vi.mock('../../src/cache', async () => ({
  ...(await vi.importActual('../../src/cache')),
  fetchWithCache: vi.fn(),
  getCache: vi.fn(),
  isCacheEnabled: vi.fn(),
}));

vi.mock('../../src/util', async () => ({
  ...(await vi.importActual('../../src/util')),
  maybeLoadToolsFromExternalFile: vi.fn(),
}));

describe('Mistral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchWithCache).mockReset();
    vi.mocked(maybeLoadToolsFromExternalFile).mockImplementation(async (tools) => tools);
    vi.mocked(isCacheEnabled).mockReturnValue(false);
    vi.mocked(getCache).mockReturnValue({
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      wrap: vi.fn(),
      del: vi.fn(),
      clear: vi.fn(),
      stores: [
        {
          get: vi.fn(),
          set: vi.fn(),
        },
      ] as any,
      mget: vi.fn(),
      mset: vi.fn(),
      mdel: vi.fn(),
      reset: vi.fn(),
      ttl: vi.fn(),
      on: vi.fn(),
      removeAllListeners: vi.fn(),
    } as any);
  });

  describe('MistralChatCompletionProvider', () => {
    let provider: MistralChatCompletionProvider;

    beforeEach(() => {
      provider = new MistralChatCompletionProvider('mistral-tiny');
      vi.spyOn(provider, 'getApiKey').mockReturnValue('fake-api-key');
    });

    it('should create a provider with default options', () => {
      expect(provider.modelName).toBe('mistral-tiny');
      expect(provider.config).toEqual({});
    });

    it('should create a provider with custom options', () => {
      const customProvider = new MistralChatCompletionProvider('mistral-medium', {
        config: { temperature: 0.7 },
      });
      expect(customProvider.modelName).toBe('mistral-medium');
      expect(customProvider.config).toEqual({ temperature: 0.7 });
    });

    it('should accept current and historical Mistral model IDs', () => {
      const smallProvider = new MistralChatCompletionProvider('magistral-small-2509');
      expect(smallProvider.modelName).toBe('magistral-small-2509');
      expect(smallProvider.config).toEqual({});

      const magistralMediumProvider = new MistralChatCompletionProvider('magistral-medium-latest', {
        config: { temperature: 0.7, max_tokens: 40960 },
      });
      expect(magistralMediumProvider.modelName).toBe('magistral-medium-latest');
      expect(magistralMediumProvider.config).toEqual({ temperature: 0.7, max_tokens: 40960 });

      expect(new MistralChatCompletionProvider('mistral-large-2512').modelName).toBe(
        'mistral-large-2512',
      );
      expect(new MistralChatCompletionProvider('mistral-medium-3-5').modelName).toBe(
        'mistral-medium-3-5',
      );
      expect(new MistralChatCompletionProvider('ministral-14b-latest').modelName).toBe(
        'ministral-14b-latest',
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should support Pixtral multimodal model', () => {
      const pixtralProvider = new MistralChatCompletionProvider('pixtral-12b', {
        config: { temperature: 0.8, max_tokens: 2048 },
      });
      expect(pixtralProvider.modelName).toBe('pixtral-12b');
      expect(pixtralProvider.config).toEqual({ temperature: 0.8, max_tokens: 2048 });
    });

    it('should calculate cost correctly for Pixtral model', async () => {
      const pixtralProvider = new MistralChatCompletionProvider('pixtral-12b');
      vi.spyOn(pixtralProvider, 'getApiKey').mockReturnValue('fake-api-key');

      const mockResponse = {
        choices: [{ message: { content: 'Image analysis response' } }],
        usage: { total_tokens: 2000, prompt_tokens: 800, completion_tokens: 1200 },
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse(mockResponse));

      const result = await pixtralProvider.callApi('Analyze this image: <image_url>');

      // Pixtral: $0.15/M tokens for both input and output
      // 800 prompt tokens * 0.15/1M + 1200 completion tokens * 0.15/1M = 0.00012 + 0.00018 = 0.0003
      expect(result.cost).toBeCloseTo(0.0003, 6);
    });

    it('should call Mistral API and return output with correct structure', async () => {
      const mockResponse = createChatCompletion();
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse(mockResponse));

      const result = await provider.callApi('Test prompt');

      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
        expect.stringContaining('/chat/completions'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-promptfoo-silent': 'true',
            Authorization: expect.stringContaining('Bearer '),
          }),
          body: expect.stringContaining('"messages":[{"role":"user","content":"Test prompt"}]'),
        }),
        expect.any(Number),
        'json',
        true,
      );

      expect(result).toEqual({
        output: 'Test output',
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
          numRequests: 1,
        },
        cached: false,
        cost: expect.any(Number),
      });
    });

    it('should preserve explicit zero for top_p, random_seed, and max_tokens', async () => {
      const zeroProvider = new MistralChatCompletionProvider('mistral-tiny', {
        config: { top_p: 0, random_seed: 0, max_tokens: 0 },
      });
      vi.spyOn(zeroProvider, 'getApiKey').mockReturnValue('fake-api-key');

      const mockResponse = createChatCompletion();
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse(mockResponse));

      await zeroProvider.callApi('Test prompt');

      const callArgs = vi.mocked(fetchWithCache).mock.calls[0];
      const body = JSON.parse((callArgs[1] as RequestInit).body as string);
      expect(body.top_p).toBe(0);
      expect(body.random_seed).toBe(0);
      expect(body.max_tokens).toBe(0);
    });

    it('should pass through current chat completion options', async () => {
      const advancedProvider = new MistralChatCompletionProvider('mistral-medium-3-5', {
        config: {
          frequency_penalty: 0.25,
          presence_penalty: 0.5,
          stop: ['END'],
          n: 2,
          safe_prompt: false,
          prompt_mode: null,
          reasoning_effort: 'high',
          prediction: { type: 'content', content: 'Expected completion' },
          metadata: { requestId: 'abc-123' },
          guardrails: [{ block_on_error: true }],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'answer',
              schema: {
                type: 'object',
                properties: {
                  answer: { type: 'string' },
                },
                required: ['answer'],
              },
            },
          },
        },
      });
      vi.spyOn(advancedProvider, 'getApiKey').mockReturnValue('fake-api-key');
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockChatResponse('{"answer":"ok"}'));

      await advancedProvider.callApi('Test prompt');

      const requestInit = vi.mocked(fetchWithCache).mock.calls[0]?.[1];
      expect(requestInit).toBeDefined();
      const body = JSON.parse((requestInit as RequestInit).body as string);
      expect(body).toMatchObject({
        frequency_penalty: 0.25,
        presence_penalty: 0.5,
        stop: ['END'],
        n: 2,
        safe_prompt: false,
        prompt_mode: null,
        reasoning_effort: 'high',
        prediction: { type: 'content', content: 'Expected completion' },
        metadata: { requestId: 'abc-123' },
        guardrails: [{ block_on_error: true }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'answer',
          },
        },
      });
    });

    it('should include tools configuration in the request body', async () => {
      const tools = [
        {
          type: 'function',
          function: {
            name: 'calculate',
            description: 'Perform basic math',
            parameters: {
              type: 'object',
              properties: {
                a: { type: 'number' },
                b: { type: 'number' },
              },
              required: ['a', 'b'],
            },
          },
        },
      ];
      const customProvider = new MistralChatCompletionProvider('mistral-medium', {
        config: {
          tools,
          tool_choice: 'any',
          parallel_tool_calls: false,
        },
      });
      vi.spyOn(customProvider, 'getApiKey').mockReturnValue('fake-api-key');
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse({
          choices: [{ message: { content: null, tool_calls: tools } }],
          usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
        }),
      );

      await customProvider.callApi('Test prompt');

      expect(vi.mocked(maybeLoadToolsFromExternalFile)).toHaveBeenCalledWith(tools, undefined);
      const requestInit = vi.mocked(fetchWithCache).mock.calls[0]?.[1];
      expect(requestInit).toBeDefined();
      const requestBody = JSON.parse((requestInit as RequestInit).body as string);
      expect(requestBody).toMatchObject({
        tools,
        tool_choice: 'any',
        parallel_tool_calls: false,
      });
    });

    it('should calculate cost correctly for Magistral models', async () => {
      const magistralSmallProvider = new MistralChatCompletionProvider('magistral-small-2509');
      vi.spyOn(magistralSmallProvider, 'getApiKey').mockReturnValue('fake-api-key');

      const mockResponse = {
        choices: [{ message: { content: 'Reasoning response' } }],
        usage: { total_tokens: 1000, prompt_tokens: 100, completion_tokens: 900 },
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse(mockResponse));

      const result = await magistralSmallProvider.callApi('Test reasoning prompt');

      // Magistral Small: $0.5/M input, $1.5/M output
      // 100 prompt tokens * 0.5/1M + 900 completion tokens * 1.5/1M = 0.00005 + 0.00135 = 0.0014
      expect(result.cost).toBeCloseTo(0.0014, 6);
    });

    it('should calculate cost correctly for current latest aliases', async () => {
      const latestProvider = new MistralChatCompletionProvider('mistral-large-latest');
      vi.spyOn(latestProvider, 'getApiKey').mockReturnValue('fake-api-key');

      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse({
          choices: [{ message: { content: 'Current latest response' } }],
          usage: { total_tokens: 1000, prompt_tokens: 400, completion_tokens: 600 },
        }),
      );

      const result = await latestProvider.callApi('Test latest alias pricing');

      // mistral-large-latest resolves to Mistral Large 4: $0.7/M in, $2.1/M out
      // 400 * 0.7/1M + 600 * 2.1/1M = 0.00028 + 0.00126 = 0.00154
      expect(result.cost).toBeCloseTo(0.00154, 6);
    });

    it.each([
      { seconds: 60, expected: 0.00426 },
      { seconds: 0, expected: 0.00026 },
      { seconds: undefined, expected: 0.00026 },
      { seconds: null, expected: 0.00026 },
    ])('includes reported Voxtral audio duration: $seconds', async ({ seconds, expected }) => {
      const voxtral = new MistralChatCompletionProvider('voxtral-small-2507', {
        config: { apiKey: 'test-key' },
      });
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: 'Audio summary' } }],
          usage: { prompt_tokens: 1000, completion_tokens: 400, prompt_audio_seconds: seconds },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      expect((await voxtral.callApi('Summarize the input')).cost).toBeCloseTo(expected, 8);
    });

    it('keeps Voxtral audio charges alongside explicit zero token prices and cached usage', async () => {
      const voxtral = new MistralChatCompletionProvider('voxtral-small-2507', {
        config: { apiKey: 'test-key', cost: 0 },
      });
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: 'Audio summary' } }],
          usage: {
            total_tokens: 1400,
            prompt_tokens: 1000,
            completion_tokens: 400,
            prompt_audio_seconds: 60,
          },
        },
        cached: true,
        status: 200,
        statusText: 'OK',
      });
      expect(await voxtral.callApi('Summarize the input')).toMatchObject({
        cached: true,
        cost: 0.004,
      });
    });

    it.each([-1, Number.NaN, '60'])(
      'leaves Voxtral cost unknown for invalid reported audio duration %s',
      async (seconds) => {
        const voxtral = new MistralChatCompletionProvider('voxtral-small-2507', {
          config: { apiKey: 'test-key' },
        });
        vi.mocked(fetchWithCache).mockResolvedValueOnce({
          data: {
            choices: [{ message: { content: 'Audio summary' } }],
            usage: { prompt_tokens: 1000, completion_tokens: 400, prompt_audio_seconds: seconds },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        });
        expect((await voxtral.callApi('Summarize the input')).cost).toBeUndefined();
      },
    );

    // Regression coverage for active aliases and retained historical pricing.
    it.each([
      // [model, input price/M, output price/M, expected cost for 400 in / 600 out]
      // mistral-small-latest -> Mistral Small 4 (mistral-small-2603): $0.15/$0.60
      ['mistral-small-latest', 0.00042],
      // magistral-small-latest -> deprecated Magistral Small 1.2 (2509): $0.50/$1.50
      ['magistral-small-latest', 0.0011],
      // mistral-medium-latest -> Mistral Medium 3.5: $1.50/$7.50
      ['mistral-medium-latest', 0.0051],
      // bare mistral-medium was verified live as a Mistral Medium 3.5 alias: $1.50/$7.50
      ['mistral-medium', 0.0051],
      // version aliases that also resolve to Mistral Medium 3.5
      ['mistral-medium-3-5', 0.0051],
      ['mistral-medium-3.5', 0.0051],
      ['mistral-medium-2604', 0.0051],
      // Leanstral 1.5 is free during its public preview.
      ['labs-leanstral-1-5', 0],
      // Voxtral Small token pricing excludes its separate per-audio-minute charge.
      ['voxtral-small-2507', 0.00028],
      // Mistral Code product aliases resolve to Codestral: $0.30/$0.90
      ['mistral-code-latest', 0.00066],
      // Devstral 2 agent alias: $0.40/$2.00
      ['mistral-code-agent-latest', 0.00136],
      // Z.ai GLM 5.3 hosted by Mistral and its published aliases: $1.40/$4.40
      ['zai-glm-5-3', 0.0032],
      ['zai-glm-5', 0.0032],
      ['zai-glm-latest', 0.0032],
      // Z.ai GLM 5.3 Flash hosted by Mistral: $0.15/$0.50
      ['zai-glm-5-3-flash', 0.00036],
      // DeepSeek V4.1 Flash 1017 hosted by Mistral: $0.30/$1.20
      ['deepseek-v4-1-flash-1017', 0.00084],
      // Mistral Large 4 and its published aliases: $0.70/$2.10
      ['mistral-large-4', 0.00154],
      ['mistral-large-4-0', 0.00154],
      ['mistral-large-latest', 0.00154],
      // Mistral Large 3 keeps its historical price: $0.50/$1.50
      ['mistral-large-2512', 0.0011],
    ])('tracks catalog pricing for %s', async (model, expectedCost) => {
      const provider = new MistralChatCompletionProvider(model);
      vi.spyOn(provider, 'getApiKey').mockReturnValue('fake-api-key');

      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse({
          choices: [{ message: { content: 'ok' } }],
          usage: { total_tokens: 1000, prompt_tokens: 400, completion_tokens: 600 },
        }),
      );

      const result = await provider.callApi('Test alias pricing');
      expect(logger.warn).not.toHaveBeenCalled();
      expect(JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string).model).toBe(
        model,
      );
      expect(result.cost).toBeCloseTo(expectedCost, 6);
    });

    const mockPromptCacheResponse = (cachedTokens: unknown, promptTokens = 1000) =>
      createMockFetchResponse({
        choices: [{ message: { content: 'ok' } }],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: 100,
          total_tokens: promptTokens + 100,
          prompt_tokens_details: { cached_tokens: cachedTokens },
        },
      });

    it.each([
      // [model, expected cost for 1000 prompt tokens (640 cached) and 100 completion tokens]
      // Mistral Large 4: 360 * $0.70 + 640 * $0.07 + 100 * $2.10 per 1M
      ['mistral-large-latest', 0.0005068],
      // GLM 5.3 Flash lists $0.03 cached (20%): 360 * $0.15 + 640 * $0.03 + 100 * $0.50 per 1M
      ['zai-glm-5-3-flash', 0.0001232],
      // DeepSeek V4.1 Flash lists $0.007 cached: 360 * $0.30 + 640 * $0.007 + 100 * $1.20 per 1M
      ['deepseek-v4-1-flash-1017', 0.00023248],
      // No listed cached rate, so 10% of input: 360 * $1.50 + 640 * $0.15 + 100 * $7.50 per 1M
      ['mistral-medium-3-5', 0.001386],
    ])('bills prompt-cache hits at the cached-input rate for %s', async (model, expectedCost) => {
      const cacheProvider = new MistralChatCompletionProvider(model);
      vi.spyOn(cacheProvider, 'getApiKey').mockReturnValue('fake-api-key');
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockPromptCacheResponse(640));

      const result = await cacheProvider.callApi('Test prompt cache billing');

      expect(result.cost).toBeCloseTo(expectedCost, 10);
      expect(result.cached).toBe(false);
      expect(result.tokenUsage).toEqual({
        total: 1100,
        prompt: 1000,
        completion: 100,
        numRequests: 1,
        completionDetails: { cacheReadInputTokens: 640 },
      });
    });

    it.each([
      // cacheReadCost overrides the cached rate: 360 * $0.70 + 640 * $0.50 + 100 * $2.10 per 1M
      [{ cacheReadCost: 0.5 / 1e6 }, 0.000782],
      // An input-price override also prices cached tokens: 1000 * $1 + 100 * $2.10 per 1M
      [{ inputCost: 1 / 1e6 }, 0.00121],
      [{ cost: 0 }, 0],
    ])('applies price overrides to prompt-cache hits: %o', async (overrides, expectedCost) => {
      const cacheProvider = new MistralChatCompletionProvider('mistral-large-4', {
        config: overrides,
      });
      vi.spyOn(cacheProvider, 'getApiKey').mockReturnValue('fake-api-key');
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockPromptCacheResponse(640));

      const result = await cacheProvider.callApi('Test prompt cache overrides');

      expect(result.cost).toBeCloseTo(expectedCost, 10);
    });

    it('caps cached prompt tokens at the reported prompt tokens', async () => {
      const cacheProvider = new MistralChatCompletionProvider('mistral-large-4');
      vi.spyOn(cacheProvider, 'getApiKey').mockReturnValue('fake-api-key');
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockPromptCacheResponse(5000, 128));

      const result = await cacheProvider.callApi('Test prompt cache clamp');

      // 128 * $0.07 + 100 * $2.10 per 1M
      expect(result.cost).toBeCloseTo(0.00021896, 10);
    });

    it.each([0, -64, 1.5, '640', null])(
      'bills all prompt tokens at the input rate when cached_tokens is %s',
      async (cachedTokens) => {
        const cacheProvider = new MistralChatCompletionProvider('mistral-large-4');
        vi.spyOn(cacheProvider, 'getApiKey').mockReturnValue('fake-api-key');
        vi.mocked(fetchWithCache).mockResolvedValueOnce(mockPromptCacheResponse(cachedTokens));

        const result = await cacheProvider.callApi('Test invalid prompt cache usage');

        // 1000 * $0.70 + 100 * $2.10 per 1M
        expect(result.cost).toBeCloseTo(0.00091, 10);
        expect(result.tokenUsage).not.toHaveProperty('completionDetails');
      },
    );

    it.each([
      'mistral-large-4',
      'mistral-large-4-0',
      'mistral-large-latest',
      'zai-glm-5-3',
      'zai-glm-5-3-flash',
    ])('omits the default max_tokens cap for always-reasoning model %s', async (model) => {
      const reasoningProvider = new MistralChatCompletionProvider(model, {
        config: { reasoning_effort: 'low' },
      });
      vi.spyOn(reasoningProvider, 'getApiKey').mockReturnValue('fake-api-key');
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockChatResponse('ok'));

      await reasoningProvider.callApi('Test prompt');

      const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
      expect(body).not.toHaveProperty('max_tokens');
      expect(body).toMatchObject({ model, reasoning_effort: 'low', top_p: 1 });
    });

    it.each([
      'mistral-large-2512',
      'mistral-small-latest',
      'mistral-medium-3-5',
      'deepseek-v4-1-flash-1017',
    ])('keeps the default 1024 max_tokens cap for %s', async (model) => {
      const defaultProvider = new MistralChatCompletionProvider(model);
      vi.spyOn(defaultProvider, 'getApiKey').mockReturnValue('fake-api-key');
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockChatResponse('ok'));

      await defaultProvider.callApi('Test prompt');

      const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
      expect(body.max_tokens).toBe(1024);
    });

    it('sends an explicit max_tokens and Large 4 reasoning effort', async () => {
      const largeProvider = new MistralChatCompletionProvider('mistral-large-4', {
        config: { max_tokens: 8000, reasoning_effort: 'medium' },
      });
      vi.spyOn(largeProvider, 'getApiKey').mockReturnValue('fake-api-key');
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse({
          choices: [
            {
              message: {
                content: [
                  { type: 'thinking', thinking: [{ type: 'text', text: 'Working it out' }] },
                  { type: 'text', text: '391' },
                ],
              },
            },
          ],
          usage: { total_tokens: 1000, prompt_tokens: 400, completion_tokens: 600 },
        }),
      );

      const result = await largeProvider.callApi('What is 17 * 23?');

      const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
      expect(body).toMatchObject({ max_tokens: 8000, reasoning_effort: 'medium' });
      expect(result).toMatchObject({ output: '391', cost: expect.closeTo(0.00154, 8) });
    });

    it('returns an error when Mistral rejects an unsupported reasoning effort', async () => {
      const largeProvider = new MistralChatCompletionProvider('mistral-large-4', {
        config: { reasoning_effort: 'none' },
      });
      vi.spyOn(largeProvider, 'getApiKey').mockReturnValue('fake-api-key');
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: {
          object: 'error',
          message: 'reasoning_effort none is not supported for this model',
          type: 'invalid_request_invalid_args',
          code: '3051',
        },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      });

      const result = await largeProvider.callApi('Test prompt');

      expect(result.output).toBeUndefined();
      expect(result.error).toContain('reasoning_effort none is not supported for this model');
    });

    it('forwards prompt_cache_key in the request body', async () => {
      const provider = new MistralChatCompletionProvider('mistral-large-latest', {
        config: { prompt_cache_key: 'shared-prefix-1' },
      });
      vi.spyOn(provider, 'getApiKey').mockReturnValue('fake-api-key');

      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockChatResponse('ok'));

      await provider.callApi('Test prompt cache key');

      const requestInit = vi.mocked(fetchWithCache).mock.calls[0]?.[1];
      const body = JSON.parse(requestInit?.body as string);
      expect(body.prompt_cache_key).toBe('shared-prefix-1');
    });

    it('should use cache when enabled', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(getCache).mockReturnValue({
        get: vi.fn().mockResolvedValue({
          output: 'Cached output',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
          cost: 0.000005,
        }),
        set: vi.fn(),
        wrap: vi.fn(),
        del: vi.fn(),
        clear: vi.fn(),
        stores: [
          {
            get: vi.fn(),
            set: vi.fn(),
          },
        ] as any,
        mget: vi.fn(),
        mset: vi.fn(),
        mdel: vi.fn(),
        reset: vi.fn(),
        ttl: vi.fn(),
        on: vi.fn(),
        removeAllListeners: vi.fn(),
      } as any);
      const result = await provider.callApi('Test prompt');

      expect(result.cached).toBe(true);
      expect(result).toEqual({
        output: 'Cached output',
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
          cached: 10,
        },
        cached: true,
        cost: 0.000005,
      });
      expect(vi.mocked(fetchWithCache)).not.toHaveBeenCalled();
    });

    it('should hash request params in cache keys', async () => {
      const cacheGet = vi.fn().mockResolvedValue(null);
      const cacheSet = vi.fn();
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(getCache).mockReturnValue({
        get: cacheGet,
        set: cacheSet,
        wrap: vi.fn(),
        del: vi.fn(),
        clear: vi.fn(),
        stores: [
          {
            get: vi.fn(),
            set: vi.fn(),
          },
        ] as any,
        mget: vi.fn(),
        mset: vi.fn(),
        mdel: vi.fn(),
        reset: vi.fn(),
        ttl: vi.fn(),
        on: vi.fn(),
        removeAllListeners: vi.fn(),
      } as any);
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockChatResponse('Fresh output'));

      await provider.callApi('Sensitive prompt sk-mistral-secret');

      const cacheKey = cacheGet.mock.calls[0]?.[0] as string;
      expect(cacheKey).toMatch(
        /^mistral:chat:mistral-tiny:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKey).not.toContain('Sensitive prompt');
      expect(cacheKey).not.toContain('sk-mistral-secret');
      expect(cacheSet).toHaveBeenCalledWith(
        cacheKey,
        expect.objectContaining({ output: 'Fresh output' }),
      );
    });

    it('should isolate hashed cache keys by resolved API key', async () => {
      const cacheGet = vi.fn().mockResolvedValue(null);
      const cacheSet = vi.fn();
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(getCache).mockReturnValue({
        get: cacheGet,
        set: cacheSet,
        wrap: vi.fn(),
        del: vi.fn(),
        clear: vi.fn(),
        stores: [
          {
            get: vi.fn(),
            set: vi.fn(),
          },
        ] as any,
        mget: vi.fn(),
        mset: vi.fn(),
        mdel: vi.fn(),
        reset: vi.fn(),
        ttl: vi.fn(),
        on: vi.fn(),
        removeAllListeners: vi.fn(),
      } as any);
      const providerA = new MistralChatCompletionProvider('mistral-tiny');
      const providerB = new MistralChatCompletionProvider('mistral-tiny');
      vi.spyOn(providerA, 'getApiKey').mockReturnValue('sk-mistral-tenant-a');
      vi.spyOn(providerB, 'getApiKey').mockReturnValue('sk-mistral-tenant-b');
      vi.spyOn(providerA, 'getApiUrl').mockReturnValue('https://shared.mistral.example/v1');
      vi.spyOn(providerB, 'getApiUrl').mockReturnValue('https://shared.mistral.example/v1');
      vi.mocked(fetchWithCache)
        .mockResolvedValueOnce(createMockChatResponse('Tenant A output'))
        .mockResolvedValueOnce(createMockChatResponse('Tenant B output'));

      await providerA.callApi('Shared sensitive prompt');
      await providerB.callApi('Shared sensitive prompt');

      const cacheKeyA = cacheGet.mock.calls[0][0] as string;
      const cacheKeyB = cacheGet.mock.calls[1][0] as string;
      expect(cacheKeyA).toMatch(
        /^mistral:chat:mistral-tiny:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKeyB).toMatch(
        /^mistral:chat:mistral-tiny:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKeyA).not.toBe(cacheKeyB);
      expect(fetchWithCache).toHaveBeenCalledTimes(2);
      for (const cacheKey of [cacheKeyA, cacheKeyB]) {
        expect(cacheKey).not.toContain('Shared sensitive prompt');
        expect(cacheKey).not.toContain('sk-mistral-tenant-a');
        expect(cacheKey).not.toContain('sk-mistral-tenant-b');
        expect(cacheKey).not.toContain('shared.mistral.example');
      }
    });

    it('should keep auth cache identity stable across module reloads', async () => {
      async function getCacheKeyFromFreshModule() {
        vi.resetModules();
        const freshCache = await import('../../src/cache');
        const cacheGet = vi.fn().mockResolvedValue({
          output: 'Cached output',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        });
        vi.mocked(freshCache.isCacheEnabled).mockReturnValue(true);
        vi.mocked(freshCache.getCache).mockReturnValue({
          get: cacheGet,
          set: vi.fn(),
        } as any);
        const { MistralChatCompletionProvider: FreshMistralChatCompletionProvider } = await import(
          '../../src/providers/mistral'
        );
        const freshProvider = new FreshMistralChatCompletionProvider('mistral-tiny', {
          config: {
            apiKey: 'sk-mistral-reload-secret',
            apiBaseUrl: 'https://shared.mistral.example/v1',
          },
        });

        await freshProvider.callApi('Shared sensitive prompt');
        return cacheGet.mock.calls[0][0] as string;
      }

      const firstCacheKey = await getCacheKeyFromFreshModule();
      const secondCacheKey = await getCacheKeyFromFreshModule();

      expect(firstCacheKey).toBe(secondCacheKey);
      expect(firstCacheKey).toMatch(
        /^mistral:chat:mistral-tiny:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(firstCacheKey).not.toContain('sk-mistral-reload-secret');
      expect(firstCacheKey).not.toContain('Shared sensitive prompt');
      expect(firstCacheKey).not.toContain('shared.mistral.example');
    });

    it('should deduplicate in-flight chat requests without using raw fetch cache keys', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Shared output' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      let resolveFetch: (value: any) => void;
      vi.mocked(fetchWithCache).mockReturnValueOnce(
        new Promise<any>((resolve) => {
          resolveFetch = resolve;
        }) as ReturnType<typeof fetchWithCache>,
      );

      const first = provider.callApi('Concurrent sensitive prompt');
      const second = provider.callApi('Concurrent sensitive prompt');

      await Promise.resolve();
      expect(fetchWithCache).toHaveBeenCalledTimes(1);

      resolveFetch!(createMockFetchResponse(mockResponse));

      await expect(Promise.all([first, second])).resolves.toEqual([
        expect.objectContaining({ output: 'Shared output' }),
        expect.objectContaining({ output: 'Shared output' }),
      ]);
    });

    it('should isolate in-flight chat request dedupe by cache namespace', async () => {
      const resolveFetches: Array<(value: any) => void> = [];
      vi.mocked(fetchWithCache)
        .mockReturnValueOnce(
          new Promise<any>((resolve) => {
            resolveFetches.push(resolve);
          }) as ReturnType<typeof fetchWithCache>,
        )
        .mockReturnValueOnce(
          new Promise<any>((resolve) => {
            resolveFetches.push(resolve);
          }) as ReturnType<typeof fetchWithCache>,
        );

      const first = withCacheNamespace('scope-a', () =>
        provider.callApi('Concurrent sensitive prompt'),
      );
      const second = withCacheNamespace('scope-b', () =>
        provider.callApi('Concurrent sensitive prompt'),
      );

      await Promise.resolve();
      expect(fetchWithCache).toHaveBeenCalledTimes(2);

      resolveFetches[0](createMockChatResponse('Scoped output A'));
      resolveFetches[1](createMockChatResponse('Scoped output B'));

      await expect(Promise.all([first, second])).resolves.toEqual([
        expect.objectContaining({ output: 'Scoped output A' }),
        expect.objectContaining({ output: 'Scoped output B' }),
      ]);
    });

    it('should avoid logging prompts and generated outputs in debug metadata', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockChatResponse('Generated secret response'),
      );

      await provider.callApi('Sensitive prompt with sk-mistral-secret');

      const fetchCall = vi.mocked(fetchWithCache).mock.calls[0];
      expect(fetchCall[3]).toBe('json');
      expect(fetchCall[4]).toBe(true);
      expect(fetchCall[1]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-promptfoo-silent': 'true',
          }),
        }),
      );

      const debugLogs = JSON.stringify(vi.mocked(logger.debug).mock.calls);
      expect(debugLogs).not.toContain('Sensitive prompt');
      expect(debugLogs).not.toContain('sk-mistral-secret');
      expect(debugLogs).not.toContain('Generated secret response');
    });

    it('should not use cache when disabled', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Fresh output' } }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      };
      vi.mocked(isCacheEnabled).mockReturnValue(false);
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse(mockResponse));

      const result = await provider.callApi('Test prompt');

      expect(result).toEqual({
        output: 'Fresh output',
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
          numRequests: 1,
        },
        cached: false,
        cost: expect.any(Number),
      });
      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
        expect.stringContaining('/chat/completions'),
        expect.any(Object),
        expect.any(Number),
        'json',
        true,
      );
    });

    it('should handle API errors', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(false);
      const mockError = new Error('API Error');
      vi.mocked(fetchWithCache).mockRejectedValueOnce(mockError);

      const result = await provider.callApi('Test prompt');

      expect(result).toEqual({
        error: 'API call error: Error: API Error',
      });
    });

    it('should use custom API base URL if provided', async () => {
      const customProvider = new MistralChatCompletionProvider('mistral-tiny', {
        config: { apiBaseUrl: 'https://custom.mistral.ai/v1' },
      });
      vi.spyOn(customProvider, 'getApiKey').mockReturnValue('fake-api-key');
      const mockResponse = createChatCompletion('Custom API response');
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse(mockResponse));

      await customProvider.callApi('Test prompt');

      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
        'https://custom.mistral.ai/v1/chat/completions',
        expect.any(Object),
        expect.any(Number),
        'json',
        true,
      );
    });

    it('should use API host if provided', async () => {
      const customProvider = new MistralChatCompletionProvider('mistral-tiny', {
        config: { apiHost: 'custom.mistral.ai' },
      });
      vi.spyOn(customProvider, 'getApiKey').mockReturnValue('fake-api-key');
      const mockResponse = createChatCompletion('Custom API response');
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse(mockResponse));

      await customProvider.callApi('Test prompt');

      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
        'https://custom.mistral.ai/v1/chat/completions',
        expect.any(Object),
        expect.any(Number),
        'json',
        true,
      );
    });

    it('should return tool_calls as output when content is null (tool call response)', async () => {
      const mockToolCalls = [
        {
          id: 'call_123',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"location":"Tokyo"}' },
        },
      ];
      const mockResponse = {
        choices: [{ message: { content: null, tool_calls: mockToolCalls } }],
        usage: { total_tokens: 20, prompt_tokens: 10, completion_tokens: 10 },
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse(mockResponse));

      const result = await provider.callApi('Test prompt');

      expect(result.output).toEqual(mockToolCalls);
      expect(result.error).toBeUndefined();
    });

    it('should return final text from chunked reasoning content', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse({
          choices: [
            {
              message: {
                content: [
                  {
                    type: 'thinking',
                    thinking: [{ type: 'text', text: 'Internal reasoning' }],
                  },
                  { type: 'text', text: 'Final answer' },
                ],
              },
            },
          ],
          usage: { total_tokens: 20, prompt_tokens: 10, completion_tokens: 10 },
        }),
      );

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('Final answer');
    });

    it('should preserve chunk arrays that contain non-reasoning metadata', async () => {
      const content = [
        { type: 'thinking', thinking: [{ type: 'text', text: 'Internal reasoning' }] },
        { type: 'text', text: 'Final answer' },
        { type: 'citation', url: 'https://example.com' },
      ];
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse({
          choices: [{ message: { content } }],
          usage: { total_tokens: 20, prompt_tokens: 10, completion_tokens: 10 },
        }),
      );

      const result = await provider.callApi('Test prompt');

      expect(result.output).toEqual(content);
    });

    it('should preserve all choices in metadata when n returns multiple completions', async () => {
      const choices = [
        { index: 0, message: { content: 'First response' } },
        { index: 1, message: { content: 'Second response' } },
      ];
      vi.mocked(fetchWithCache).mockResolvedValueOnce(
        createMockFetchResponse({
          choices,
          usage: { total_tokens: 30, prompt_tokens: 10, completion_tokens: 20 },
        }),
      );

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('First response');
      expect(result.metadata?.choices).toEqual(choices);
    });

    it('should return full message when both content and tool_calls are present', async () => {
      const mockToolCalls = [
        {
          id: 'call_456',
          type: 'function',
          function: { name: 'search', arguments: '{"query":"test"}' },
        },
      ];
      const mockMessage = {
        content: 'I will search for that.',
        tool_calls: mockToolCalls,
      };
      const mockResponse = {
        choices: [{ message: mockMessage }],
        usage: { total_tokens: 20, prompt_tokens: 10, completion_tokens: 10 },
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse(mockResponse));

      const result = await provider.callApi('Test prompt');

      expect(result.output).toEqual(mockMessage);
      expect(result.error).toBeUndefined();
    });

    it('should return content when tool_calls is an empty array', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Test output', tool_calls: [] } }],
        usage: { total_tokens: 20, prompt_tokens: 10, completion_tokens: 10 },
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse(mockResponse));

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('Test output');
      expect(result.error).toBeUndefined();
    });
  });

  describe('MistralEmbeddingProvider', () => {
    let provider: MistralEmbeddingProvider;

    beforeEach(() => {
      provider = new MistralEmbeddingProvider();
      vi.spyOn(provider, 'getApiKey').mockReturnValue('fake-api-key');
    });

    it('should create a provider with default options', () => {
      expect(provider.modelName).toBe('mistral-embed');
      expect(provider.config).toEqual({});
      expect(provider.id()).toBe('mistral:embedding:mistral-embed');
    });

    it('should honor a custom embedding provider ID without changing the model', () => {
      const customProvider = new MistralEmbeddingProvider({
        id: 'custom-embedding',
        modelName: 'codestral-embed',
      });

      expect(customProvider.id()).toBe('custom-embedding');
      expect(customProvider.modelName).toBe('codestral-embed');
    });

    it('should support non-default embedding models such as codestral-embed', async () => {
      const codestralProvider = new MistralEmbeddingProvider({ modelName: 'codestral-embed' });
      vi.spyOn(codestralProvider, 'getApiKey').mockReturnValue('fake-api-key');
      expect(codestralProvider.modelName).toBe('codestral-embed');
      expect(codestralProvider.id()).toBe('mistral:embedding:codestral-embed');

      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          model: 'codestral-embed',
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          usage: { total_tokens: 1000, prompt_tokens: 1000 },
        }),
      );

      const result = await codestralProvider.callEmbeddingApi('Test code');

      // Request sends the codestral-embed model
      const requestInit = vi.mocked(fetchWithCache).mock.calls[0]?.[1];
      const body = JSON.parse(requestInit?.body as string);
      expect(body.model).toBe('codestral-embed');
      // Codestral Embed input pricing is $0.15/1M: 1000 tokens => 0.00015
      expect(result.cost).toBeCloseTo(0.00015, 6);
    });

    it('should warn on an unknown embedding model', () => {
      const unknownProvider = new MistralEmbeddingProvider({ modelName: 'not-a-real-embed' });
      expect(unknownProvider.modelName).toBe('not-a-real-embed');
      expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
        expect.stringContaining('Using unknown Mistral embedding model'),
      );
    });

    it('should call Mistral Embedding API and return embedding with correct structure', async () => {
      const mockResponse = createMistralEmbeddingResponse();
      vi.mocked(fetchWithCache).mockResolvedValue(createMockFetchResponse(mockResponse));

      const result = await provider.callEmbeddingApi('Test text');

      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
        expect.stringContaining('/embeddings'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-promptfoo-silent': 'true',
            Authorization: expect.stringContaining('Bearer '),
          }),
          body: expect.stringContaining('"input":"Test text"'),
        }),
        expect.any(Number),
        'json',
        true,
      );

      expect(result).toEqual({
        embedding: [0.1, 0.2, 0.3],
        tokenUsage: {
          total: 5,
          prompt: 5,
          completion: 0,
          numRequests: 1,
        },
        cost: expect.closeTo(0.0000005, 0.0000001), // Approximately 5 tokens * 0.1 / 1000000
      });
    });

    it('should surface the API error when the embeddings request is rejected', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(false);
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse(
          { message: 'Unauthorized', request_id: 'req-1' },
          { status: 401, statusText: 'Unauthorized' },
        ),
      );

      const result = await provider.callApi('Test text');

      expect(result.error).toContain('Mistral embeddings API error: 401 Unauthorized');
      expect(result.error).not.toContain('No embedding found');
    });

    it('should use cache for embedding when enabled', async () => {
      const mockResponse = createMistralEmbeddingResponse();
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse(mockResponse, { cached: true }),
      );

      const result = await provider.callEmbeddingApi('Test text');

      expect(result).toEqual({
        embedding: [0.1, 0.2, 0.3],
        tokenUsage: {
          total: 5,
          completion: 0,
          cached: 5,
          numRequests: 1,
        },
        cost: expect.closeTo(0.0000005, 0.0000001),
        cached: true,
      });
      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
        expect.stringContaining('/embeddings'),
        expect.any(Object),
        expect.any(Number),
        'json',
        true,
      );
    });

    it('should not use cache for embedding when disabled', async () => {
      const mockResponse = createMistralEmbeddingResponse();
      vi.mocked(isCacheEnabled).mockReturnValue(false);
      vi.mocked(fetchWithCache).mockResolvedValue(createMockFetchResponse(mockResponse));

      const result = await provider.callEmbeddingApi('Test text');

      expect(result).toEqual({
        embedding: [0.1, 0.2, 0.3],
        tokenUsage: {
          total: 5,
          prompt: 5,
          completion: 0,
          numRequests: 1,
        },
        cost: expect.any(Number),
      });
      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
        expect.stringContaining('/embeddings'),
        expect.any(Object),
        expect.any(Number),
        'json',
        true,
      );
    });

    it('should hash embedding cache keys and avoid logging inputs or embeddings', async () => {
      const cacheGet = vi.fn().mockResolvedValue(null);
      const cacheSet = vi.fn();
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(getCache).mockReturnValue({
        get: cacheGet,
        set: cacheSet,
        wrap: vi.fn(),
        del: vi.fn(),
        clear: vi.fn(),
        stores: [
          {
            get: vi.fn(),
            set: vi.fn(),
          },
        ] as any,
        mget: vi.fn(),
        mset: vi.fn(),
        mdel: vi.fn(),
        reset: vi.fn(),
        ttl: vi.fn(),
        on: vi.fn(),
        removeAllListeners: vi.fn(),
      } as any);
      const mockResponse = createMistralEmbeddingResponse();
      vi.mocked(fetchWithCache).mockResolvedValue(createMockFetchResponse(mockResponse));

      await provider.callEmbeddingApi('Sensitive embedding input sk-mistral-secret');

      const cacheKey = cacheGet.mock.calls[0]?.[0] as string;
      expect(cacheKey).toMatch(
        /^mistral:embedding:mistral-embed:[a-f0-9]{64}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      );
      expect(cacheKey).not.toContain('Sensitive embedding input');
      expect(cacheKey).not.toContain('sk-mistral-secret');
      expect(cacheSet).toHaveBeenCalledWith(cacheKey, mockResponse);
      expect(vi.mocked(fetchWithCache).mock.calls[0][1]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-promptfoo-silent': 'true',
          }),
        }),
      );

      const debugLogs = JSON.stringify(vi.mocked(logger.debug).mock.calls);
      expect(debugLogs).not.toContain('Sensitive embedding input');
      expect(debugLogs).not.toContain('sk-mistral-secret');
      expect(debugLogs).not.toContain('[0.1,0.2,0.3]');
    });

    it('should return cached embeddings from hashed provider cache keys', async () => {
      const cacheGet = vi.fn().mockResolvedValue(createMistralEmbeddingResponse());
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(getCache).mockReturnValue({
        get: cacheGet,
        set: vi.fn(),
        wrap: vi.fn(),
        del: vi.fn(),
        clear: vi.fn(),
        stores: [
          {
            get: vi.fn(),
            set: vi.fn(),
          },
        ] as any,
        mget: vi.fn(),
        mset: vi.fn(),
        mdel: vi.fn(),
        reset: vi.fn(),
        ttl: vi.fn(),
        on: vi.fn(),
        removeAllListeners: vi.fn(),
      } as any);

      const result = await provider.callEmbeddingApi('Cached sensitive input');

      expect(fetchWithCache).not.toHaveBeenCalled();
      expect(result).toEqual({
        embedding: [0.1, 0.2, 0.3],
        tokenUsage: {
          total: 5,
          cached: 5,
          completion: 0,
          numRequests: 1,
        },
        cost: expect.closeTo(0.0000005, 0.0000001),
        cached: true,
      });
      const cacheKey = cacheGet.mock.calls[0]?.[0] as string;
      expect(cacheKey).not.toContain('Cached sensitive input');
    });

    it('should propagate cached embeddings through callApi', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(getCache).mockReturnValue({
        get: vi.fn().mockResolvedValue(createMistralEmbeddingResponse()),
        set: vi.fn(),
        wrap: vi.fn(),
        del: vi.fn(),
        clear: vi.fn(),
        stores: [
          {
            get: vi.fn(),
            set: vi.fn(),
          },
        ] as any,
        mget: vi.fn(),
        mset: vi.fn(),
        mdel: vi.fn(),
        reset: vi.fn(),
        ttl: vi.fn(),
        on: vi.fn(),
        removeAllListeners: vi.fn(),
      } as any);

      const result = await provider.callApi('Cached sensitive input');

      expect(fetchWithCache).not.toHaveBeenCalled();
      expect(result).toEqual({
        output: JSON.stringify([0.1, 0.2, 0.3]),
        tokenUsage: {
          total: 5,
          cached: 5,
          completion: 0,
          numRequests: 1,
        },
        cost: expect.closeTo(0.0000005, 0.0000001),
        cached: true,
      });
    });

    it('should handle API errors', async () => {
      const mockError = new Error('API Error');
      vi.mocked(fetchWithCache).mockRejectedValue(mockError);

      await expect(provider.callEmbeddingApi('Test text')).rejects.toThrow('API Error');
    });

    it('should return provider id and string representation', () => {
      expect(provider.id()).toBe('mistral:embedding:mistral-embed');
      expect(provider.toString()).toBe('[Mistral Embedding Provider mistral-embed]');
    });

    it('should use custom API base URL if provided', async () => {
      const customProvider = new MistralEmbeddingProvider({
        config: { apiBaseUrl: 'https://custom.mistral.ai/v1' },
      });
      vi.spyOn(customProvider, 'getApiKey').mockReturnValue('fake-api-key');
      const mockResponse = createMistralEmbeddingResponse();
      vi.mocked(fetchWithCache).mockResolvedValue(createMockFetchResponse(mockResponse));

      await customProvider.callEmbeddingApi('Test text');

      expect(vi.mocked(fetchWithCache)).toHaveBeenCalledWith(
        'https://custom.mistral.ai/v1/embeddings',
        expect.any(Object),
        expect.any(Number),
        'json',
        true,
      );
    });
  });
});

it('keeps mutable prices independent across model aliases', () => {
  const costs = MistralChatCompletionProvider.MISTRAL_CHAT_MODELS.map(({ cost }) => cost);
  expect(new Set(costs).size).toBe(costs.length);
});
