import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import {
  isBedrockGrokModel,
  isBedrockMantleResponsesModel,
  isBedrockOpenAiResponsesModel,
} from '../../../src/providers/bedrock/mantle';
import {
  BedrockGrokResponsesProvider,
  BedrockOpenAiResponsesProvider,
  createBedrockOpenAiResponsesProvider,
  getBedrockMantleBaseUrl,
} from '../../../src/providers/bedrock/openaiResponses';
import { calculateOpenAIUsageCost } from '../../../src/providers/openai/billing';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';
import { ResponsesProcessor } from '../../../src/providers/responses/processor';
import { readResponsesStream } from '../../../src/providers/responses/stream';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

const GPT_5_6_MODELS = [
  'openai.gpt-5.6-sol',
  'openai.gpt-5.6-terra',
  'openai.gpt-5.6-luna',
] as const;

describe('bedrock openaiResponses helper', () => {
  let restoreEnv: (() => void) | undefined;

  beforeEach(() => {
    vi.mocked(fetchWithCache)
      .mockReset()
      .mockResolvedValue({
        data: {
          id: 'resp_123',
          model: 'xai.grok-4.3',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'hello' }],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
  });

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
    vi.resetAllMocks();
  });

  describe('isBedrockOpenAiResponsesModel', () => {
    it('treats frontier gpt-5.x ids as Responses models', () => {
      for (const modelId of GPT_5_6_MODELS) {
        expect(isBedrockOpenAiResponsesModel(modelId)).toBe(true);
      }
      expect(isBedrockOpenAiResponsesModel('openai.gpt-5.5')).toBe(true);
      expect(isBedrockOpenAiResponsesModel('openai.gpt-5.4')).toBe(true);
    });

    it('excludes open-weight gpt-oss ids (served via InvokeModel)', () => {
      expect(isBedrockOpenAiResponsesModel('openai.gpt-oss-120b-1:0')).toBe(false);
      expect(isBedrockOpenAiResponsesModel('openai.gpt-oss-safeguard-20b')).toBe(false);
    });

    it('excludes non-openai ids', () => {
      expect(isBedrockOpenAiResponsesModel('anthropic.claude-opus-4-8')).toBe(false);
      expect(isBedrockOpenAiResponsesModel('qwen.qwen3-32b-v1:0')).toBe(false);
    });

    it('rejects region/geo-prefixed frontier ids (AWS offers only the bare ids)', () => {
      // AWS's GPT-5.5 / GPT-5.4 model cards mark Geo and Global inference IDs as "Not
      // supported", so a prefixed id is not a real Bedrock model — it must not be routed to the
      // mantle endpoint; it falls through to a clear error instead.
      expect(isBedrockOpenAiResponsesModel('us.openai.gpt-5.5')).toBe(false);
      expect(isBedrockOpenAiResponsesModel('eu.openai.gpt-5.4')).toBe(false);
      expect(isBedrockOpenAiResponsesModel('global.openai.gpt-5.5')).toBe(false);
      expect(isBedrockOpenAiResponsesModel('us.openai.gpt-5.6-sol')).toBe(false);
      // ...and region-prefixed gpt-oss is likewise not a Responses model.
      expect(isBedrockOpenAiResponsesModel('us.openai.gpt-oss-120b')).toBe(false);
    });
  });

  describe('getBedrockMantleBaseUrl', () => {
    it('builds the regional mantle endpoint', () => {
      expect(getBedrockMantleBaseUrl('us-east-2')).toBe(
        'https://bedrock-mantle.us-east-2.api.aws/openai/v1',
      );
      expect(getBedrockMantleBaseUrl('us-west-2')).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/openai/v1',
      );
    });

    it('accepts non-standard but well-formed AWS region shapes', () => {
      expect(getBedrockMantleBaseUrl('us-gov-west-1')).toBe(
        'https://bedrock-mantle.us-gov-west-1.api.aws/openai/v1',
      );
      expect(getBedrockMantleBaseUrl('ap-southeast-4')).toBe(
        'https://bedrock-mantle.ap-southeast-4.api.aws/openai/v1',
      );
    });

    it('rejects a malformed region instead of building a bogus host (defense-in-depth)', () => {
      // A value like `evil.com/x` would otherwise yield host `bedrock-mantle.evil.com`.
      expect(() => getBedrockMantleBaseUrl('evil.com/x')).toThrow(/Invalid AWS region/);
      expect(() => getBedrockMantleBaseUrl('us_east_2')).toThrow(/Invalid AWS region/);
      expect(() => getBedrockMantleBaseUrl('')).toThrow(/Invalid AWS region/);
    });
  });

  describe('createBedrockOpenAiResponsesProvider', () => {
    it('throws a helpful error when no Bedrock API key is configured', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      expect(() => createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {})).toThrow(
        /AWS_BEARER_TOKEN_BEDROCK/,
      );
    });

    it('treats an unresolved {{env.*}} apiKey template as missing (helpful error)', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      // Simulates the env var being unset: the template literal must NOT be sent as a bearer
      // token (which would 401); the user should get the actionable missing-key error.
      expect(() =>
        createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
          config: { apiKey: '{{env.AWS_BEARER_TOKEN_BEDROCK}}' },
        }),
      ).toThrow(/AWS_BEARER_TOKEN_BEDROCK/);
    });

    it('falls back to the env var when apiKey is an unresolved template but the env is set', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'real-key' });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: '{{env.AWS_BEARER_TOKEN_BEDROCK}}' },
      });
      expect((provider.config as any).apiKey).toBe('real-key');
    });

    it('targets the mantle endpoint for the configured region with config.apiKey', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { region: 'us-west-2', apiKey: 'bedrock-key' },
      });
      expect(provider).toBeInstanceOf(OpenAiResponsesProvider);
      expect((provider.config as any).apiBaseUrl).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/openai/v1',
      );
      expect((provider.config as any).apiKey).toBe('bedrock-key');
    });

    it('falls back to AWS_BEARER_TOKEN_BEDROCK and the default region', () => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key',
        AWS_BEDROCK_REGION: undefined,
        AWS_REGION: undefined,
        AWS_DEFAULT_REGION: undefined,
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {});
      expect((provider.config as any).apiBaseUrl).toBe(
        'https://bedrock-mantle.us-east-2.api.aws/openai/v1',
      );
      expect((provider.config as any).apiKey).toBe('env-bedrock-key');
    });

    it.each(GPT_5_6_MODELS)('uses the shared GA default region for %s', (modelId) => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key',
        AWS_BEDROCK_REGION: undefined,
        AWS_REGION: undefined,
        AWS_DEFAULT_REGION: undefined,
      });

      const provider = createBedrockOpenAiResponsesProvider(modelId, {});

      expect((provider.config as any).apiBaseUrl).toBe(
        'https://bedrock-mantle.us-east-2.api.aws/openai/v1',
      );
    });

    it.each([
      ['openai.gpt-5.6-sol', 'us-east-1'],
      ['openai.gpt-5.6-sol', 'us-east-2'],
      ['openai.gpt-5.6-terra', 'us-west-2'],
      ['openai.gpt-5.6-luna', 'us-west-2'],
    ])('accepts the GA region %s / %s', (modelId, region) => {
      const provider = createBedrockOpenAiResponsesProvider(modelId, {
        config: { apiKey: 'bedrock-key', region },
      });

      expect((provider.config as any).apiBaseUrl).toBe(
        `https://bedrock-mantle.${region}.api.aws/openai/v1`,
      );
    });

    it.each([
      ['openai.gpt-5.6-sol', 'us-west-2', 'us-east-1, us-east-2'],
      ['openai.gpt-5.6-terra', 'eu-west-1', 'us-east-1, us-east-2, us-west-2'],
      ['openai.gpt-5.6-luna', 'ap-southeast-2', 'us-east-1, us-east-2, us-west-2'],
    ])('rejects the unsupported GA region %s / %s before auth', (modelId, region, supported) => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });

      expect(() => createBedrockOpenAiResponsesProvider(modelId, { config: { region } })).toThrow(
        `Supported Regions: ${supported}`,
      );
    });

    it('respects an explicit apiBaseUrl override', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiBaseUrl: 'https://example.test/openai/v1' },
      });
      expect((provider.config as any).apiBaseUrl).toBe('https://example.test/openai/v1');
    });

    it('normalizes an explicit apiBaseUrl and does not apply regional availability to custom endpoints', () => {
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.6-sol', {
        config: {
          apiKey: 'bedrock-key',
          apiBaseUrl: 'http://127.0.0.1:15501/openai/v1/',
          region: 'us-west-2',
        },
      });

      expect(provider.getApiUrl()).toBe('http://127.0.0.1:15501/openai/v1');
    });

    it.each([
      'bedrock-mantle.us-east-2.api.aws/openai/v1',
      'file:///tmp/responses',
      'https://user:password@example.test/openai/v1',
      'https://example.test/openai/v1?token=secret',
      'https://example.test/openai/v1#responses',
      'https://',
    ])('rejects malformed or credential-bearing apiBaseUrl %s', (apiBaseUrl) => {
      expect(() =>
        createBedrockOpenAiResponsesProvider('openai.gpt-5.6-sol', {
          config: { apiKey: 'bedrock-key', apiBaseUrl },
        }),
      ).toThrow(/Invalid apiBaseUrl/);
    });

    it('strips the openai. prefix for billing so OpenAI cost rates apply', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {});
      // getBillingModelName is protected; the Bedrock id must resolve to the OpenAI
      // billing key so cost is computed (Bedrock mirrors OpenAI first-party rates).
      expect((provider as any).getBillingModelName({})).toBe('gpt-5.5');
    });

    it.each([
      ...GPT_5_6_MODELS,
      'openai.gpt-5.5',
      'openai.gpt-5.4',
    ])('computes a finite, non-zero cost end-to-end for %s via the OpenAI billing tables', (modelId) => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider(modelId, {});
      const billingModelName = (provider as any).getBillingModelName({});
      // The stripped id must actually resolve in the OpenAI cost map, not just be a string.
      const cost = calculateOpenAIUsageCost(
        billingModelName,
        {},
        {
          input_tokens: 1000,
          output_tokens: 500,
          input_tokens_details: { cache_write_tokens: 0 },
        },
      );
      expect(cost).toBeGreaterThan(0);
      expect(Number.isFinite(cost)).toBe(true);
    });

    it.each([
      ['openai.gpt-5.6-sol', 5, 30],
      ['openai.gpt-5.6-terra', 2.5, 15],
      ['openai.gpt-5.6-luna', 1, 6],
    ])('applies first-party-equivalent cache read/write and output rates to %s', (modelId, input, output) => {
      const provider = createBedrockOpenAiResponsesProvider(modelId, {
        config: { apiKey: 'bedrock-key' },
      });
      const cost = calculateOpenAIUsageCost(
        (provider as any).getBillingModelName({}),
        provider.config,
        {
          input_tokens: 1000,
          output_tokens: 500,
          input_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 },
        },
        { apiUrl: provider.getApiUrl() },
      );

      expect(cost).toBeCloseTo(
        (500 * input + 200 * input * 0.1 + 300 * input * 1.25 + 500 * output) / 1e6,
        12,
      );
    });

    it.each(GPT_5_6_MODELS)('leaves %s cost unset when cache-write usage is missing', (modelId) => {
      const provider = createBedrockOpenAiResponsesProvider(modelId, {
        config: { apiKey: 'bedrock-key' },
      });

      expect(
        calculateOpenAIUsageCost((provider as any).getBillingModelName({}), provider.config, {
          input_tokens: 1000,
          output_tokens: 500,
          input_tokens_details: { cached_tokens: 200 },
        }),
      ).toBeUndefined();
    });

    it.each([
      ['openai.gpt-5.6-sol', 5, 30],
      ['openai.gpt-5.6-terra', 2.5, 15],
      ['openai.gpt-5.6-luna', 1, 6],
    ])('applies the long-context rates without a first-party regional uplift to %s', (modelId, input, output) => {
      const provider = createBedrockOpenAiResponsesProvider(modelId, {
        config: { apiKey: 'bedrock-key', region: 'us-east-1' },
      });
      const cost = calculateOpenAIUsageCost(
        (provider as any).getBillingModelName({}),
        provider.config,
        {
          input_tokens: 300_000,
          output_tokens: 1000,
          input_tokens_details: { cached_tokens: 100_000, cache_write_tokens: 50_000 },
        },
        { apiUrl: provider.getApiUrl() },
      );

      expect(cost).toBeCloseTo(
        (150_000 * input * 2 + 100_000 * input * 0.2 + 50_000 * input * 2.5 + 1000 * output * 1.5) /
          1e6,
        10,
      );
    });

    it.each([
      ...GPT_5_6_MODELS,
      'openai.gpt-5.5',
      'openai.gpt-5.4',
    ])('detects the prefixed frontier id %s as a GPT-5 / reasoning model', (modelId) => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider(modelId, {});
      // Without prefix-stripping these would be false (the id starts with "openai.").
      expect((provider as any).isGPT5Model()).toBe(true);
      expect((provider as any).isReasoningModel()).toBe(true);
      expect((provider as any).supportsTemperature()).toBe(false);
    });

    it('forwards GPT-5.6 cache breakpoints, structured output, tools, and state controls', async () => {
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.6-sol', {
        config: {
          apiKey: 'bedrock-key',
          reasoning: { effort: 'max', context: 'current_turn' },
          verbosity: 'low',
          max_output_tokens: 1024,
          prompt_cache_key: 'support-v1',
          prompt_cache_options: { mode: 'explicit', ttl: '30m' },
          store: false,
          tools: [
            {
              type: 'function',
              function: {
                name: 'lookup_order',
                parameters: { type: 'object', properties: { id: { type: 'string' } } },
              },
            },
          ],
          tool_choice: { type: 'function', function: { name: 'lookup_order' } },
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'answer',
              strict: true,
              schema: {
                type: 'object',
                properties: { result: { type: 'string' } },
                required: ['result'],
                additionalProperties: false,
              },
            },
          },
        } as any,
      });
      const input = [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Stable instructions',
              prompt_cache_breakpoint: { mode: 'explicit' },
            },
            { type: 'input_text', text: 'Look up order 42' },
          ],
        },
      ];

      const { body } = await provider.getOpenAiBody(JSON.stringify(input));

      expect(body).toEqual(
        expect.objectContaining({
          model: 'openai.gpt-5.6-sol',
          input,
          reasoning: { effort: 'max', context: 'current_turn' },
          max_output_tokens: 1024,
          prompt_cache_key: 'support-v1',
          prompt_cache_options: { mode: 'explicit', ttl: '30m' },
          store: false,
          tools: [
            expect.objectContaining({
              type: 'function',
              name: 'lookup_order',
              parameters: expect.any(Object),
            }),
          ],
          tool_choice: { type: 'function', name: 'lookup_order' },
          text: expect.objectContaining({
            verbosity: 'low',
            format: expect.objectContaining({ type: 'json_schema', name: 'answer', strict: true }),
          }),
        }),
      );
      expect(body.tools[0].function).toBeUndefined();
      expect(body.temperature).toBeUndefined();
      expect(body.top_p).toBeUndefined();
    });

    it('sends GPT-5 controls in the request body and preserves the openai. model id', async () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { reasoning_effort: 'high', verbosity: 'low' } as any,
      });

      const { body } = await (provider as any).getOpenAiBody('hello');

      // Real Bedrock model id is sent to the mantle endpoint...
      expect(body.model).toBe('openai.gpt-5.5');
      // ...while GPT-5 capability detection applies: reasoning effort + verbosity are sent,
      // and no temperature default leaks in (reasoning models don't support it).
      expect(body.reasoning).toEqual({ effort: 'high' });
      expect(body.text?.verbosity).toBe('low');
      expect(body.temperature).toBeUndefined();
    });

    it('honors AWS_BEARER_TOKEN_BEDROCK and AWS_REGION supplied via promptfoo env overrides', () => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: undefined,
        AWS_BEDROCK_REGION: undefined,
        AWS_REGION: undefined,
        AWS_DEFAULT_REGION: undefined,
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.4', {
        env: { AWS_BEARER_TOKEN_BEDROCK: 'override-key', AWS_REGION: 'us-west-2' } as any,
      });
      expect((provider.config as any).apiKey).toBe('override-key');
      expect((provider.config as any).apiBaseUrl).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/openai/v1',
      );
    });

    it('pins the mantle endpoint and isolates ambient OpenAI credentials and headers', async () => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key',
        OPENAI_API_HOST: 'unrelated.example.com',
        OPENAI_API_KEY: 'unrelated-openai-key',
        OPENAI_ORGANIZATION: 'unrelated-openai-org',
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { region: 'us-east-2', headers: { 'x-custom-header': 'preserved' } },
      });
      // Base getApiUrl() would prefer OPENAI_API_HOST; the subclass must override that.
      expect(provider.getApiUrl()).toBe('https://bedrock-mantle.us-east-2.api.aws/openai/v1');

      await provider.callApi('hello');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://bedrock-mantle.us-east-2.api.aws/openai/v1/responses',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer env-bedrock-key',
            'Content-Type': 'application/json',
            'x-custom-header': 'preserved',
          },
        }),
        expect.any(Number),
        'json',
        true,
        undefined,
      );
    });

    it('bypasses the persistent fetch cache for frontier calls so bearer-token fingerprints are not stored', async () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.6-terra', {});

      await provider.callApi('hello');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://bedrock-mantle.us-east-2.api.aws/openai/v1/responses',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer env-bedrock-key' }),
        }),
        expect.any(Number),
        'json',
        true,
        undefined,
      );
    });

    it.each(
      GPT_5_6_MODELS,
    )('parses streamed Responses events and usage for %s', async (modelId) => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key',
        OPENAI_API_HOST: 'ambient-openai.invalid',
      });
      const completed = {
        id: 'resp_stream',
        model: modelId,
        output: [
          {
            type: 'reasoning',
            summary: [{ text: 'internal reasoning' }],
            encrypted_content: 'opaque',
          },
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'streamed answer' }],
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          total_tokens: 120,
          input_tokens_details: { cached_tokens: 10, cache_write_tokens: 30 },
          output_tokens_details: { reasoning_tokens: 5 },
        },
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"streamed "}',
          '',
          'event: response.completed',
          `data: ${JSON.stringify({ type: 'response.completed', response: completed })}`,
          '',
          'data: [DONE]',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream', 'x-request-id': 'r1' },
      });
      const provider = createBedrockOpenAiResponsesProvider(modelId, {
        config: { stream: true, reasoning_effort: 'max', include: ['reasoning.encrypted_content'] },
      });

      const result = await provider.callApi('hello');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://bedrock-mantle.us-east-2.api.aws/openai/v1/responses',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer env-bedrock-key' }),
          body: expect.stringContaining(`"model":"${modelId}"`),
        }),
        expect.any(Number),
        'text',
        true,
        undefined,
      );
      expect(result.output).toBe('streamed answer');
      expect(result.output).not.toContain('internal reasoning');
      expect(result.tokenUsage).toEqual({
        total: 120,
        prompt: 100,
        completion: 20,
        numRequests: 1,
        completionDetails: {
          reasoning: 5,
          acceptedPrediction: undefined,
          rejectedPrediction: undefined,
          cacheReadInputTokens: 10,
          cacheCreationInputTokens: 30,
        },
      });
      expect(result.cost).toBeGreaterThan(0);
      expect(result.metadata?.http?.headers).toEqual(
        expect.objectContaining({ 'x-request-id': 'r1' }),
      );
    });

    it('surfaces a streamed Bedrock error without attempting to parse it as SSE', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: JSON.stringify({ error: { code: 'model_not_found', message: 'not enabled' } }),
        cached: false,
        status: 404,
        statusText: 'Not Found',
        headers: { 'content-type': 'application/json' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.6-luna', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toContain('API error: 404 Not Found');
      expect(result.error).toContain('not enabled');
    });

    it.each(
      GPT_5_6_MODELS,
    )('fails closed on a terminal SSE error after partial output for %s', async (modelId) => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"partial answer"}',
          '',
          'event: error',
          'data: {"type":"error","code":"server_error","message":"capacity exhausted"}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider(modelId, {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toContain('OpenAI streaming response error (server_error)');
      expect(result.error).toContain('capacity exhausted');
      expect(result.output).toBeUndefined();
    });

    it.each(
      GPT_5_6_MODELS,
    )('preserves streamed text when a response is incomplete for %s', async (modelId) => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"partial answer"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete',
              model: modelId,
              status: 'incomplete',
              output: [{ id: 'rs_incomplete', type: 'reasoning', summary: [] }],
              usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider(modelId, {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('partial answer');
      expect(result.tokenUsage).toMatchObject({ prompt: 2, completion: 3, total: 5 });
    });

    it.each(
      GPT_5_6_MODELS,
    )('preserves all deltas when an incomplete response contains partial text for %s', async (modelId) => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"partial "}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"answer"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_partial',
              model: modelId,
              status: 'incomplete',
              output: [
                {
                  id: 'msg_incomplete',
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'partial ' }],
                },
              ],
              usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider(modelId, {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('partial answer');
    });

    it.each(
      GPT_5_6_MODELS,
    )('preserves mixed indexed and unindexed deltas in an incomplete response for %s', async (modelId) => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"partial "}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"answer"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_mixed_indices',
              model: modelId,
              status: 'incomplete',
              output: [
                {
                  id: 'msg_incomplete_mixed_indices',
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'partial ' }],
                },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider(modelId, {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('partial answer');
    });

    it('recovers completed output text when an incomplete response contains truncated terminal text', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","output_index":0,"content_index":0,"text":"full answer"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_text_done',
              model: 'openai.gpt-5.5',
              status: 'incomplete',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'partial' }],
                },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('full answer');
    });

    it('recovers a streamed output item omitted from a completed terminal response', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"FIRST"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":1,"content_index":0,"delta":"SECOND"}',
          '',
          'event: response.completed',
          `data: ${JSON.stringify({
            type: 'response.completed',
            response: {
              id: 'resp_completed_missing_item',
              model: 'openai.gpt-5.5',
              status: 'completed',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'FIRST' }],
                },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('FIRST\nSECOND');
    });

    it('preserves finalized text when a completed response redacts an earlier streamed draft', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"unsafe draft that must not survive"}',
          '',
          'event: response.completed',
          `data: ${JSON.stringify({
            type: 'response.completed',
            response: {
              id: 'resp_completed_redacted',
              model: 'openai.gpt-5.5',
              status: 'completed',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'safe final' }],
                },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('safe final');
    });

    it('does not restore filtered streamed text from an incomplete terminal response', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"SECRET OR UNSAFE DRAFT"}',
          '',
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","output_index":0,"content_index":0,"text":"SECRET OR UNSAFE DRAFT"}',
          '',
          'event: response.incomplete',
          'data: {"type":"response.incomplete","response":{"id":"resp_filtered","model":"openai.gpt-5.5","status":"incomplete","incomplete_details":{"reason":"content_filter"},"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"[filtered]"}]}]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('[filtered]');
    });

    it('does not append a streamed draft to a completed terminal refusal', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"SECRET OR UNSAFE DRAFT"}',
          '',
          'event: response.completed',
          'data: {"type":"response.completed","response":{"id":"resp_refused","model":"openai.gpt-5.5","status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"refusal","refusal":"I cannot help with that."}]}]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).not.toContain('SECRET OR UNSAFE DRAFT');
      expect(JSON.stringify(result.raw)).not.toContain('SECRET OR UNSAFE DRAFT');
    });

    it('does not repopulate intentionally empty completed terminal text from a streamed draft', async () => {
      const body = [
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"SECRET OR UNSAFE DRAFT"}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed","response":{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":""}]}]}}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(result.output[0].content[0].text).toBe('');
      expect(JSON.stringify(result.output)).not.toContain('SECRET OR UNSAFE DRAFT');
    });

    it.each([
      { name: 'without content', message: { type: 'message', role: 'assistant', refusal: 'No.' } },
      {
        name: 'with empty content',
        message: { type: 'message', role: 'assistant', content: [], refusal: 'No.' },
      },
    ])('does not recover a streamed draft into a top-level terminal refusal $name', async ({
      message,
    }) => {
      const body = [
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"SECRET OR UNSAFE DRAFT"}',
        '',
        'event: response.completed',
        `data: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', output: [message] } })}`,
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(JSON.stringify(result.output)).not.toContain('SECRET OR UNSAFE DRAFT');
    });

    it.each([
      {
        name: 'failed content-filter error',
        event: 'response.failed',
        response: {
          status: 'failed',
          error: { code: 'content_filter', message: 'blocked' },
          output: [],
        },
      },
      {
        name: 'incomplete safety reason',
        event: 'response.incomplete',
        response: { status: 'incomplete', incomplete_details: { reason: 'safety' }, output: [] },
      },
      {
        name: 'failed safety message',
        event: 'response.failed',
        response: {
          status: 'failed',
          error: { code: 'server_error', message: 'blocked by safety system' },
          output: [],
        },
      },
    ])('does not recover a streamed draft after a $name', async ({ event, response }) => {
      const body = [
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"SECRET OR UNSAFE DRAFT"}',
        '',
        `event: ${event}`,
        `data: ${JSON.stringify({ type: event, response })}`,
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(JSON.stringify(result.output)).not.toContain('SECRET OR UNSAFE DRAFT');
    });

    it('uses finalized output text when a stream ends before its terminal response event', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"unsafe draft"}',
          '',
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","output_index":0,"content_index":0,"text":"safe final"}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('safe final');
    });

    it('drops an unindexed draft once indexed output text is finalized', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"Hel"}',
          '',
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","output_index":0,"content_index":0,"text":"Hello"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_finalized_pending',
              model: 'openai.gpt-5.5',
              status: 'incomplete',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'H' }],
                },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Hello');
    });

    it('drops an unindexed draft once malformed-index output text is finalized', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"Hel"}',
          '',
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","output_index":1000000000,"content_index":0,"text":"Hello"}',
          '',
          'event: response.incomplete',
          'data: {"type":"response.incomplete","response":{"id":"resp_finalized_invalid_pending","model":"openai.gpt-5.5","status":"incomplete","output":[]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Hello');
    });

    it('does not restore superseded indexed drafts when leading unindexed text is present', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"leading "}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":1,"content_index":0,"delta":"UNSAFE DRAFT"}',
          '',
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","output_index":1,"content_index":0,"text":"safe final"}',
          '',
          'event: response.incomplete',
          'data: {"type":"response.incomplete","response":{"id":"resp_finalized_leading","model":"openai.gpt-5.5","status":"incomplete","output":[]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('leading ');
      expect(result.output).toContain('safe final');
      expect(result.output).not.toContain('UNSAFE DRAFT');
    });

    it('honors an empty finalized output-text event that replaces an unsafe draft', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"SECRET OR UNSAFE DRAFT"}',
          '',
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","output_index":0,"content_index":0,"text":""}',
          '',
          'event: response.incomplete',
          'data: {"type":"response.incomplete","response":{"id":"resp_empty_finalized","model":"openai.gpt-5.5","status":"incomplete","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":""}]}]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('');
    });

    it.each([
      { name: 'non-empty', text: 'safe final' },
      { name: 'empty', text: '' },
    ])('ignores a late indexed delta after $name output text is finalized', async ({ text }) => {
      const body = [
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"SECRET OR UNSAFE DRAFT"}',
        '',
        'event: response.output_text.done',
        `data: ${JSON.stringify({ type: 'response.output_text.done', output_index: 0, content_index: 0, text })}`,
        '',
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"LATE UNSAFE TEXT"}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(JSON.stringify(result.output)).not.toContain('SECRET OR UNSAFE DRAFT');
      expect(JSON.stringify(result.output)).not.toContain('LATE UNSAFE TEXT');
      expect(result.output[0].content[0].text).toBe(text);
    });

    it.each([
      false,
      true,
    ])('honors empty finalized unindexed text when a terminal snapshot exists: %s', async (withTerminalSnapshot) => {
      const body = [
        ...(withTerminalSnapshot
          ? [
              'event: response.created',
              'data: {"type":"response.created","response":{"status":"in_progress","output":[]}}',
              '',
            ]
          : []),
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","delta":"SECRET OR UNSAFE DRAFT"}',
        '',
        'event: response.output_text.done',
        'data: {"type":"response.output_text.done","text":""}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(JSON.stringify(result.output)).not.toContain('SECRET OR UNSAFE DRAFT');
    });

    it('treats an unindexed completion after indexed text as finalized', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"safe"}',
          '',
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","text":"safe final"}',
          '',
          'event: response.incomplete',
          'data: {"type":"response.incomplete","response":{"id":"resp_unindexed_done","model":"openai.gpt-5.5","status":"incomplete","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"SECRET OR UNSAFE TERMINAL DRAFT"}]}]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('safe final');
    });

    it.each([
      { name: 'unindexed', index: {} },
      { name: 'malformed-index', index: { output_index: 1_000_000_000, content_index: 0 } },
    ])('honors finalized $name stream text over an incomplete terminal draft', async ({
      index,
    }) => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          `data: ${JSON.stringify({ type: 'response.output_text.delta', ...index, delta: 'SECRET OR UNSAFE DRAFT' })}`,
          '',
          'event: response.output_text.done',
          `data: ${JSON.stringify({ type: 'response.output_text.done', ...index, text: 'SAFE' })}`,
          '',
          'event: response.incomplete',
          'data: {"type":"response.incomplete","response":{"id":"resp_unindexed_final","model":"openai.gpt-5.5","status":"incomplete","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"SECRET OR UNSAFE TERMINAL DRAFT"}]}]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('SAFE');
    });

    it('honors an empty finalized event without a preceding delta', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","output_index":0,"content_index":0,"text":""}',
          '',
          'event: response.incomplete',
          'data: {"type":"response.incomplete","response":{"id":"resp_empty_done","model":"openai.gpt-5.5","status":"incomplete","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"SECRET OR UNSAFE TERMINAL DRAFT"}]}]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('');
    });

    it('prefers the complete streamed delta over a partial in-progress snapshot', async () => {
      const body = [
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"complete text"}',
        '',
        'event: response.in_progress',
        'data: {"type":"response.in_progress","response":{"status":"in_progress","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"complete"}]}]}}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(result.output[0].content[0].text).toBe('complete text');
    });

    it.each([
      {
        name: 'content_part.done',
        initial: { status: 'in_progress', output: [] },
        final: {
          type: 'response.content_part.done',
          output_index: 0,
          content_index: 0,
          part: { type: 'output_text', text: 'safe final' },
        },
      },
      {
        name: 'output_item.done',
        initial: {
          status: 'in_progress',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'S' }],
            },
          ],
        },
        final: {
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'safe final' }],
          },
        },
      },
    ])('honors finalized $name text when a stream ends early', async ({ initial, final }) => {
      const body = [
        'event: response.in_progress',
        `data: ${JSON.stringify({ type: 'response.in_progress', response: initial })}`,
        '',
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"SECRET OR UNSAFE DRAFT"}',
        '',
        `event: ${final.type}`,
        `data: ${JSON.stringify(final)}`,
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(result.output[0].content[0].text).toBe('safe final');
    });

    it.each([
      {
        name: 'content_part.done',
        final: {
          type: 'response.content_part.done',
          output_index: 0,
          content_index: 0,
          part: { type: 'refusal', refusal: 'No.' },
        },
      },
      {
        name: 'output_item.done',
        final: {
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'refusal', refusal: 'No.' }],
          },
        },
      },
    ])('does not recover a streamed draft after a finalized $name refusal', async ({ final }) => {
      const body = [
        'event: response.created',
        'data: {"type":"response.created","response":{"status":"in_progress","output":[]}}',
        '',
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"SECRET OR UNSAFE DRAFT"}',
        '',
        `event: ${final.type}`,
        `data: ${JSON.stringify(final)}`,
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(JSON.stringify(result.output)).not.toContain('SECRET OR UNSAFE DRAFT');
    });

    it('does not recover a streamed draft after a response.refusal.done event', async () => {
      const body = [
        'event: response.created',
        'data: {"type":"response.created","response":{"status":"in_progress","output":[]}}',
        '',
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"SECRET OR UNSAFE DRAFT"}',
        '',
        'event: response.refusal.done',
        'data: {"type":"response.refusal.done","output_index":0,"content_index":0,"refusal":"I cannot help with that."}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(JSON.stringify(result.output)).not.toContain('SECRET OR UNSAFE DRAFT');
    });

    it('drops preceding function calls when reconstructing a finalized refusal', async () => {
      const body = [
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","name":"lookup","arguments":"{}","call_id":"call_1"}}',
        '',
        'event: response.refusal.done',
        'data: {"type":"response.refusal.done","output_index":1,"content_index":0,"refusal":"I cannot help with that."}',
        '',
        'event: response.incomplete',
        'data: {"type":"response.incomplete","response":{"status":"incomplete","output":[{"type":"function_call","name":"lookup","arguments":"{}","call_id":"call_1"}]}}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(result.output).toEqual([
        expect.objectContaining({
          type: 'message',
          content: [
            expect.objectContaining({ type: 'refusal', refusal: 'I cannot help with that.' }),
          ],
        }),
      ]);
    });

    it('preserves a finalized refusal when an incomplete terminal safety response has empty output', async () => {
      const body = [
        'event: response.refusal.done',
        'data: {"type":"response.refusal.done","output_index":0,"content_index":0,"refusal":"I cannot help with that."}',
        '',
        'event: response.incomplete',
        'data: {"type":"response.incomplete","response":{"status":"incomplete","incomplete_details":{"reason":"content_filter"},"output":[]}}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });
      const processor = new ResponsesProcessor({
        modelName: 'test',
        providerType: 'openai',
        functionCallbackHandler: { processCalls: vi.fn() } as any,
        costCalculator: vi.fn(),
      });
      const processed = await processor.processResponseOutput(result, {}, false);

      expect(result.output).toEqual([
        expect.objectContaining({
          content: [
            expect.objectContaining({ type: 'refusal', refusal: 'I cannot help with that.' }),
          ],
        }),
      ]);
      expect(processed.isRefusal).toBe(true);
    });

    it('preserves a finalized message with a top-level refusal field when a stream terminates early', async () => {
      const body = [
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"message","role":"assistant","refusal":"I cannot help with that."}}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });
      const processor = new ResponsesProcessor({
        modelName: 'test',
        providerType: 'openai',
        functionCallbackHandler: { processCalls: vi.fn() } as any,
        costCalculator: vi.fn(),
      });
      const processed = await processor.processResponseOutput(result, {}, false);

      expect(result.output).toEqual([
        expect.objectContaining({ type: 'message', refusal: 'I cannot help with that.' }),
      ]);
      expect(processed.isRefusal).toBe(true);
    });

    it('keeps a completed terminal answer authoritative over an earlier finalized refusal', async () => {
      const body = [
        'event: response.refusal.done',
        'data: {"type":"response.refusal.done","output_index":0,"content_index":0,"refusal":"draft refusal"}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed","response":{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"safe final answer"}]}]}}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(result.output).toEqual([
        expect.objectContaining({
          content: [expect.objectContaining({ type: 'output_text', text: 'safe final answer' })],
        }),
      ]);
    });

    it('preserves preceding assistant messages when reconstructing an indexed refusal', async () => {
      const body = [
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"SAFE CONTEXT"}]}}',
        '',
        'event: response.refusal.done',
        'data: {"type":"response.refusal.done","output_index":1,"content_index":0,"refusal":"I cannot help with that."}',
        '',
        'event: response.incomplete',
        'data: {"type":"response.incomplete","response":{"status":"incomplete","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"SAFE CONTEXT"}]}]}}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(result.output).toEqual([
        expect.objectContaining({ content: [expect.objectContaining({ text: 'SAFE CONTEXT' })] }),
        expect.objectContaining({
          content: [
            expect.objectContaining({ type: 'refusal', refusal: 'I cannot help with that.' }),
          ],
        }),
      ]);
    });

    it('preserves every indexed refusal when a stream ends before its terminal response', async () => {
      const body = [
        'event: response.created',
        'data: {"type":"response.created","response":{"status":"in_progress","output":[]}}',
        '',
        'event: response.refusal.done',
        'data: {"type":"response.refusal.done","output_index":0,"content_index":0,"refusal":"First refusal."}',
        '',
        'event: response.refusal.done',
        'data: {"type":"response.refusal.done","output_index":1,"content_index":0,"refusal":"Second refusal."}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(result.output).toEqual([
        expect.objectContaining({
          content: [expect.objectContaining({ type: 'refusal', refusal: 'First refusal.' })],
        }),
        expect.objectContaining({
          content: [expect.objectContaining({ type: 'refusal', refusal: 'Second refusal.' })],
        }),
      ]);
    });

    it('does not duplicate finalized refusal parts when the completed output item arrives', async () => {
      const body = [
        'event: response.content_part.done',
        'data: {"type":"response.content_part.done","output_index":0,"content_index":0,"part":{"type":"refusal","refusal":"First reason."}}',
        '',
        'event: response.content_part.done',
        'data: {"type":"response.content_part.done","output_index":0,"content_index":1,"part":{"type":"refusal","refusal":"Second reason."}}',
        '',
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"message","role":"assistant","content":[{"type":"refusal","refusal":"First reason."},{"type":"refusal","refusal":"Second reason."}]}}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(result.output).toHaveLength(1);
      expect(result.output[0].content).toEqual([
        expect.objectContaining({ type: 'refusal', refusal: 'First reason.' }),
        expect.objectContaining({ type: 'refusal', refusal: 'Second reason.' }),
      ]);
    });

    it.each([
      true,
      false,
    ])('preserves finalized tool calls when a stream closes early (assistant text: %s)', async (withAssistantText) => {
      const events = [
        'event: response.created',
        'data: {"type":"response.created","response":{"status":"in_progress","output":[]}}',
        '',
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","name":"lookup","arguments":"{}","call_id":"call_1"}}',
        '',
        ...(withAssistantText
          ? [
              'event: response.output_item.done',
              'data: {"type":"response.output_item.done","output_index":1,"item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"done"}]}}',
              '',
            ]
          : []),
      ];

      const result = await readResponsesStream(new Response(events.join('\n')), 'test', {
        debug: vi.fn(),
      });

      expect(result.output[0]).toEqual(
        expect.objectContaining({ type: 'function_call', call_id: 'call_1' }),
      );
      if (withAssistantText) {
        expect(result.output[1]).toEqual(
          expect.objectContaining({ content: [expect.objectContaining({ text: 'done' })] }),
        );
      }
    });

    it('preserves output-index order when a finalized tool call follows assistant text', async () => {
      const body = [
        'event: response.created',
        'data: {"type":"response.created","response":{"status":"in_progress","output":[]}}',
        '',
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"before tool"}]}}',
        '',
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","output_index":1,"item":{"type":"function_call","name":"lookup","arguments":"{}","call_id":"call_1"}}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(result.output).toEqual([
        expect.objectContaining({ content: [expect.objectContaining({ text: 'before tool' })] }),
        expect.objectContaining({ type: 'function_call', call_id: 'call_1' }),
      ]);
    });

    it('does not execute finalized tool calls after an incomplete terminal safety decision', async () => {
      const body = [
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","name":"lookup","arguments":"{}","call_id":"call_1"}}',
        '',
        'event: response.incomplete',
        'data: {"type":"response.incomplete","response":{"status":"incomplete","incomplete_details":{"reason":"content_filter"},"output":[]}}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });
      const processCalls = vi.fn().mockResolvedValue('executed');
      const processor = new ResponsesProcessor({
        modelName: 'test',
        providerType: 'openai',
        functionCallbackHandler: { processCalls } as any,
        costCalculator: vi.fn(),
      });

      await processor.processResponseOutput(result, {}, false);

      expect(result.output).toEqual([]);
      expect(processCalls).not.toHaveBeenCalled();
    });

    it('does not execute tool calls included in an incomplete terminal safety snapshot', async () => {
      const body = [
        'event: response.incomplete',
        'data: {"type":"response.incomplete","response":{"status":"incomplete","incomplete_details":{"reason":"content_filter"},"output":[{"type":"function_call","name":"lookup","arguments":"{\\"q\\":\\"unsafe\\"}","call_id":"call_1"}]}}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });
      const processCalls = vi.fn().mockResolvedValue('executed');
      const processor = new ResponsesProcessor({
        modelName: 'test',
        providerType: 'openai',
        functionCallbackHandler: { processCalls } as any,
        costCalculator: vi.fn(),
      });

      await processor.processResponseOutput(result, {}, false);

      expect(result.output).toEqual([]);
      expect(processCalls).not.toHaveBeenCalled();
    });

    it('does not execute tool calls nested in an incomplete terminal safety message', async () => {
      const body = [
        'event: response.incomplete',
        'data: {"type":"response.incomplete","response":{"status":"incomplete","incomplete_details":{"reason":"content_filter"},"output":[{"type":"message","role":"assistant","content":[{"type":"tool_use","name":"lookup","arguments":"{\\"q\\":\\"unsafe\\"}"}]}]}}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });
      const processCalls = vi.fn().mockResolvedValue('executed');
      const processor = new ResponsesProcessor({
        modelName: 'test',
        providerType: 'openai',
        functionCallbackHandler: { processCalls } as any,
        costCalculator: vi.fn(),
      });

      await processor.processResponseOutput(result, {}, false);

      expect(result.output).toEqual([expect.objectContaining({ content: [] })]);
      expect(processCalls).not.toHaveBeenCalled();
    });

    it('does not execute finalized tool calls when a streamed refusal terminates early', async () => {
      const body = [
        'event: response.created',
        'data: {"type":"response.created","response":{"status":"in_progress","output":[]}}',
        '',
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","name":"dangerous_action","arguments":"{\\"path\\":\\"/tmp/secret\\"}","call_id":"call_1"}}',
        '',
        'event: response.refusal.done',
        'data: {"type":"response.refusal.done","output_index":1,"content_index":0,"refusal":"I cannot help with that"}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });
      const processCalls = vi.fn().mockResolvedValue('executed');
      const processor = new ResponsesProcessor({
        modelName: 'test',
        providerType: 'openai',
        functionCallbackHandler: { processCalls } as any,
        costCalculator: vi.fn(),
      });

      await processor.processResponseOutput(result, {}, false);

      expect(result.output).toEqual([
        expect.objectContaining({
          content: [
            expect.objectContaining({ type: 'refusal', refusal: 'I cannot help with that' }),
          ],
        }),
      ]);
      expect(processCalls).not.toHaveBeenCalled();
    });

    it('prefers finalized tool arguments over an incomplete terminal snapshot', async () => {
      const terminalResponse = {
        status: 'incomplete',
        output: [{ type: 'function_call', name: 'lookup', arguments: '{"q":', call_id: 'call_1' }],
      };
      const body = [
        'event: response.output_item.done',
        `data: ${JSON.stringify({ type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', name: 'lookup', arguments: '{"q":"complete"}', call_id: 'call_1' } })}`,
        '',
        'event: response.incomplete',
        `data: ${JSON.stringify({ type: 'response.incomplete', response: terminalResponse })}`,
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(result.output[0]).toEqual(
        expect.objectContaining({ type: 'function_call', arguments: '{"q":"complete"}' }),
      );
    });

    it('keeps completed terminal tool output authoritative over an earlier finalized item', async () => {
      const body = [
        'event: response.output_item.done',
        `data: ${JSON.stringify({ type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', name: 'lookup', arguments: '{"q":"draft"}', call_id: 'call_1' } })}`,
        '',
        'event: response.completed',
        `data: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', output: [{ type: 'function_call', name: 'lookup', arguments: '{"q":"authoritative"}', call_id: 'call_1' }] } })}`,
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(result.output[0]).toEqual(
        expect.objectContaining({ type: 'function_call', arguments: '{"q":"authoritative"}' }),
      );
    });

    it('does not restore a finalized tool call omitted by an authoritative completed response', async () => {
      const body = [
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","name":"dangerous_action","arguments":"{\\"path\\":\\"/tmp/secret\\"}","call_id":"call_1"}}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed","response":{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Action was not approved."}]}]}}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });
      const processCalls = vi.fn().mockResolvedValue('executed');
      const processor = new ResponsesProcessor({
        modelName: 'test',
        providerType: 'openai',
        functionCallbackHandler: { processCalls } as any,
        costCalculator: vi.fn(),
      });

      await processor.processResponseOutput(result, {}, false);

      expect(result.output).toEqual([
        expect.objectContaining({
          type: 'message',
          content: [expect.objectContaining({ text: 'Action was not approved.' })],
        }),
      ]);
      expect(processCalls).not.toHaveBeenCalled();
    });

    it('preserves finalized tool calls when earlier unindexed text cannot be assigned', async () => {
      const body = [
        'event: response.created',
        'data: {"type":"response.created","response":{"status":"in_progress","output":[]}}',
        '',
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","delta":"leading text"}',
        '',
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","output_index":1,"content_index":0,"delta":" answer"}',
        '',
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","name":"lookup","arguments":"{}","call_id":"call_1"}}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(result.output).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'function_call', call_id: 'call_1' }),
        ]),
      );
    });

    it('bounds aggregate finalized tool and refusal items on a truncated stream', async () => {
      const events = [
        'event: response.created',
        'data: {"type":"response.created","response":{"status":"in_progress","output":[]}}',
        '',
      ];
      for (let index = 0; index < 512; index++) {
        events.push(
          'event: response.output_item.done',
          `data: ${JSON.stringify({ type: 'response.output_item.done', output_index: index, item: { type: 'function_call', name: 'lookup', arguments: '{}', call_id: `call_${index}` } })}`,
          '',
        );
      }
      for (let index = 512; index < 1_025; index++) {
        events.push(
          'event: response.refusal.done',
          `data: ${JSON.stringify({ type: 'response.refusal.done', output_index: index, content_index: 0, refusal: `Refusal ${index}` })}`,
          '',
        );
      }

      const result = await readResponsesStream(new Response(events.join('\n')), 'test', {
        debug: vi.fn(),
      });

      expect(result.output.length).toBeLessThanOrEqual(1_024);
      expect(result.output.every((item: any) => item.type === 'message')).toBe(true);
      expect(result.output.at(-1)).toEqual(expect.objectContaining({ type: 'message' }));
    });

    it('does not execute tool calls when a refusal arrives after the finalized-output key limit', async () => {
      const events = [
        'event: response.created',
        'data: {"type":"response.created","response":{"status":"in_progress","output":[]}}',
        '',
      ];
      for (let outputIndex = 0; outputIndex < 1_024; outputIndex++) {
        events.push(
          'event: response.output_item.done',
          `data: ${JSON.stringify({ type: 'response.output_item.done', output_index: outputIndex, item: { type: 'function_call', name: 'dangerous_action', arguments: '{}', call_id: `call_${outputIndex}` } })}`,
          '',
        );
      }
      events.push(
        'event: response.refusal.done',
        'data: {"type":"response.refusal.done","output_index":1024,"content_index":0,"refusal":"I cannot help with that"}',
        '',
      );

      const result = await readResponsesStream(new Response(events.join('\n')), 'test', {
        debug: vi.fn(),
      });
      const processCalls = vi.fn().mockResolvedValue('executed');
      const processor = new ResponsesProcessor({
        modelName: 'test',
        providerType: 'openai',
        functionCallbackHandler: { processCalls } as any,
        costCalculator: vi.fn(),
      });

      await processor.processResponseOutput(result, {}, false);

      expect(result.output).toEqual([]);
      expect(processCalls).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'object', content: { type: 'output_text', text: 'partial' } },
      { name: 'string', content: 'partial' },
      { name: 'refusal object', content: { type: 'refusal', refusal: 'No.' } },
      { name: 'null', content: null },
      { name: 'null entry', content: [null] },
      { name: 'string entry', content: ['partial'] },
    ])('ignores malformed output_item.done $name content before a valid terminal response', async ({
      content,
    }) => {
      const body = [
        'event: response.output_item.done',
        `data: ${JSON.stringify({ type: 'response.output_item.done', output_index: 0, item: { type: 'message', content } })}`,
        '',
        'event: response.completed',
        'data: {"type":"response.completed","response":{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"valid final answer"}]}]}}',
        '',
      ].join('\n');

      const result = await readResponsesStream(new Response(body), 'test', { debug: vi.fn() });

      expect(result.output[0].content[0].text).toBe('valid final answer');
    });

    it('preserves interleaved output boundaries when a stream ends before its terminal event', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"A"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":1,"content_index":0,"delta":"B"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"C"}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('AC\nB');
    });

    it('replaces an incomplete terminal placeholder with finalized output text', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"Hi"}',
          '',
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","output_index":0,"content_index":0,"text":"Hi"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_placeholder',
              model: 'openai.gpt-5.5',
              status: 'incomplete',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: '[truncated]' }],
                },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Hi');
    });

    it('keeps sparse but bounded streamed indices out of the returned output array', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":1024,"content_index":0,"delta":"hello"}',
          '',
          'event: response.completed',
          'data: {"type":"response.completed","response":{"id":"resp_sparse","model":"openai.gpt-5.5","status":"completed","output":[]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('hello');
      expect((result.raw as any).output).toHaveLength(1);
      expect((result.raw as any).output[0]?.type).toBe('message');
    });

    it('restores out-of-order indexed outputs in output-index order', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":2,"content_index":0,"delta":"THIRD"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":1,"content_index":0,"delta":"SECOND"}',
          '',
          'event: response.incomplete',
          'data: {"type":"response.incomplete","response":{"id":"resp_out_of_order","model":"openai.gpt-5.5","status":"incomplete","output":[]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('SECOND\nTHIRD');
    });

    it('restores missing out-of-order indexed outputs after an existing non-message item', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":2,"content_index":0,"delta":"SECOND"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":1,"content_index":0,"delta":"FIRST"}',
          '',
          'event: response.incomplete',
          'data: {"type":"response.incomplete","response":{"id":"resp_out_of_order_existing","model":"openai.gpt-5.5","status":"incomplete","output":[{"type":"reasoning","summary":[]}]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('FIRST\nSECOND');
    });

    it('preserves every completed output-text item when the terminal output is empty', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","output_index":0,"content_index":0,"text":"FIRST"}',
          '',
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","output_index":1,"content_index":0,"text":"SECOND"}',
          '',
          'event: response.completed',
          'data: {"type":"response.completed","response":{"id":"resp_completed_empty","model":"openai.gpt-5.5","status":"completed","output":[]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('FIRST\nSECOND');
    });

    it('preserves leading unindexed delta order when an incomplete response has no terminal output', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"hello "}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"world"}',
          '',
          'event: response.incomplete',
          'data: {"type":"response.incomplete","response":{"id":"resp_incomplete_empty","model":"openai.gpt-5.5","status":"incomplete","output":[]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('hello world');
    });

    it('prepends a leading unindexed delta to the first partially emitted output item', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"hello "}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"world"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_leading_partial',
              model: 'openai.gpt-5.5',
              status: 'incomplete',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'wor' }],
                },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('hello world');
    });

    it('keeps a leading unindexed prefix with the first of multiple indexed outputs', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"A0"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"A1"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":1,"content_index":0,"delta":"B1"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_leading_interleaved',
              model: 'openai.gpt-5.5',
              status: 'incomplete',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'A' }],
                },
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'B' }],
                },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('A0A1\nB1');
    });

    it('keeps distinct invalidly indexed completed output items', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","output_index":1000000000,"content_index":0,"text":"FIRST"}',
          '',
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","output_index":1000000001,"content_index":0,"text":"SECOND"}',
          '',
          'event: response.incomplete',
          'data: {"type":"response.incomplete","response":{"id":"resp_incomplete_invalid_items","model":"openai.gpt-5.5","status":"incomplete","output":[]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('FIRST\nSECOND');
    });

    it('preserves identical text from distinct invalidly indexed output items', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","output_index":1000000000,"content_index":0,"text":"SAME"}',
          '',
          'event: response.output_text.done',
          'data: {"type":"response.output_text.done","output_index":1000000001,"content_index":0,"text":"SAME"}',
          '',
          'event: response.incomplete',
          'data: {"type":"response.incomplete","response":{"id":"resp_invalid_identical","model":"openai.gpt-5.5","status":"incomplete","output":[]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('SAME\nSAME');
    });

    it('preserves repeated text from distinct streamed indices that collide with non-message items', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"OK"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":1,"content_index":0,"delta":"OK"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_repeated_collision',
              model: 'openai.gpt-5.5',
              status: 'incomplete',
              output: [
                { type: 'reasoning', summary: [] },
                { type: 'reasoning', summary: [] },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('OK\nOK');
    });

    it.each([
      { field: 'content_index', value: 1_000_000_000 },
      { field: 'output_index', value: 100_000_000 },
    ])('safely handles an oversized streamed $field', async ({ field, value }) => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          `data: ${JSON.stringify({
            type: 'response.output_text.delta',
            output_index: 0,
            content_index: 0,
            [field]: value,
            delta: 'safe fallback',
          })}`,
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_oversized_index',
              model: 'openai.gpt-5.5',
              status: 'incomplete',
              output: [{ id: 'reason', type: 'reasoning', summary: [] }],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('safe fallback');
    });

    it('bounds the number of distinct malformed streamed output indices', async () => {
      const malformedEvents = Array.from({ length: 1_100 }, (_, index) => [
        'event: response.output_text.delta',
        `data: ${JSON.stringify({ type: 'response.output_text.delta', output_index: 1_000_000_000 + index, content_index: 0, delta: `item-${index}` })}`,
        '',
      ]).flat();
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          ...malformedEvents,
          'event: response.incomplete',
          'data: {"type":"response.incomplete","response":{"id":"resp_many_invalid","model":"openai.gpt-5.5","status":"incomplete","output":[]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect((result.raw as any).output.length).toBeLessThanOrEqual(1_024);
    });

    it('bounds the aggregate number of distinct valid streamed content keys', async () => {
      const indexedEvents = Array.from({ length: 1_100 }, (_, index) => [
        'event: response.output_text.delta',
        `data: ${JSON.stringify({ type: 'response.output_text.delta', output_index: Math.floor(index / 40), content_index: index % 40, delta: 'x' })}`,
        '',
      ]).flat();
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          ...indexedEvents,
          'event: response.incomplete',
          'data: {"type":"response.incomplete","response":{"id":"resp_many_valid","model":"openai.gpt-5.5","status":"incomplete","output":[]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');
      const contentCount = (result.raw as any).output.reduce(
        (count: number, item: any) =>
          count + (Array.isArray(item.content) ? item.content.length : 0),
        0,
      );

      expect(result.error).toBeUndefined();
      expect(contentCount).toBeLessThanOrEqual(1_024);
    });

    it('does not expand sparse streamed content indices into placeholder objects', async () => {
      const sparseEvents = Array.from({ length: 1_024 }, (_, index) => [
        'event: response.output_text.delta',
        `data: ${JSON.stringify({ type: 'response.output_text.delta', output_index: index, content_index: 1_024, delta: 'x' })}`,
        '',
      ]).flat();
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          ...sparseEvents,
          'event: response.incomplete',
          'data: {"type":"response.incomplete","response":{"id":"resp_sparse_content","model":"openai.gpt-5.5","status":"incomplete","output":[]}}',
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');
      const contentCount = (result.raw as any).output.reduce(
        (count: number, item: any) =>
          count + (Array.isArray(item.content) ? item.content.length : 0),
        0,
      );

      expect(result.error).toBeUndefined();
      expect(contentCount).toBeLessThanOrEqual(1_024);
    });

    it('bounds aggregate streamed output even when all deltas reuse one key', async () => {
      const delta = 'x'.repeat(1_024 * 1_024);
      const body = Array.from({ length: 17 }, () => [
        'event: response.output_text.delta',
        `data: ${JSON.stringify({ type: 'response.output_text.delta', output_index: 0, content_index: 0, delta })}`,
        '',
      ])
        .flat()
        .join('\n');

      await expect(
        readResponsesStream(new Response(body), 'test', { debug: vi.fn() }),
      ).rejects.toThrow(/streaming response exceeded.*output/i);
    });

    it('bounds finalized tool-call arguments on a truncated stream', async () => {
      const argumentsText = 'x'.repeat(17 * 1_024 * 1_024);
      const body = [
        'event: response.output_item.done',
        `data: ${JSON.stringify({ type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', name: 'lookup', arguments: argumentsText, call_id: 'call_1' } })}`,
        '',
      ].join('\n');

      await expect(
        readResponsesStream(new Response(body), 'test', { debug: vi.fn() }),
      ).rejects.toThrow(/streaming response exceeded.*output/i);
    });

    it('bounds finalized tool-call arguments across multiple output items', async () => {
      const argumentsText = 'x'.repeat(2 * 1_024 * 1_024);
      const body = Array.from({ length: 9 }, (_, outputIndex) => [
        'event: response.output_item.done',
        `data: ${JSON.stringify({ type: 'response.output_item.done', output_index: outputIndex, item: { type: 'function_call', name: 'lookup', arguments: argumentsText, call_id: `call_${outputIndex}` } })}`,
        '',
      ])
        .flat()
        .join('\n');

      await expect(
        readResponsesStream(new Response(body), 'test', { debug: vi.fn() }),
      ).rejects.toThrow(/streaming response exceeded.*output/i);
    });

    it('bounds output in a completed terminal response snapshot', async () => {
      const text = 'x'.repeat(17 * 1_024 * 1_024);
      const body = [
        'event: response.completed',
        `data: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] } })}`,
        '',
        '',
      ].join('\n');

      await expect(
        readResponsesStream(new Response(body), 'test', { debug: vi.fn() }),
      ).rejects.toThrow(/streaming response exceeded.*output/i);
    });

    it('bounds reconstructed output across finalized items and an incomplete terminal snapshot', async () => {
      const argumentsText = 'x'.repeat(8 * 1_024 * 1_024);
      const text = 'y'.repeat(9 * 1_024 * 1_024);
      const body = [
        'event: response.output_item.done',
        `data: ${JSON.stringify({ type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', name: 'lookup', arguments: argumentsText, call_id: 'call_1' } })}`,
        '',
        'event: response.incomplete',
        `data: ${JSON.stringify({
          type: 'response.incomplete',
          response: {
            status: 'incomplete',
            output: [
              { type: 'function_call', name: 'lookup', arguments: '{}', call_id: 'call_1' },
              { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
            ],
          },
        })}`,
        '',
        '',
      ].join('\n');

      await expect(
        readResponsesStream(new Response(body), 'test', { debug: vi.fn() }),
      ).rejects.toThrow(/streaming response exceeded.*output/i);
    });

    it('cancels an unterminated SSE event once the buffered-event limit is exceeded', async () => {
      const encoder = new TextEncoder();
      const chunk = `: ${'x'.repeat(1_024 * 1_024)}\n`;
      let cancelled = false;
      let pulls = 0;
      const stream = new ReadableStream({
        pull(controller) {
          pulls++;
          controller.enqueue(encoder.encode(chunk));
          if (pulls === 18) {
            controller.close();
          }
        },
        cancel() {
          cancelled = true;
        },
      });

      await expect(
        readResponsesStream(new Response(stream), 'test', { debug: vi.fn() }),
      ).rejects.toThrow(/streaming response exceeded.*(?:output|event)/i);
      expect(cancelled).toBe(true);
    });

    it('cancels the response stream when finalized tool-call arguments exceed the output limit', async () => {
      const encoder = new TextEncoder();
      const argumentsText = 'x'.repeat(17 * 1_024 * 1_024);
      let cancelled = false;
      const stream = new ReadableStream({
        pull(controller) {
          controller.enqueue(
            encoder.encode(
              `event: response.output_item.done\ndata: ${JSON.stringify({ type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', name: 'lookup', arguments: argumentsText, call_id: 'call_1' } })}\n\n`,
            ),
          );
        },
        cancel() {
          cancelled = true;
        },
      });

      await expect(
        readResponsesStream(new Response(stream), 'test', { debug: vi.fn() }),
      ).rejects.toThrow(/streaming response exceeded.*output/i);
      expect(cancelled).toBe(true);
    });

    it('cancels the response stream when the aggregate output limit is exceeded', async () => {
      const encoder = new TextEncoder();
      const delta = 'x'.repeat(1_024 * 1_024);
      let cancelled = false;
      const stream = new ReadableStream({
        pull(controller) {
          controller.enqueue(
            encoder.encode(
              `event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', output_index: 0, content_index: 0, delta })}\n\n`,
            ),
          );
        },
        cancel() {
          cancelled = true;
        },
      });

      await expect(
        readResponsesStream(new Response(stream), 'test', { debug: vi.fn() }),
      ).rejects.toThrow(/streaming response exceeded.*output/i);
      expect(cancelled).toBe(true);
    });

    it('keeps an oversized indexed delta separate from the preceding output', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"SAFE"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":1000000000,"content_index":0,"delta":"WRONG-ITEM"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_mixed_validity',
              model: 'openai.gpt-5.5',
              status: 'incomplete',
              output: [
                {
                  id: 'msg_safe',
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SAFE' }],
                },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('SAFE\nWRONG-ITEM');
    });

    it('preserves an indexed delta that collides with a non-message terminal item', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"LOST"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_non_message_collision',
              model: 'openai.gpt-5.5',
              status: 'incomplete',
              output: [
                { id: 'reason', type: 'reasoning', summary: [] },
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'KEPT' }],
                },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('KEPT\nLOST');
    });

    it('does not duplicate oversized-index text already present in the terminal output', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"SAFE"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":1000000000,"content_index":0,"delta":"WRONG"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_duplicate_invalid',
              model: 'openai.gpt-5.5',
              status: 'incomplete',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SAFE' }],
                },
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'WRONG' }],
                },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('SAFE\nWRONG');
    });

    it('preserves distinct oversized-index text that is a substring of another output', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"SAFE WRONG SAFE"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":1000000000,"content_index":0,"delta":"WRONG"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_distinct_invalid',
              model: 'openai.gpt-5.5',
              status: 'incomplete',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SAFE WRONG SAFE' }],
                },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('SAFE WRONG SAFE\nWRONG');
    });

    it('preserves unindexed deltas when an incomplete response has multiple text outputs', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"first remainder"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"second remainder"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_unindexed_multiple',
              model: 'openai.gpt-5.5',
              status: 'incomplete',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'first ' }],
                },
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'second ' }],
                },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('first \nsecond \nfirst remaindersecond remainder');
    });

    it('does not duplicate complete unindexed text split across terminal messages', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"ABC"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_unindexed_split',
              model: 'openai.gpt-5.5',
              status: 'incomplete',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'A' }],
                },
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'BC' }],
                },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('A\nBC');
    });

    it('keeps a leading unindexed delta out of a later indexed output', async () => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"FIRST"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":1,"content_index":0,"delta":"SECOND"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_leading_unindexed',
              model: 'openai.gpt-5.5',
              status: 'incomplete',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'F' }],
                },
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'S' }],
                },
              ],
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('FIRST\nSECOND');
    });

    it.each(
      GPT_5_6_MODELS,
    )('preserves interleaved output boundaries in an incomplete response for %s', async (modelId) => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"A1"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":1,"content_index":0,"delta":"B1"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"A2"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_interleaved',
              model: modelId,
              status: 'incomplete',
              output: [
                {
                  id: 'msg_a',
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'A1' }],
                },
                {
                  id: 'msg_b',
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'B1' }],
                },
              ],
              usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider(modelId, {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('A1A2\nB1');
    });

    it.each(
      GPT_5_6_MODELS,
    )('reconstructs missing indexed output content in an incomplete response for %s', async (modelId) => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":1,"content_index":0,"delta":"A1"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":2,"content_index":0,"delta":"B1"}',
          '',
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":1,"content_index":0,"delta":"A2"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_empty_content',
              model: modelId,
              status: 'incomplete',
              output: [{ id: 'reason', type: 'reasoning', summary: [] }],
              usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider(modelId, {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('A1A2\nB1');
    });

    it.each(
      GPT_5_6_MODELS,
    )('reconstructs an output_text item that omits text in an incomplete response for %s', async (modelId) => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"partial answer"}',
          '',
          'event: response.incomplete',
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              id: 'resp_incomplete_missing_text',
              model: modelId,
              status: 'incomplete',
              output: [
                {
                  id: 'msg_missing_text',
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text' }],
                },
              ],
              usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
            },
          })}`,
          '',
        ].join('\n'),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      });
      const provider = createBedrockOpenAiResponsesProvider(modelId, {
        config: { apiKey: 'bedrock-key', stream: true },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('partial answer');
    });

    it('falls back to the base OpenAI URL when constructed directly without apiBaseUrl', () => {
      // The factory always sets config.apiBaseUrl, so the `|| super.getApiUrl()` fallback in the
      // override is only reachable by a direct caller. Exercise it: with no apiBaseUrl, getApiUrl()
      // must delegate to the base provider (never the mantle endpoint).
      restoreEnv = mockProcessEnv({
        OPENAI_API_HOST: undefined,
        OPENAI_BASE_URL: undefined,
        OPENAI_API_BASE_URL: undefined,
      });
      const direct = new BedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'k' },
      });
      expect(direct.getApiUrl()).not.toContain('bedrock-mantle');
      expect(direct.getApiUrl()).toBe(
        new OpenAiResponsesProvider('gpt-5.5', { config: { apiKey: 'k' } }).getApiUrl(),
      );
    });
  });

  describe('xAI Grok (mantle Responses)', () => {
    it('classifies only xai.grok- ids', () => {
      expect(isBedrockGrokModel('xai.grok-4.3')).toBe(true);
      expect(isBedrockGrokModel('xai.other-model')).toBe(false);
      expect(isBedrockGrokModel('openai.gpt-5.5')).toBe(false);
      expect(isBedrockGrokModel('anthropic.claude-opus-4-8')).toBe(false);
    });

    it('isBedrockMantleResponsesModel covers both frontier OpenAI and Grok', () => {
      expect(isBedrockMantleResponsesModel('openai.gpt-5.5')).toBe(true);
      expect(isBedrockMantleResponsesModel('xai.grok-4.3')).toBe(true);
      // gpt-oss (InvokeModel) and ordinary InvokeModel families are not mantle Responses models.
      expect(isBedrockMantleResponsesModel('openai.gpt-oss-120b-1:0')).toBe(false);
      expect(isBedrockMantleResponsesModel('zai.glm-5')).toBe(false);
    });

    it('builds a Grok provider on the us-west-2 mantle endpoint by default', () => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key',
        AWS_BEDROCK_REGION: undefined,
        AWS_REGION: undefined,
        AWS_DEFAULT_REGION: undefined,
      });
      const provider = createBedrockOpenAiResponsesProvider('xai.grok-4.3', {});
      expect(provider).toBeInstanceOf(BedrockGrokResponsesProvider);
      expect((provider.config as any).apiBaseUrl).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/openai/v1',
      );
      expect((provider.config as any).apiKey).toBe('env-bedrock-key');
    });

    it('reuses the missing-key error path', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      expect(() => createBedrockOpenAiResponsesProvider('xai.grok-4.3', {})).toThrow(
        /AWS_BEARER_TOKEN_BEDROCK/,
      );
    });

    it('links Grok missing-key errors to the Grok docs section', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      expect(() => createBedrockOpenAiResponsesProvider('xai.grok-4.3', {})).toThrow(
        'https://www.promptfoo.dev/docs/providers/aws-bedrock/#xai-grok-models',
      );
    });

    it('treats Grok as a reasoning model but does NOT mark it GPT-5', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider('xai.grok-4.3', {});
      // Capability/billing name strips the xai. prefix.
      expect((provider as any).getCapabilityModelName()).toBe('grok-4.3');
      expect((provider as any).isReasoningModel()).toBe(true);
      expect((provider as any).isGPT5Model()).toBe(false);
      expect((provider as any).supportsTemperature()).toBe(true);
    });

    it('omits the inherited temperature default when Grok temperature is not configured', async () => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key',
        OPENAI_TEMPERATURE: undefined,
      });
      const provider = createBedrockOpenAiResponsesProvider('xai.grok-4.3', {
        config: { omitDefaults: false } as any,
      });

      const { body } = await (provider as any).getOpenAiBody('What is 17*23?');

      expect((provider.config as any).omitDefaults).toBe(true);
      expect(body.temperature).toBeUndefined();
    });

    it('forwards reasoning effort, sends the real xai. model id, and preserves explicit temperature', async () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider('xai.grok-4.3', {
        config: { omitDefaults: false, reasoning_effort: 'high', temperature: 0 } as any,
      });
      const { body } = await (provider as any).getOpenAiBody('What is 17*23?');
      expect((provider.config as any).omitDefaults).toBe(true);
      expect(body.model).toBe('xai.grok-4.3');
      expect(body.reasoning).toEqual({ effort: 'high' });
      expect(body.temperature).toBe(0);
      // No GPT-5 verbosity for Grok.
      expect(body.text?.verbosity).toBeUndefined();
    });

    it('preserves explicit top_p when Grok reasoning is active', async () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider('xai.grok-4.3', {
        config: { reasoning_effort: 'high', top_p: 0.8 } as any,
      });

      const { body } = await (provider as any).getOpenAiBody('What is 17*23?');

      expect(body.reasoning).toEqual({ effort: 'high' });
      expect(body.top_p).toBe(0.8);
    });

    it('bypasses the persistent fetch cache so the Bedrock bearer token is not in its identity', async () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider('xai.grok-4.3', {});

      await provider.callApi('hello');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://bedrock-mantle.us-west-2.api.aws/openai/v1/responses',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer env-bedrock-key' }),
        }),
        expect.any(Number),
        'json',
        true,
        undefined,
      );
    });
  });
});
