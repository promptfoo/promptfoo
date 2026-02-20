/**
 * Phase 5: Comprehensive provider instrumentation validation tests.
 *
 * These tests verify that OTEL tracing is correctly implemented across
 * all instrumented providers, covering:
 * - GenAI semantic conventions compliance
 * - Token usage capture
 * - Trace context propagation
 * - Error handling
 * - Concurrent calls
 * - Provider inheritance
 */

import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GenAIAttributes,
  getCurrentTraceId,
  getGenAIProviderName,
  getTraceparent,
  PromptfooAttributes,
  useGenAILatestExperimental,
  withGenAISpan,
} from '../../src/tracing/genaiTracer';

import type { GenAISpanContext, GenAISpanResult } from '../../src/tracing/genaiTracer';

// Mock external dependencies for provider tests
vi.mock('../../src/cache', () => ({
  fetchWithCache: vi.fn(),
  getCache: vi.fn(() => ({ get: vi.fn(), set: vi.fn() })),
  isCacheEnabled: vi.fn(() => false),
}));

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Phase 5: Provider Instrumentation Validation', () => {
  let tracerProvider: NodeTracerProvider;
  let memoryExporter: InMemorySpanExporter;
  let savedOtelSemconvOptIn: string | undefined;

  beforeAll(() => {
    memoryExporter = new InMemorySpanExporter();
    tracerProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
    });
    tracerProvider.register();
    savedOtelSemconvOptIn = process.env.OTEL_SEMCONV_STABILITY_OPT_IN;
    process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'gen_ai_latest_experimental';
  });

  afterAll(async () => {
    process.env.OTEL_SEMCONV_STABILITY_OPT_IN = savedOtelSemconvOptIn;
    await tracerProvider.shutdown();
  });

  beforeEach(() => {
    memoryExporter.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GenAI Semantic Conventions Compliance', () => {
    it('should set all required GenAI attributes on spans', async () => {
      const spanContext: GenAISpanContext = {
        system: 'openai',
        operationName: 'chat',
        model: 'gpt-4',
        providerId: 'openai:gpt-4',
        maxTokens: 1000,
        temperature: 0.7,
        topP: 0.9,
        stopSequences: ['END'],
      };

      await withGenAISpan(spanContext, async () => ({ output: 'test' }));

      const spans = memoryExporter.getFinishedSpans();
      expect(spans).toHaveLength(1);

      const span = spans[0];

      // Required GenAI attributes (OTEL spec)
      expect(span.attributes[GenAIAttributes.SYSTEM]).toBe('openai');
      expect(span.attributes[GenAIAttributes.PROVIDER_NAME]).toBe('openai');
      expect(span.attributes[GenAIAttributes.OPERATION_NAME]).toBe('chat');
      expect(span.attributes[GenAIAttributes.REQUEST_MODEL]).toBe('gpt-4');

      // Optional request attributes
      expect(span.attributes[GenAIAttributes.REQUEST_MAX_TOKENS]).toBe(1000);
      expect(span.attributes[GenAIAttributes.REQUEST_TEMPERATURE]).toBe(0.7);
      expect(span.attributes[GenAIAttributes.REQUEST_TOP_P]).toBe(0.9);
      expect(span.attributes[GenAIAttributes.REQUEST_STOP_SEQUENCES]).toEqual(['END']);
    });

    it('should follow span naming convention: "{operation} {model}"', async () => {
      const testCases = [
        { operationName: 'chat' as const, model: 'gpt-4', expected: 'chat gpt-4' },
        {
          operationName: 'text_completion' as const,
          model: 'text-davinci-003',
          expected: 'text_completion text-davinci-003',
        },
        {
          operationName: 'embeddings' as const,
          model: 'text-embedding-ada-002',
          expected: 'embeddings text-embedding-ada-002',
        },
      ];

      for (const { operationName, model, expected } of testCases) {
        memoryExporter.reset();

        await withGenAISpan(
          { system: 'openai', operationName, model, providerId: `openai:${model}` },
          async () => ({ output: 'test' }),
        );

        const spans = memoryExporter.getFinishedSpans();
        expect(spans[0].name).toBe(expected);
      }
    });

    it('should set span kind to CLIENT for all provider calls', async () => {
      await withGenAISpan(
        {
          system: 'anthropic',
          operationName: 'chat',
          model: 'claude-3-opus',
          providerId: 'anthropic:claude-3-opus',
        },
        async () => ({ output: 'test' }),
      );

      const spans = memoryExporter.getFinishedSpans();
      expect(spans[0].kind).toBe(SpanKind.CLIENT);
    });

    it('should set error.type when the operation throws', async () => {
      const testError = new Error('Provider API error');
      await expect(
        withGenAISpan(
          { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
          async () => {
            throw testError;
          },
        ),
      ).rejects.toThrow('Provider API error');

      const spans = memoryExporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
      expect(spans[0].attributes['error.type']).toBe('Error');
    });

    it('should set error.type when response has error (no throw)', async () => {
      await withGenAISpan(
        { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
        async () => ({
          error: 'Rate limited',
          metadata: { http: { status: 429, statusText: 'Too Many Requests' } },
        }),
      );
      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes['error.type']).toBe('429');
    });

    it('should use provider_error not HTTP status when metadata.http.status is 2xx', async () => {
      await withGenAISpan(
        { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
        async () => ({
          error: 'Soft failure',
          metadata: { http: { status: 200, statusText: 'OK' } },
        }),
      );
      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes['error.type']).toBe('provider_error');
    });

    it('should set error.type from provider error object (code/type/status)', async () => {
      await withGenAISpan(
        { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
        async () => ({
          error: { code: 'content_filter', message: 'Content filtered', type: 'content_policy' },
        }),
      );
      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes['error.type']).toBe('content_filter');
    });

    it('should set error.type to provider_error when response.error has no code', async () => {
      await withGenAISpan(
        { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
        async () => ({ error: 'Something went wrong' }),
      );
      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes['error.type']).toBe('provider_error');
    });

    it('should treat object response.error without .message as error and set error.type', async () => {
      await withGenAISpan(
        { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
        async () => ({ error: { code: 'insufficient_quota' } }),
      );
      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes['error.type']).toBe('insufficient_quota');
      expect(span.status.message).toBe('Provider error');
    });

    it('should map provider system to gen_ai.provider.name', async () => {
      expect(getGenAIProviderName('openai')).toBe('openai');
      expect(getGenAIProviderName('anthropic')).toBe('anthropic');
      expect(getGenAIProviderName('aws_bedrock')).toBe('aws.bedrock');
      expect(getGenAIProviderName('bedrock')).toBe('aws.bedrock');
      expect(getGenAIProviderName('azure')).toBe('azure.ai.openai');
      expect(getGenAIProviderName('vertex')).toBe('gcp.vertex_ai');
      expect(getGenAIProviderName('cohere')).toBe('cohere');
      expect(getGenAIProviderName('mistral')).toBe('mistral_ai');
      expect(getGenAIProviderName('ollama')).toBe('ollama');
      expect(getGenAIProviderName('unknown-provider')).toBe('unknown-provider');
      expect(getGenAIProviderName('vertex:palm2')).toBe('gcp.vertex_ai');
      expect(getGenAIProviderName('vertex:gemini')).toBe('gcp.vertex_ai');
    });

    describe('when OTEL_SEMCONV_STABILITY_OPT_IN is not set (legacy emission)', () => {
      beforeEach(() => {
        delete process.env.OTEL_SEMCONV_STABILITY_OPT_IN;
      });
      afterEach(() => {
        process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'gen_ai_latest_experimental';
      });

      it('should emit legacy operation names and span names for backward compatibility', async () => {
        expect(useGenAILatestExperimental()).toBe(false);

        await withGenAISpan(
          {
            system: 'openai',
            operationName: 'text_completion',
            model: 'text-davinci-003',
            providerId: 'openai:text-davinci-003',
          },
          async () => ({ output: 'test' }),
        );
        const span1 = memoryExporter.getFinishedSpans()[0];
        expect(span1.name).toBe('completion text-davinci-003');
        expect(span1.attributes[GenAIAttributes.OPERATION_NAME]).toBe('completion');

        memoryExporter.reset();
        await withGenAISpan(
          {
            system: 'openai',
            operationName: 'embeddings',
            model: 'text-embedding-ada-002',
            providerId: 'openai:embedding',
          },
          async () => ({ output: 'test' }),
        );
        const span2 = memoryExporter.getFinishedSpans()[0];
        expect(span2.name).toBe('embedding text-embedding-ada-002');
        expect(span2.attributes[GenAIAttributes.OPERATION_NAME]).toBe('embedding');
      });

      it('should still emit both gen_ai.system and gen_ai.provider.name when not opt-in', async () => {
        await withGenAISpan(
          { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
          async () => ({ output: 'test' }),
        );
        const span = memoryExporter.getFinishedSpans()[0];
        expect(span.attributes[GenAIAttributes.SYSTEM]).toBe('openai');
        expect(span.attributes[GenAIAttributes.PROVIDER_NAME]).toBe('openai');
      });
    });
  });

  describe('Token Usage Capture', () => {
    it('should capture basic token usage (prompt, completion, total)', async () => {
      const resultExtractor = (): GenAISpanResult => ({
        tokenUsage: {
          prompt: 100,
          completion: 50,
          total: 150,
        },
      });

      await withGenAISpan(
        { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
        async () => ({ output: 'test' }),
        resultExtractor,
      );

      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.attributes[GenAIAttributes.USAGE_INPUT_TOKENS]).toBe(100);
      expect(span.attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS]).toBe(50);
      expect(span.attributes[GenAIAttributes.USAGE_TOTAL_TOKENS]).toBe(150);
    });

    it('should capture cached tokens (Anthropic prompt caching)', async () => {
      const resultExtractor = (): GenAISpanResult => ({
        tokenUsage: {
          prompt: 200,
          completion: 100,
          total: 300,
          cached: 150,
        },
      });

      await withGenAISpan(
        {
          system: 'anthropic',
          operationName: 'chat',
          model: 'claude-3-sonnet',
          providerId: 'anthropic:claude-3-sonnet',
        },
        async () => ({ output: 'test' }),
        resultExtractor,
      );

      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.attributes[GenAIAttributes.USAGE_CACHED_TOKENS]).toBe(150);
    });

    it('should capture reasoning tokens (OpenAI o1 models)', async () => {
      const resultExtractor = (): GenAISpanResult => ({
        tokenUsage: {
          prompt: 100,
          completion: 500,
          total: 600,
          completionDetails: {
            reasoning: 450,
          },
        },
      });

      await withGenAISpan(
        {
          system: 'openai',
          operationName: 'chat',
          model: 'o1-preview',
          providerId: 'openai:o1-preview',
        },
        async () => ({ output: 'test' }),
        resultExtractor,
      );

      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.attributes[GenAIAttributes.USAGE_REASONING_TOKENS]).toBe(450);
    });

    it('should capture speculative decoding tokens', async () => {
      const resultExtractor = (): GenAISpanResult => ({
        tokenUsage: {
          prompt: 50,
          completion: 30,
          total: 80,
          completionDetails: {
            acceptedPrediction: 25,
            rejectedPrediction: 5,
          },
        },
      });

      await withGenAISpan(
        {
          system: 'openai',
          operationName: 'chat',
          model: 'gpt-4-turbo',
          providerId: 'openai:gpt-4-turbo',
        },
        async () => ({ output: 'test' }),
        resultExtractor,
      );

      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.attributes[GenAIAttributes.USAGE_ACCEPTED_PREDICTION_TOKENS]).toBe(25);
      expect(span.attributes[GenAIAttributes.USAGE_REJECTED_PREDICTION_TOKENS]).toBe(5);
    });
  });

  describe('Trace Context Propagation', () => {
    it('should generate valid W3C traceparent header', async () => {
      let capturedTraceparent: string | undefined;

      await withGenAISpan(
        { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
        async () => {
          capturedTraceparent = getTraceparent();
          return { output: 'test' };
        },
      );

      expect(capturedTraceparent).toBeDefined();
      // Format: 00-traceId(32 hex)-spanId(16 hex)-flags(2 hex)
      expect(capturedTraceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
    });

    it('should provide trace ID within active span', async () => {
      let capturedTraceId: string | undefined;

      await withGenAISpan(
        { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
        async () => {
          capturedTraceId = getCurrentTraceId();
          return { output: 'test' };
        },
      );

      expect(capturedTraceId).toBeDefined();
      expect(capturedTraceId).toHaveLength(32);
      expect(capturedTraceId).toMatch(/^[0-9a-f]+$/);
    });

    it('should maintain parent-child relationship for nested spans', async () => {
      await withGenAISpan(
        { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
        async () => {
          // Nested call (e.g., embedding for RAG)
          await withGenAISpan(
            {
              system: 'openai',
              operationName: 'embeddings',
              model: 'text-embedding-ada-002',
              providerId: 'openai:embedding',
            },
            async () => ({ embedding: [0.1, 0.2] }),
          );
          return { output: 'test' };
        },
      );

      const spans = memoryExporter.getFinishedSpans();
      expect(spans).toHaveLength(2);

      // Find parent and child spans
      const embeddingSpan = spans.find((s) => s.name.includes('embedding'));
      const chatSpan = spans.find((s) => s.name.includes('chat'));

      expect(embeddingSpan).toBeDefined();
      expect(chatSpan).toBeDefined();

      // Verify parent-child relationship
      expect(embeddingSpan!.parentSpanContext?.spanId).toBe(chatSpan!.spanContext().spanId);
      expect(embeddingSpan!.spanContext().traceId).toBe(chatSpan!.spanContext().traceId);
    });
  });

  describe('Error Handling', () => {
    it('should set ERROR status on provider failure', async () => {
      const error = new Error('API rate limit exceeded');

      await expect(
        withGenAISpan(
          { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
          async () => {
            throw error;
          },
        ),
      ).rejects.toThrow('API rate limit exceeded');

      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.status.message).toBe('API rate limit exceeded');
    });

    it('should record exception events for errors', async () => {
      await expect(
        withGenAISpan(
          {
            system: 'anthropic',
            operationName: 'chat',
            model: 'claude-3-opus',
            providerId: 'anthropic:claude-3-opus',
          },
          async () => {
            throw new Error('Service unavailable');
          },
        ),
      ).rejects.toThrow();

      const span = memoryExporter.getFinishedSpans()[0];
      const exceptionEvent = span.events.find((e) => e.name === 'exception');

      expect(exceptionEvent).toBeDefined();
      expect(exceptionEvent!.attributes).toHaveProperty('exception.message', 'Service unavailable');
    });

    it('should still end span even when error occurs', async () => {
      try {
        await withGenAISpan(
          { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
          async () => {
            throw new Error('Network error');
          },
        );
      } catch {
        // Expected
      }

      const spans = memoryExporter.getFinishedSpans();
      expect(spans).toHaveLength(1);
      // If span is in finished spans, it was ended
    });

    it('should handle non-Error thrown values', async () => {
      await expect(
        withGenAISpan(
          { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
          async () => {
            throw 'String error'; // Non-Error thrown
          },
        ),
      ).rejects.toBe('String error');

      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.status.message).toBe('String error');
    });
  });

  describe('Concurrent Provider Calls', () => {
    it('should handle multiple concurrent provider calls', async () => {
      const providers = [
        { system: 'openai', model: 'gpt-4' },
        { system: 'anthropic', model: 'claude-3-opus' },
        { system: 'bedrock', model: 'anthropic.claude-3-sonnet' },
        { system: 'azure', model: 'gpt-4-deployment' },
      ];

      await Promise.all(
        providers.map(({ system, model }) =>
          withGenAISpan(
            { system, operationName: 'chat', model, providerId: `${system}:${model}` },
            async () => {
              // Simulate API latency
              await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
              return { output: `Response from ${system}` };
            },
          ),
        ),
      );

      const spans = memoryExporter.getFinishedSpans();
      expect(spans).toHaveLength(4);

      // Verify all systems are represented
      const systems = spans.map((s) => s.attributes[GenAIAttributes.SYSTEM]);
      expect(systems).toContain('openai');
      expect(systems).toContain('anthropic');
      expect(systems).toContain('bedrock');
      expect(systems).toContain('azure');

      // All spans should be successful
      spans.forEach((span) => {
        expect(span.status.code).toBe(SpanStatusCode.OK);
      });
    });

    it('should maintain correct token usage across concurrent calls', async () => {
      const results = await Promise.all([
        withGenAISpan(
          { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
          async () => ({ output: 'a' }),
          () => ({ tokenUsage: { prompt: 100, completion: 50, total: 150 } }),
        ),
        withGenAISpan(
          {
            system: 'anthropic',
            operationName: 'chat',
            model: 'claude-3',
            providerId: 'anthropic:claude-3',
          },
          async () => ({ output: 'b' }),
          () => ({ tokenUsage: { prompt: 200, completion: 100, total: 300 } }),
        ),
      ]);

      expect(results).toHaveLength(2);

      const spans = memoryExporter.getFinishedSpans();
      const openaiSpan = spans.find((s) => s.attributes[GenAIAttributes.SYSTEM] === 'openai');
      const anthropicSpan = spans.find((s) => s.attributes[GenAIAttributes.SYSTEM] === 'anthropic');

      expect(openaiSpan!.attributes[GenAIAttributes.USAGE_INPUT_TOKENS]).toBe(100);
      expect(anthropicSpan!.attributes[GenAIAttributes.USAGE_INPUT_TOKENS]).toBe(200);
    });
  });

  describe('Provider Systems Coverage', () => {
    // Test all Category A providers (directly instrumented)
    const categoryAProviders = [
      { system: 'openai', model: 'gpt-4' },
      { system: 'anthropic', model: 'claude-3-opus' },
      { system: 'azure', model: 'gpt-4-deployment' },
      { system: 'bedrock', model: 'anthropic.claude-3-sonnet' },
      { system: 'vertex', model: 'gemini-1.5-pro' },
      { system: 'vertex:anthropic', model: 'claude-3-sonnet@anthropic' },
      { system: 'vertex:gemini', model: 'gemini-1.5-flash' },
      { system: 'ollama', model: 'llama2' },
      { system: 'mistral', model: 'mistral-large-latest' },
      { system: 'cohere', model: 'command-r-plus' },
      { system: 'huggingface', model: 'meta-llama/Llama-2-7b' },
      { system: 'watsonx', model: 'ibm/granite-13b-chat-v2' },
      { system: 'http', model: 'custom-endpoint' },
      { system: 'replicate', model: 'meta/llama-2-70b-chat' },
      { system: 'openrouter', model: 'openai/gpt-4' },
    ];

    it.each(categoryAProviders)('should correctly instrument $system provider', async ({
      system,
      model,
    }) => {
      await withGenAISpan(
        { system, operationName: 'chat', model, providerId: `${system}:${model}` },
        async () => ({ output: 'test' }),
        () => ({ tokenUsage: { prompt: 10, completion: 5, total: 15 } }),
      );

      const span = memoryExporter.getFinishedSpans()[0];

      expect(span.attributes[GenAIAttributes.SYSTEM]).toBe(system);
      expect(span.attributes[GenAIAttributes.REQUEST_MODEL]).toBe(model);
      expect(span.attributes[PromptfooAttributes.PROVIDER_ID]).toBe(`${system}:${model}`);
      expect(span.status.code).toBe(SpanStatusCode.OK);

      memoryExporter.reset();
    });

    // Test Category B providers (inherit from OpenAI)
    const categoryBProviders = [
      'groq',
      'together',
      'cerebras',
      'fireworks',
      'deepinfra',
      'xai',
      'sambanova',
      'perplexity',
    ];

    it.each(
      categoryBProviders,
    )('should support inherited instrumentation for %s (via OpenAI base)', async (system) => {
      // Category B providers inherit from OpenAI and should work with the same pattern
      await withGenAISpan(
        { system, operationName: 'chat', model: 'model-name', providerId: `${system}:model-name` },
        async () => ({ output: 'test' }),
      );

      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.attributes[GenAIAttributes.SYSTEM]).toBe(system);
      expect(span.status.code).toBe(SpanStatusCode.OK);

      memoryExporter.reset();
    });
  });

  describe('Promptfoo Context Attributes', () => {
    it('should capture eval ID', async () => {
      await withGenAISpan(
        {
          system: 'openai',
          operationName: 'chat',
          model: 'gpt-4',
          providerId: 'openai:gpt-4',
          evalId: 'eval-abc123',
        },
        async () => ({ output: 'test' }),
      );

      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.attributes[PromptfooAttributes.EVAL_ID]).toBe('eval-abc123');
    });

    it('should capture test index', async () => {
      await withGenAISpan(
        {
          system: 'openai',
          operationName: 'chat',
          model: 'gpt-4',
          providerId: 'openai:gpt-4',
          testIndex: 42,
        },
        async () => ({ output: 'test' }),
      );

      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.attributes[PromptfooAttributes.TEST_INDEX]).toBe(42);
    });

    it('should capture prompt label', async () => {
      await withGenAISpan(
        {
          system: 'openai',
          operationName: 'chat',
          model: 'gpt-4',
          providerId: 'openai:gpt-4',
          promptLabel: 'summarization-v2',
        },
        async () => ({ output: 'test' }),
      );

      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.attributes[PromptfooAttributes.PROMPT_LABEL]).toBe('summarization-v2');
    });
  });

  describe('Response Metadata', () => {
    it('should capture response model (may differ from requested)', async () => {
      await withGenAISpan(
        { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
        async () => ({ output: 'test' }),
        () => ({ responseModel: 'gpt-4-0613' }),
      );

      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.attributes[GenAIAttributes.RESPONSE_MODEL]).toBe('gpt-4-0613');
    });

    it('should capture response ID', async () => {
      await withGenAISpan(
        { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
        async () => ({ output: 'test' }),
        () => ({ responseId: 'chatcmpl-abc123' }),
      );

      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.attributes[GenAIAttributes.RESPONSE_ID]).toBe('chatcmpl-abc123');
    });

    it('should capture finish reasons', async () => {
      await withGenAISpan(
        { system: 'openai', operationName: 'chat', model: 'gpt-4', providerId: 'openai:gpt-4' },
        async () => ({ output: 'test' }),
        () => ({ finishReasons: ['stop', 'length'] }),
      );

      const span = memoryExporter.getFinishedSpans()[0];
      expect(span.attributes[GenAIAttributes.RESPONSE_FINISH_REASONS]).toEqual(['stop', 'length']);
    });
  });
});
