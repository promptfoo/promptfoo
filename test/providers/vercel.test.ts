import { context as otelContext, propagation, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../src/cache';
import {
  createVercelProvider,
  VercelAiEmbeddingProvider,
  VercelAiProvider,
} from '../../src/providers/vercel';

// Mock the cache module
vi.mock('../../src/cache', async () => ({
  ...(await vi.importActual('../../src/cache')),
  getCache: vi.fn(),
  isCacheEnabled: vi.fn(),
}));

// Mock the ai SDK module
vi.mock('ai', () => {
  const createGatewayMock = vi.fn(() => {
    const gateway = Object.assign(
      vi.fn((modelName: string) => ({ modelName })),
      {
        textEmbeddingModel: vi.fn((modelName: string) => ({ modelName, type: 'embedding' })),
      },
    );
    return gateway;
  });
  return {
    createGateway: createGatewayMock,
    generateText: vi.fn(),
    streamText: vi.fn(),
    generateObject: vi.fn(),
    embed: vi.fn(),
    jsonSchema: vi.fn((schema: unknown) => schema),
  };
});

const testTraceparent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
const testTracerProvider = new NodeTracerProvider();

beforeAll(() => {
  testTracerProvider.register();
});

afterAll(async () => {
  await testTracerProvider.shutdown();
});

function expectActiveEvaluationParent(): void {
  expect(trace.getActiveSpan()?.spanContext()).toMatchObject({
    traceId: '0123456789abcdef0123456789abcdef',
    spanId: '0123456789abcdef',
  });
}

describe('VercelAiProvider', () => {
  let mockCache: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset cache mock
    mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getCache).mockResolvedValue(mockCache as any);
    vi.mocked(isCacheEnabled).mockReturnValue(false);

    // Reset ai module mocks
    const { generateText, streamText, generateObject, embed } = await import('ai');
    vi.mocked(generateText).mockReset();
    vi.mocked(streamText).mockReset();
    vi.mocked(generateObject).mockReset();
    vi.mocked(embed).mockReset();
  });

  describe('constructor', () => {
    it('should create a provider with default options', () => {
      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      expect(provider.modelName).toBe('openai/gpt-4o-mini');
      expect(provider.config).toEqual({});
    });

    it('should create a provider with custom options', () => {
      const provider = new VercelAiProvider('anthropic/claude-sonnet-4.5', {
        config: { temperature: 0.7, maxTokens: 1024 },
      });
      expect(provider.modelName).toBe('anthropic/claude-sonnet-4.5');
      expect(provider.config).toEqual({ temperature: 0.7, maxTokens: 1024 });
    });
  });

  describe('id()', () => {
    it('should return correct provider id', () => {
      const provider = new VercelAiProvider('openai/gpt-4o');
      expect(provider.id()).toBe('vercel:openai/gpt-4o');
    });

    it('should use custom id if provided', () => {
      const provider = new VercelAiProvider('openai/gpt-4o', {
        id: 'custom-vercel-provider',
      });
      expect(provider.id()).toBe('custom-vercel-provider');
    });
  });

  describe('toString()', () => {
    it('should return correct string representation', () => {
      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      expect(provider.toString()).toBe('[Vercel AI Gateway Provider openai/gpt-4o-mini]');
    });
  });

  describe('configuration options', () => {
    it('should store apiKeyEnvar in config', () => {
      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: { apiKeyEnvar: 'MY_CUSTOM_API_KEY' },
      });
      expect(provider.config.apiKeyEnvar).toBe('MY_CUSTOM_API_KEY');
    });

    it('should store headers in config', () => {
      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: { headers: { 'X-Custom-Header': 'test-value' } },
      });
      expect(provider.config.headers).toEqual({ 'X-Custom-Header': 'test-value' });
    });

    it('should store baseUrl in config', () => {
      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: { baseUrl: 'https://custom-gateway.example.com' },
      });
      expect(provider.config.baseUrl).toBe('https://custom-gateway.example.com');
    });

    it('should store all config options together', () => {
      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: {
          apiKey: 'test-key',
          apiKeyEnvar: 'MY_API_KEY',
          baseUrl: 'https://custom.example.com',
          headers: { 'X-Test': 'value' },
          temperature: 0.5,
          maxTokens: 1000,
          topP: 0.9,
          topK: 40,
          frequencyPenalty: 0.1,
          presencePenalty: 0.2,
          stopSequences: ['\n\n'],
          timeout: 30000,
          streaming: true,
          responseSchema: { type: 'object' },
        },
      });
      expect(provider.config).toEqual({
        apiKey: 'test-key',
        apiKeyEnvar: 'MY_API_KEY',
        baseUrl: 'https://custom.example.com',
        headers: { 'X-Test': 'value' },
        temperature: 0.5,
        maxTokens: 1000,
        topP: 0.9,
        topK: 40,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
        stopSequences: ['\n\n'],
        timeout: 30000,
        streaming: true,
        responseSchema: { type: 'object' },
      });
    });
  });

  describe('callApi() - non-streaming', () => {
    it('enables native SDK telemetry without recording content when an eval trace is active', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockImplementationOnce(async () => {
        expectActiveEvaluationParent();
        return {
          text: 'Traced response',
          usage: { inputTokens: 10, outputTokens: 20 },
          finishReason: 'stop',
        } as any;
      });

      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      await provider.callApi('Sensitive prompt', {
        prompt: { raw: 'Sensitive prompt', label: 'test' },
        traceparent: testTraceparent,
        vars: {},
      });

      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          experimental_telemetry: {
            isEnabled: true,
            functionId: 'vercel:openai/gpt-4o-mini',
            recordInputs: false,
            recordOutputs: false,
          },
        }),
      );
    });

    it('keeps a matching active child span instead of flattening the trace hierarchy', async () => {
      const { generateText } = await import('ai');
      const evaluatorContext = propagation.extract(otelContext.active(), {
        traceparent: testTraceparent,
      });
      const activeProviderSpan = trace
        .getTracer('vercel-provider-test')
        .startSpan('active provider span', undefined, evaluatorContext);

      vi.mocked(generateText).mockImplementationOnce(async () => {
        expect(trace.getActiveSpan()?.spanContext().spanId).toBe(
          activeProviderSpan.spanContext().spanId,
        );
        return { text: 'Traced response', usage: {}, finishReason: 'stop' } as any;
      });

      try {
        await otelContext.with(trace.setSpan(evaluatorContext, activeProviderSpan), () =>
          new VercelAiProvider('openai/gpt-4o-mini').callApi('prompt', {
            prompt: { raw: 'prompt', label: 'test' },
            traceparent: testTraceparent,
            vars: {},
          }),
        );
      } finally {
        activeProviderSpan.end();
      }
    });

    it('replaces an unrelated active trace with the explicitly supplied evaluation parent', async () => {
      const { generateText } = await import('ai');
      const unrelatedSpan = trace.getTracer('vercel-provider-test').startSpan('unrelated parent');
      vi.mocked(generateText).mockImplementationOnce(async () => {
        expectActiveEvaluationParent();
        return { text: 'Traced response', usage: {}, finishReason: 'stop' } as any;
      });

      try {
        await otelContext.with(trace.setSpan(otelContext.active(), unrelatedSpan), () =>
          new VercelAiProvider('openai/gpt-4o-mini').callApi('prompt', {
            prompt: { raw: 'prompt', label: 'test' },
            traceparent: testTraceparent,
            vars: {},
          }),
        );
      } finally {
        unrelatedSpan.end();
      }
    });

    it('does not enable native SDK telemetry for untraced calls', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Untraced response',
        usage: {},
        finishReason: 'stop',
      } as any);

      await new VercelAiProvider('openai/gpt-4o-mini').callApi('Hello');

      expect(vi.mocked(generateText).mock.calls[0][0]).not.toHaveProperty('experimental_telemetry');
    });

    it('should return text response', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Hello from GPT-4o!',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        finishReason: 'stop',
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      const result = await provider.callApi('Hello');

      expect(result).toEqual({
        output: 'Hello from GPT-4o!',
        tokenUsage: {
          prompt: 10,
          completion: 20,
          total: 30,
          numRequests: 1,
        },
        finishReason: 'stop',
      });
    });

    it('should include token usage', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Response',
        usage: { inputTokens: 5, outputTokens: 15, totalTokens: 20 },
        finishReason: 'stop',
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o');
      const result = await provider.callApi('Test');

      expect(result.tokenUsage).toEqual({
        prompt: 5,
        completion: 15,
        total: 20,
        numRequests: 1,
      });
    });

    it('should parse JSON chat messages from prompt', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Response to chat',
        usage: { inputTokens: 10, outputTokens: 15 },
        finishReason: 'stop',
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o');
      const chatPrompt = JSON.stringify([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
      ]);
      await provider.callApi(chatPrompt);

      expect(vi.mocked(generateText)).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello!' },
          ],
        }),
      );
    });

    it('should pass config options to generateText', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Response',
        usage: { inputTokens: 5, outputTokens: 10 },
        finishReason: 'stop',
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: {
          temperature: 0.8,
          maxTokens: 500,
          topP: 0.9,
        },
      });
      await provider.callApi('Test');

      expect(vi.mocked(generateText)).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Test' }],
          temperature: 0.8,
          maxOutputTokens: 500,
          topP: 0.9,
        }),
      );
    });

    it('should handle errors gracefully', async () => {
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockRejectedValueOnce(new Error('API rate limit exceeded'));

      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      const result = await provider.callApi('Hello');

      expect(result).toEqual({
        error: 'API call error: API rate limit exceeded',
      });
    });

    it('should handle timeout errors', async () => {
      const { generateText } = await import('ai');
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.mocked(generateText).mockRejectedValueOnce(abortError);

      const provider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: { timeout: 5000 },
      });
      const result = await provider.callApi('Hello');

      expect(result).toEqual({
        error: 'Request timed out after 5000ms',
      });
    });
  });

  describe('callApi() - streaming', () => {
    it('enables native SDK telemetry for traced streaming calls', async () => {
      const { streamText } = await import('ai');
      async function* textStream() {
        expectActiveEvaluationParent();
        yield { type: 'text-delta', text: 'response' };
      }
      vi.mocked(streamText).mockImplementationOnce(() => {
        expectActiveEvaluationParent();
        return {
          fullStream: textStream(),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 2 }),
          finishReason: Promise.resolve('stop'),
        } as any;
      });

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: { streaming: true },
      });
      await provider.callApi('prompt', {
        prompt: { raw: 'prompt', label: 'test' },
        traceparent: testTraceparent,
        vars: {},
      });

      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          experimental_telemetry: {
            isEnabled: true,
            functionId: 'vercel:openai/gpt-4o',
            recordInputs: false,
            recordOutputs: false,
          },
        }),
      );
    });

    it('should handle streaming responses', async () => {
      const { streamText } = await import('ai');

      async function* mockTextStream() {
        yield { type: 'text-delta', text: 'Hello ' };
        yield { type: 'text-delta', text: 'from ' };
        yield { type: 'text-delta', text: 'streaming!' };
      }

      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockTextStream(),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 15, totalTokens: 20 }),
        finishReason: Promise.resolve('stop'),
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: { streaming: true },
      });
      const result = await provider.callApi('Hello');

      expect(result).toEqual({
        output: 'Hello from streaming!',
        tokenUsage: {
          prompt: 5,
          completion: 15,
          total: 20,
          numRequests: 1,
        },
        finishReason: 'stop',
      });
    });

    it('should pass config options to streamText', async () => {
      const { streamText } = await import('ai');

      async function* mockTextStream() {
        yield { type: 'text-delta', text: 'Response' };
      }

      vi.mocked(streamText).mockReturnValueOnce({
        fullStream: mockTextStream(),
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 10 }),
        finishReason: Promise.resolve('stop'),
      } as any);

      const provider = new VercelAiProvider('anthropic/claude-sonnet-4.5', {
        config: {
          streaming: true,
          temperature: 0.5,
          maxTokens: 1000,
        },
      });
      await provider.callApi('Test');

      expect(vi.mocked(streamText)).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Test' }],
          temperature: 0.5,
          maxOutputTokens: 1000,
        }),
      );
    });

    it('should handle streaming errors', async () => {
      const { streamText } = await import('ai');
      vi.mocked(streamText).mockImplementationOnce(() => {
        throw new Error('Stream connection failed');
      });

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: { streaming: true },
      });
      const result = await provider.callApi('Hello');

      expect(result).toEqual({
        error: 'API call error: Stream connection failed',
      });
    });

    it('returns in-band stream errors without caching partial output', async () => {
      const { streamText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      async function* fullStream() {
        yield { type: 'text-delta', text: 'Partial response' };
        yield { type: 'error', error: new Error('Stream failed') };
      }
      vi.mocked(streamText).mockImplementation(() => ({ fullStream: fullStream() }) as any);
      const provider = new VercelAiProvider('fixture/model', { config: { streaming: true } });

      expect(await provider.callApi('Hello')).toEqual({ error: 'API call error: Stream failed' });
      expect(await provider.callApi('Hello')).toEqual({ error: 'API call error: Stream failed' });
      expect(streamText).toHaveBeenCalledTimes(2);
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('cleans up the timeout when stream creation fails before iteration', async () => {
      const setTimer = vi.spyOn(globalThis, 'setTimeout');
      const clearTimer = vi.spyOn(globalThis, 'clearTimeout');
      try {
        const { streamText } = await import('ai');
        vi.mocked(streamText).mockImplementationOnce(() => {
          throw new Error('Fixture failure');
        });
        const provider = new VercelAiProvider('provider/model', {
          config: { streaming: true, timeout: 12345 },
        });
        const result = await provider.callApi('Hello');
        expect(result.error).toBe('API call error: Fixture failure');
        const timerIndex = setTimer.mock.calls.findIndex((call) => call[1] === 12345);
        expect(timerIndex).toBeGreaterThanOrEqual(0);
        expect(clearTimer).toHaveBeenCalledWith(setTimer.mock.results[timerIndex].value);
      } finally {
        setTimer.mockRestore();
        clearTimer.mockRestore();
      }
    });

    it('should handle streaming timeout errors', async () => {
      const { streamText } = await import('ai');
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.mocked(streamText).mockImplementationOnce(() => {
        throw abortError;
      });

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: { streaming: true, timeout: 10000 },
      });
      const result = await provider.callApi('Hello');

      expect(result).toEqual({
        error: 'Request timed out after 10000ms',
      });
    });
  });

  describe('caller cancellation', () => {
    it.each(['text', 'streaming', 'structured'])(
      'cancels %s generation without caching it',
      async (mode) => {
        const { generateText, streamText, generateObject } = await import('ai');
        const controller = new AbortController();
        vi.mocked(isCacheEnabled).mockReturnValue(true);
        const abort = (signal: AbortSignal) => {
          controller.abort();
          expect(signal.aborted).toBe(true);
          signal.throwIfAborted();
        };
        vi.mocked(generateText).mockImplementation(
          async ({ abortSignal }) => abort(abortSignal!) as any,
        );
        vi.mocked(generateObject).mockImplementation(
          async ({ abortSignal }) => abort(abortSignal!) as any,
        );
        vi.mocked(streamText).mockImplementation(
          ({ abortSignal }) =>
            ({
              fullStream: (async function* () {
                controller.abort();
                expect(abortSignal!.aborted).toBe(true);
                yield { type: 'abort' };
              })(),
            }) as any,
        );
        const provider = new VercelAiProvider('fixture/model', {
          config: {
            streaming: mode === 'streaming',
            ...(mode === 'structured' ? { responseSchema: { type: 'object' } } : {}),
          },
        });

        expect(
          await provider.callApi('Hello', undefined, { abortSignal: controller.signal }),
        ).toEqual({
          error: 'Request aborted',
        });
        expect(mockCache.set).not.toHaveBeenCalled();
      },
    );

    it('does not call the SDK or return cached output for a cancelled request', async () => {
      const { generateText } = await import('ai');
      const provider = new VercelAiProvider('fixture/model');
      expect(
        await provider.callApi('Hello', undefined, { abortSignal: AbortSignal.abort() }),
      ).toEqual({
        error: 'Request aborted',
      });
      expect(generateText).not.toHaveBeenCalled();
      expect(mockCache.get).not.toHaveBeenCalled();
    });
  });

  describe('caching', () => {
    it('bypasses legacy generation entries and reuses corrected response entries', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      // Exact key produced before the AI SDK 6 option and usage correction.
      const legacyKey =
        'vercel:fixture/model:66dab383c61060b0301d3774d959f13a43ff2b121d9c9336262d8739ef2fb1ea';
      const entries = new Map([
        [legacyKey, JSON.stringify({ output: 'Old uncapped response', tokenUsage: { total: 99 } })],
      ]);
      mockCache.get.mockImplementation(async (key: string) => entries.get(key));
      mockCache.set.mockImplementation(async (key: string, value: string) => {
        entries.set(key, value);
      });
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Fresh',
        usage: { inputTokens: 7, outputTokens: 1, totalTokens: 8 },
        finishReason: 'length',
      } as any);
      const provider = new VercelAiProvider('fixture/model', {
        config: { apiKey: 'fixture-key', baseUrl: 'https://example.invalid/ai', maxTokens: 1 },
      });
      const fresh = await provider.callApi('cache migration fixture');
      expect(fresh).toMatchObject({
        output: 'Fresh',
        tokenUsage: { prompt: 7, completion: 1, total: 8 },
      });
      expect(fresh.cached).toBeUndefined();
      expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 1 }));
      expect(mockCache.get).not.toHaveBeenCalledWith(legacyKey);
      const cached = await provider.callApi('cache migration fixture');
      expect(cached).toEqual({ ...fresh, cached: true });
      expect(generateText).toHaveBeenCalledTimes(1);
    });

    it('retries cached partial output from failed streams', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      mockCache.get.mockResolvedValue(JSON.stringify({ output: 'Partial', finishReason: 'error' }));
      vi.mocked(generateText).mockResolvedValueOnce({ text: 'Fresh', finishReason: 'stop' } as any);
      const provider = new VercelAiProvider('fixture/model');

      expect(await provider.callApi('Hello')).toMatchObject({
        output: 'Fresh',
        finishReason: 'stop',
      });
      expect(generateText).toHaveBeenCalledTimes(1);
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Fresh'),
      );
    });

    it('does not invoke the SDK for a traced cache hit', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      mockCache.get.mockResolvedValueOnce(JSON.stringify({ output: 'cached response' }));

      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      const result = await provider.callApi('prompt', {
        prompt: { raw: 'prompt', label: 'test' },
        traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        vars: {},
      });

      expect(result).toMatchObject({ output: 'cached response', cached: true });
      expect(generateText).not.toHaveBeenCalled();
    });

    it('should return cached response when available', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      mockCache.get.mockResolvedValueOnce(
        JSON.stringify({
          output: 'Cached response',
          tokenUsage: { prompt: 5, completion: 10, total: 15 },
          finishReason: 'stop',
        }),
      );

      const prompt = 'PFQA_VERCEL_PROMPT_SENTINEL';
      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      const result = await provider.callApi(prompt);

      expect(result).toEqual({
        output: 'Cached response',
        tokenUsage: { prompt: 5, completion: 10, total: 15 },
        finishReason: 'stop',
        cached: true,
      });
      const cacheKey = mockCache.get.mock.calls[0][0] as string;
      expect(cacheKey).toMatch(/^vercel:v2:openai\/gpt-4o-mini:[a-f0-9]{64}$/);
      expect(cacheKey).not.toContain(prompt);
    });

    it('should cache response after successful API call', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Fresh response',
        usage: { inputTokens: 10, outputTokens: 20 },
        finishReason: 'stop',
      } as any);

      const prompt = 'PFQA_VERCEL_PROMPT_SENTINEL';
      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      await provider.callApi(prompt);

      const cacheKey = mockCache.set.mock.calls[0][0] as string;
      expect(cacheKey).toMatch(/^vercel:v2:openai\/gpt-4o-mini:[a-f0-9]{64}$/);
      expect(cacheKey).not.toContain(prompt);
      expect(mockCache.get).toHaveBeenCalledWith(cacheKey);
      expect(mockCache.set).toHaveBeenCalledWith(
        cacheKey,
        expect.stringContaining('Fresh response'),
      );
    });

    it('should include gateway identity in cache keys without leaking secrets', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(generateText).mockResolvedValue({
        text: 'Fresh response',
        usage: { inputTokens: 10, outputTokens: 20 },
        finishReason: 'stop',
      } as any);

      const prompt = 'PFQA_VERCEL_PROMPT_SENTINEL';
      const firstProvider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: {
          apiKey: 'PFQA_VERCEL_API_KEY_A',
          baseUrl: 'https://gateway.example.com/shared',
          headers: { 'X-Tenant': 'PFQA_VERCEL_TENANT_A' },
        },
      });
      const secondProvider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: {
          apiKey: 'PFQA_VERCEL_API_KEY_B',
          baseUrl: 'https://gateway.example.com/shared',
          headers: { 'X-Tenant': 'PFQA_VERCEL_TENANT_B' },
        },
      });

      await firstProvider.callApi(prompt);
      await secondProvider.callApi(prompt);

      const firstKey = mockCache.get.mock.calls[0][0] as string;
      const secondKey = mockCache.get.mock.calls[1][0] as string;

      expect(firstKey).not.toBe(secondKey);
      expect(firstKey).not.toContain(prompt);
      expect(firstKey).not.toContain('PFQA_VERCEL_API_KEY_A');
      expect(firstKey).not.toContain('PFQA_VERCEL_TENANT_A');
      expect(secondKey).not.toContain('PFQA_VERCEL_API_KEY_B');
      expect(secondKey).not.toContain('PFQA_VERCEL_TENANT_B');
    });

    it('should separate cache keys for different gateway header values with the same header names', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(generateText).mockResolvedValue({
        text: 'Fresh response',
        usage: { inputTokens: 10, outputTokens: 20 },
        finishReason: 'stop',
      } as any);

      const prompt = 'PFQA_VERCEL_PROMPT_SENTINEL';
      const firstProvider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: {
          apiKey: 'PFQA_VERCEL_SHARED_API_KEY',
          baseUrl: 'https://gateway.example.com/shared',
          headers: { 'X-Tenant': 'PFQA_VERCEL_TENANT_A' },
        },
      });
      const secondProvider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: {
          apiKey: 'PFQA_VERCEL_SHARED_API_KEY',
          baseUrl: 'https://gateway.example.com/shared',
          headers: { 'X-Tenant': 'PFQA_VERCEL_TENANT_B' },
        },
      });

      await firstProvider.callApi(prompt);
      await secondProvider.callApi(prompt);

      const firstKey = mockCache.get.mock.calls[0][0] as string;
      const secondKey = mockCache.get.mock.calls[1][0] as string;

      expect(firstKey).not.toBe(secondKey);
      expect(firstKey).not.toContain('PFQA_VERCEL_SHARED_API_KEY');
      expect(firstKey).not.toContain('PFQA_VERCEL_TENANT_A');
      expect(secondKey).not.toContain('PFQA_VERCEL_TENANT_B');
    });

    it('should reuse cache keys for equivalent gateway header name casing', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(generateText).mockResolvedValue({
        text: 'Fresh response',
        usage: { inputTokens: 10, outputTokens: 20 },
        finishReason: 'stop',
      } as any);

      const prompt = 'PFQA_VERCEL_PROMPT_SENTINEL';
      const firstProvider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: {
          apiKey: 'PFQA_VERCEL_SHARED_API_KEY',
          baseUrl: 'https://gateway.example.com/shared',
          headers: { 'X-Tenant': 'PFQA_VERCEL_TENANT_A' },
        },
      });
      const secondProvider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: {
          apiKey: 'PFQA_VERCEL_SHARED_API_KEY',
          baseUrl: 'https://gateway.example.com/shared',
          headers: { 'x-tenant': 'PFQA_VERCEL_TENANT_A' },
        },
      });

      await firstProvider.callApi(prompt);
      await secondProvider.callApi(prompt);

      const firstKey = mockCache.get.mock.calls[0][0] as string;
      const secondKey = mockCache.get.mock.calls[1][0] as string;

      expect(firstKey).toBe(secondKey);
      expect(firstKey).not.toContain(prompt);
      expect(firstKey).not.toContain('PFQA_VERCEL_SHARED_API_KEY');
      expect(firstKey).not.toContain('PFQA_VERCEL_TENANT_A');
    });

    it('should separate cache keys when only gateway baseUrl changes', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(generateText).mockResolvedValue({
        text: 'Fresh response',
        usage: { inputTokens: 10, outputTokens: 20 },
        finishReason: 'stop',
      } as any);

      const prompt = 'PFQA_VERCEL_PROMPT_SENTINEL';
      const firstProvider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: {
          apiKey: 'PFQA_VERCEL_SHARED_API_KEY',
          baseUrl: 'https://gateway-a.example.com',
          headers: { 'X-Tenant': 'PFQA_VERCEL_SHARED_TENANT' },
        },
      });
      const secondProvider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: {
          apiKey: 'PFQA_VERCEL_SHARED_API_KEY',
          baseUrl: 'https://gateway-b.example.com',
          headers: { 'X-Tenant': 'PFQA_VERCEL_SHARED_TENANT' },
        },
      });

      await firstProvider.callApi(prompt);
      await secondProvider.callApi(prompt);

      const firstKey = mockCache.get.mock.calls[0][0] as string;
      const secondKey = mockCache.get.mock.calls[1][0] as string;

      expect(firstKey).not.toBe(secondKey);
      expect(firstKey).not.toContain(prompt);
      expect(firstKey).not.toContain('PFQA_VERCEL_SHARED_API_KEY');
      expect(firstKey).not.toContain('PFQA_VERCEL_SHARED_TENANT');
      expect(firstKey).not.toContain('gateway-a.example.com');
      expect(secondKey).not.toContain('gateway-b.example.com');
    });

    it('should reuse cache keys when the same API key resolves from different sources', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(generateText).mockResolvedValue({
        text: 'Fresh response',
        usage: { inputTokens: 10, outputTokens: 20 },
        finishReason: 'stop',
      } as any);

      const prompt = 'PFQA_VERCEL_PROMPT_SENTINEL';
      const firstProvider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: {
          apiKey: 'PFQA_VERCEL_SHARED_API_KEY',
          baseUrl: 'https://gateway.example.com/shared',
        },
      });
      const secondProvider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: {
          apiKeyEnvar: 'PFQA_VERCEL_CUSTOM_KEY',
          baseUrl: 'https://gateway.example.com/shared',
        },
        env: { PFQA_VERCEL_CUSTOM_KEY: 'PFQA_VERCEL_SHARED_API_KEY' } as any,
      });

      await firstProvider.callApi(prompt);
      await secondProvider.callApi(prompt);

      const firstKey = mockCache.get.mock.calls[0][0] as string;
      const secondKey = mockCache.get.mock.calls[1][0] as string;

      expect(firstKey).toBe(secondKey);
      expect(firstKey).not.toContain(prompt);
      expect(firstKey).not.toContain('PFQA_VERCEL_SHARED_API_KEY');
    });

    it('should reuse cache keys when optional config auth fields are undefined', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(generateText).mockResolvedValue({
        text: 'Fresh response',
        usage: { inputTokens: 10, outputTokens: 20 },
        finishReason: 'stop',
      } as any);

      const env = { VERCEL_AI_GATEWAY_API_KEY: 'PFQA_VERCEL_ENV_API_KEY' };
      const firstProvider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: {
          apiKey: undefined,
          apiKeyEnvar: undefined,
        },
        env,
      });
      const secondProvider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: {},
        env,
      });

      await firstProvider.callApi('PFQA_VERCEL_PROMPT_SENTINEL');
      await secondProvider.callApi('PFQA_VERCEL_PROMPT_SENTINEL');

      const firstKey = mockCache.get.mock.calls[0][0] as string;
      const secondKey = mockCache.get.mock.calls[1][0] as string;

      expect(firstKey).toBe(secondKey);
      expect(firstKey).not.toContain('PFQA_VERCEL_ENV_API_KEY');
    });

    it('should separate cache keys for custom env var API key values without leaking them', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(generateText).mockResolvedValue({
        text: 'Fresh response',
        usage: { inputTokens: 10, outputTokens: 20 },
        finishReason: 'stop',
      } as any);

      const firstProvider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: { apiKeyEnvar: 'PFQA_VERCEL_CUSTOM_KEY' },
        env: { PFQA_VERCEL_CUSTOM_KEY: 'PFQA_VERCEL_CUSTOM_KEY_A' } as any,
      });
      const secondProvider = new VercelAiProvider('openai/gpt-4o-mini', {
        config: { apiKeyEnvar: 'PFQA_VERCEL_CUSTOM_KEY' },
        env: { PFQA_VERCEL_CUSTOM_KEY: 'PFQA_VERCEL_CUSTOM_KEY_B' } as any,
      });

      await firstProvider.callApi('PFQA_VERCEL_PROMPT_SENTINEL');
      await secondProvider.callApi('PFQA_VERCEL_PROMPT_SENTINEL');

      const firstKey = mockCache.get.mock.calls[0][0] as string;
      const secondKey = mockCache.get.mock.calls[1][0] as string;

      expect(firstKey).not.toBe(secondKey);
      expect(firstKey).not.toContain('PFQA_VERCEL_CUSTOM_KEY_A');
      expect(secondKey).not.toContain('PFQA_VERCEL_CUSTOM_KEY_B');
    });

    it('should not cache error responses', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(generateText).mockRejectedValueOnce(new Error('API error'));

      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      await provider.callApi('Hello');

      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should bypass cache when bustCache is true', async () => {
      const { generateText } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      mockCache.get.mockResolvedValueOnce(
        JSON.stringify({
          output: 'Cached response',
        }),
      );
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Fresh response',
        usage: { inputTokens: 10, outputTokens: 20 },
        finishReason: 'stop',
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o-mini');
      const result = await provider.callApi('Hello', { bustCache: true } as any);

      expect(result.output).toBe('Fresh response');
      expect(result.cached).toBeUndefined();
    });
  });

  describe('callApi() - structured output', () => {
    it('enables native SDK telemetry for traced structured output calls', async () => {
      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockImplementationOnce(async () => {
        expectActiveEvaluationParent();
        return {
          object: { value: 'result' },
          usage: { inputTokens: 1, outputTokens: 2 },
          finishReason: 'stop',
        } as any;
      });

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: { responseSchema: { type: 'object' } },
      });
      await provider.callApi('prompt', {
        prompt: { raw: 'prompt', label: 'test' },
        traceparent: testTraceparent,
        vars: {},
      });

      expect(generateObject).toHaveBeenCalledWith(
        expect.objectContaining({
          experimental_telemetry: expect.objectContaining({
            isEnabled: true,
            recordInputs: false,
            recordOutputs: false,
          }),
        }),
      );
    });

    it('should return object response with schema', async () => {
      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: { sentiment: 'positive', confidence: 0.95 },
        usage: { inputTokens: 15, outputTokens: 25, totalTokens: 40 },
        finishReason: 'stop',
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: {
          responseSchema: {
            type: 'object',
            properties: {
              sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
              confidence: { type: 'number' },
            },
            required: ['sentiment', 'confidence'],
          },
        },
      });
      const result = await provider.callApi('Analyze this text');

      expect(result).toEqual({
        output: { sentiment: 'positive', confidence: 0.95 },
        tokenUsage: {
          prompt: 15,
          completion: 25,
          total: 40,
          numRequests: 1,
        },
        finishReason: 'stop',
      });
    });

    it('should pass schema to generateObject', async () => {
      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: { name: 'Test', value: 42 },
        usage: { inputTokens: 10, outputTokens: 20 },
        finishReason: 'stop',
      } as any);

      const testSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'number' },
        },
      };

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: {
          responseSchema: testSchema,
          temperature: 0.5,
          maxTokens: 48,
        },
      });
      await provider.callApi('Generate data');

      expect(vi.mocked(generateObject)).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Generate data' }],
          // OpenAI requires additionalProperties: false, so provider auto-adds it
          schema: { ...testSchema, additionalProperties: false },
          temperature: 0.5,
          maxOutputTokens: 48,
        }),
      );
    });

    it('should handle structured output errors', async () => {
      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockRejectedValueOnce(new Error('Schema validation failed'));

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: {
          responseSchema: {
            type: 'object',
            properties: { data: { type: 'string' } },
          },
        },
      });
      const result = await provider.callApi('Generate data');

      expect(result).toEqual({
        error: 'API call error: Schema validation failed',
      });
    });

    it('should handle structured output timeout errors', async () => {
      const { generateObject } = await import('ai');
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.mocked(generateObject).mockRejectedValueOnce(abortError);

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: {
          responseSchema: { type: 'object', properties: {} },
          timeout: 8000,
        },
      });
      const result = await provider.callApi('Generate data');

      expect(result).toEqual({
        error: 'Request timed out after 8000ms',
      });
    });

    it('should prioritize structured output over streaming', async () => {
      const { generateObject, streamText } = await import('ai');
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: { result: 'structured' },
        usage: { inputTokens: 10, outputTokens: 15 },
        finishReason: 'stop',
      } as any);

      const provider = new VercelAiProvider('openai/gpt-4o', {
        config: {
          streaming: true,
          responseSchema: { type: 'object', properties: { result: { type: 'string' } } },
        },
      });
      const result = await provider.callApi('Test');

      expect(vi.mocked(generateObject)).toHaveBeenCalled();
      expect(vi.mocked(streamText)).not.toHaveBeenCalled();
      expect(result.output).toEqual({ result: 'structured' });
    });
  });
});

describe('VercelAiEmbeddingProvider', () => {
  let mockCache: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getCache).mockResolvedValue(mockCache as any);
    vi.mocked(isCacheEnabled).mockReturnValue(false);

    const { embed } = await import('ai');
    vi.mocked(embed).mockReset();
  });

  describe('constructor', () => {
    it('should create a provider with default options', () => {
      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      expect(provider.modelName).toBe('openai/text-embedding-3-small');
      expect(provider.config).toEqual({});
    });
  });

  describe('id()', () => {
    it('should return correct provider id', () => {
      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      expect(provider.id()).toBe('vercel:embedding:openai/text-embedding-3-small');
    });
  });

  describe('toString()', () => {
    it('should return correct string representation', () => {
      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      expect(provider.toString()).toBe(
        '[Vercel AI Gateway Embedding Provider openai/text-embedding-3-small]',
      );
    });
  });

  describe('callApi()', () => {
    it('should return error for callApi on embedding provider', async () => {
      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      const result = await provider.callApi('test');

      expect(result).toEqual({
        error: 'Use callEmbeddingApi for embedding models',
      });
    });
  });

  describe('callEmbeddingApi()', () => {
    it('enables native SDK telemetry for traced embedding calls', async () => {
      const { embed } = await import('ai');
      vi.mocked(embed).mockImplementationOnce(async () => {
        expectActiveEvaluationParent();
        return {
          embedding: [0.1, 0.2],
          usage: { tokens: 2 },
        } as any;
      });

      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      await provider.callEmbeddingApi('prompt', {
        prompt: { raw: 'prompt', label: 'test' },
        traceparent: testTraceparent,
        vars: {},
      });

      expect(embed).toHaveBeenCalledWith(
        expect.objectContaining({
          experimental_telemetry: {
            isEnabled: true,
            functionId: 'vercel:embedding:openai/text-embedding-3-small',
            recordInputs: false,
            recordOutputs: false,
          },
        }),
      );
    });

    it('should return embedding vector', async () => {
      const { embed } = await import('ai');
      vi.mocked(embed).mockResolvedValueOnce({
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
        usage: { tokens: 10 },
      } as any);

      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      const result = await provider.callEmbeddingApi('Test text');

      expect(result).toEqual({
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
        tokenUsage: {
          total: 10,
        },
      });
    });

    it('should handle API errors', async () => {
      const { embed } = await import('ai');
      vi.mocked(embed).mockRejectedValueOnce(new Error('Embedding API error'));

      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      const result = await provider.callEmbeddingApi('Test text');

      expect(result).toEqual({
        error: 'API call error: Embedding API error',
      });
    });

    it('should cache embedding responses', async () => {
      const { embed } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(embed).mockResolvedValueOnce({
        embedding: [0.1, 0.2, 0.3],
        usage: { tokens: 5 },
      } as any);

      const input = 'PFQA_VERCEL_EMBEDDING_INPUT_SENTINEL';
      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      await provider.callEmbeddingApi(input);

      const cacheKey = mockCache.set.mock.calls[0][0] as string;
      expect(cacheKey).toMatch(/^vercel:embedding:openai\/text-embedding-3-small:[a-f0-9]{64}$/);
      expect(cacheKey).not.toContain(input);
      expect(mockCache.get).toHaveBeenCalledWith(cacheKey);
      expect(mockCache.set).toHaveBeenCalledWith(cacheKey, expect.any(String));
    });

    it('should include gateway identity in embedding cache keys without leaking secrets', async () => {
      const { embed } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(embed).mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
        usage: { tokens: 5 },
      } as any);

      const input = 'PFQA_VERCEL_EMBEDDING_INPUT_SENTINEL';
      const firstProvider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small', {
        config: {
          apiKey: 'PFQA_VERCEL_EMBEDDING_API_KEY_A',
          baseUrl: 'https://gateway.example.com/shared',
          headers: { 'X-Tenant': 'PFQA_VERCEL_EMBEDDING_TENANT_A' },
        },
      });
      const secondProvider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small', {
        config: {
          apiKey: 'PFQA_VERCEL_EMBEDDING_API_KEY_B',
          baseUrl: 'https://gateway.example.com/shared',
          headers: { 'X-Tenant': 'PFQA_VERCEL_EMBEDDING_TENANT_B' },
        },
      });

      await firstProvider.callEmbeddingApi(input);
      await secondProvider.callEmbeddingApi(input);

      const firstKey = mockCache.get.mock.calls[0][0] as string;
      const secondKey = mockCache.get.mock.calls[1][0] as string;

      expect(firstKey).not.toBe(secondKey);
      expect(firstKey).not.toContain(input);
      expect(firstKey).not.toContain('PFQA_VERCEL_EMBEDDING_API_KEY_A');
      expect(firstKey).not.toContain('PFQA_VERCEL_EMBEDDING_TENANT_A');
      expect(secondKey).not.toContain('PFQA_VERCEL_EMBEDDING_API_KEY_B');
      expect(secondKey).not.toContain('PFQA_VERCEL_EMBEDDING_TENANT_B');
    });

    it('should separate embedding cache keys when only gateway baseUrl changes', async () => {
      const { embed } = await import('ai');
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      vi.mocked(embed).mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
        usage: { tokens: 5 },
      } as any);

      const input = 'PFQA_VERCEL_EMBEDDING_INPUT_SENTINEL';
      const firstProvider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small', {
        config: {
          apiKey: 'PFQA_VERCEL_EMBEDDING_SHARED_API_KEY',
          baseUrl: 'https://gateway-a.example.com',
          headers: { 'X-Tenant': 'PFQA_VERCEL_EMBEDDING_SHARED_TENANT' },
        },
      });
      const secondProvider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small', {
        config: {
          apiKey: 'PFQA_VERCEL_EMBEDDING_SHARED_API_KEY',
          baseUrl: 'https://gateway-b.example.com',
          headers: { 'X-Tenant': 'PFQA_VERCEL_EMBEDDING_SHARED_TENANT' },
        },
      });

      await firstProvider.callEmbeddingApi(input);
      await secondProvider.callEmbeddingApi(input);

      const firstKey = mockCache.get.mock.calls[0][0] as string;
      const secondKey = mockCache.get.mock.calls[1][0] as string;

      expect(firstKey).not.toBe(secondKey);
      expect(firstKey).not.toContain(input);
      expect(firstKey).not.toContain('PFQA_VERCEL_EMBEDDING_SHARED_API_KEY');
      expect(firstKey).not.toContain('PFQA_VERCEL_EMBEDDING_SHARED_TENANT');
      expect(firstKey).not.toContain('gateway-a.example.com');
      expect(secondKey).not.toContain('gateway-b.example.com');
    });

    it('should return cached embedding when available', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(true);
      mockCache.get.mockResolvedValueOnce(
        JSON.stringify({
          embedding: [0.5, 0.6, 0.7],
          tokenUsage: { total: 8 },
        }),
      );

      const input = 'PFQA_VERCEL_EMBEDDING_INPUT_SENTINEL';
      const provider = new VercelAiEmbeddingProvider('openai/text-embedding-3-small');
      const result = await provider.callEmbeddingApi(input);

      expect(result).toEqual({
        embedding: [0.5, 0.6, 0.7],
        tokenUsage: { total: 8 },
        cached: true,
      });
      const cacheKey = mockCache.get.mock.calls[0][0] as string;
      expect(cacheKey).toMatch(/^vercel:embedding:openai\/text-embedding-3-small:[a-f0-9]{64}$/);
      expect(cacheKey).not.toContain(input);
    });
  });
});

describe('createVercelProvider', () => {
  it('should create text generation provider for standard path', () => {
    const provider = createVercelProvider('vercel:openai/gpt-4o-mini');
    expect(provider).toBeInstanceOf(VercelAiProvider);
    expect(provider.id()).toBe('vercel:openai/gpt-4o-mini');
  });

  it('should create embedding provider for embedding path', () => {
    const provider = createVercelProvider('vercel:embedding:openai/text-embedding-3-small');
    expect(provider).toBeInstanceOf(VercelAiEmbeddingProvider);
    expect(provider.id()).toBe('vercel:embedding:openai/text-embedding-3-small');
  });

  it('should pass options to created provider', () => {
    const provider = createVercelProvider('vercel:openai/gpt-4o', {
      config: { temperature: 0.5 },
    }) as VercelAiProvider;
    expect(provider.config.temperature).toBe(0.5);
  });
});
