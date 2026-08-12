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
  getTraceparent,
  PromptfooAttributes,
  withGenAISpan,
} from '../../src/tracing/genaiTracer';
import { withTargetSpan } from '../../src/tracing/targetTracer';

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

  beforeAll(() => {
    memoryExporter = new InMemorySpanExporter();
    tracerProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
    });
    tracerProvider.register();
  });

  afterAll(async () => {
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
    it('parents existing model spans beneath the evaluator target span', async () => {
      const traceId = '0123456789abcdef0123456789abcdef';

      await withTargetSpan(
        {
          targetType: 'provider',
          providerId: 'openai:gpt-4',
          traceparent: `00-${traceId}-0123456789abcdef-01`,
        },
        async () =>
          withGenAISpan(
            {
              system: 'openai',
              operationName: 'chat',
              model: 'gpt-4',
              providerId: 'openai:gpt-4',
              traceparent: getTraceparent(),
            },
            async () => ({ output: 'ok' }),
          ),
      );

      const spans = memoryExporter.getFinishedSpans();
      const targetSpan = spans.find((span) => span.name === 'openai:gpt-4');
      const modelSpan = spans.find((span) => span.name === 'chat gpt-4');

      expect(targetSpan?.spanContext().traceId).toBe(traceId);
      expect(modelSpan?.spanContext().traceId).toBe(traceId);
      expect(modelSpan?.parentSpanContext?.spanId).toBe(targetSpan?.spanContext().spanId);
    });

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

      // Required GenAI attributes
      expect(span.attributes[GenAIAttributes.PROVIDER_NAME]).toBe('openai');
      expect(span.attributes).not.toHaveProperty(GenAIAttributes.SYSTEM);
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
          operationName: 'completion' as const,
          model: 'text-davinci-003',
          expected: 'text_completion text-davinci-003',
        },
        {
          operationName: 'embedding' as const,
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
      expect(span.attributes[PromptfooAttributes.USAGE_TOTAL_TOKENS]).toBe(150);
    });

    it('should capture Promptfoo response-cache tokens separately from provider prompt caching', async () => {
      const resultExtractor = (): GenAISpanResult => ({
        cacheHit: true,
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
      expect(span.attributes[PromptfooAttributes.USAGE_CACHED_RESPONSE_TOKENS]).toBe(150);
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
      expect(span.attributes[GenAIAttributes.USAGE_REASONING_OUTPUT_TOKENS]).toBe(450);
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
      expect(span.attributes[PromptfooAttributes.USAGE_ACCEPTED_PREDICTION_TOKENS]).toBe(25);
      expect(span.attributes[PromptfooAttributes.USAGE_REJECTED_PREDICTION_TOKENS]).toBe(5);
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
              operationName: 'embedding',
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
              await Promise.resolve();
              return { output: `Response from ${system}` };
            },
          ),
        ),
      );

      const spans = memoryExporter.getFinishedSpans();
      expect(spans).toHaveLength(4);

      // Verify all systems are represented
      const systems = spans.map((s) => s.attributes[GenAIAttributes.PROVIDER_NAME]);
      expect(systems).toContain('openai');
      expect(systems).toContain('anthropic');
      expect(systems).toContain('aws.bedrock');
      expect(systems).toContain('azure.ai.openai');

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
      const openaiSpan = spans.find(
        (s) => s.attributes[GenAIAttributes.PROVIDER_NAME] === 'openai',
      );
      const anthropicSpan = spans.find(
        (s) => s.attributes[GenAIAttributes.PROVIDER_NAME] === 'anthropic',
      );

      expect(openaiSpan!.attributes[GenAIAttributes.USAGE_INPUT_TOKENS]).toBe(100);
      expect(anthropicSpan!.attributes[GenAIAttributes.USAGE_INPUT_TOKENS]).toBe(200);
    });
  });

  describe('Provider Systems Coverage', () => {
    // Test all Category A providers (directly instrumented)
    const categoryAProviders = [
      { system: 'alibaba', model: 'qwen-max', providerName: 'alibaba_cloud' },
      { system: 'openai', model: 'gpt-4', providerName: 'openai' },
      { system: 'anthropic', model: 'claude-3-opus', providerName: 'anthropic' },
      { system: 'azure', model: 'gpt-4-deployment', providerName: 'azure.ai.openai' },
      { system: 'bedrock', model: 'anthropic.claude-3-sonnet', providerName: 'aws.bedrock' },
      { system: 'vertex', model: 'gemini-1.5-pro', providerName: 'gcp.vertex_ai' },
      {
        system: 'vertex:anthropic',
        model: 'claude-3-sonnet@anthropic',
        providerName: 'gcp.vertex_ai',
      },
      { system: 'vertex:gemini', model: 'gemini-1.5-flash', providerName: 'gcp.vertex_ai' },
      { system: 'ollama', model: 'llama2', providerName: 'ollama' },
      { system: 'mistral', model: 'mistral-large-latest', providerName: 'mistral_ai' },
      { system: 'cohere', model: 'command-r-plus', providerName: 'cohere' },
      { system: 'huggingface', model: 'meta-llama/Llama-2-7b', providerName: 'huggingface' },
      { system: 'watsonx', model: 'ibm/granite-13b-chat-v2', providerName: 'ibm.watsonx.ai' },
      { system: 'replicate', model: 'meta/llama-2-70b-chat', providerName: 'replicate' },
      { system: 'openrouter', model: 'openai/gpt-4', providerName: 'openrouter' },
    ];

    it.each(categoryAProviders)(
      'should correctly instrument $system provider',
      async ({ system, model, providerName }) => {
        await withGenAISpan(
          { system, operationName: 'chat', model, providerId: `${system}:${model}` },
          async () => ({ output: 'test' }),
          () => ({ tokenUsage: { prompt: 10, completion: 5, total: 15 } }),
        );

        const span = memoryExporter.getFinishedSpans()[0];

        expect(span.attributes[GenAIAttributes.PROVIDER_NAME]).toBe(providerName);
        expect(span.attributes[GenAIAttributes.REQUEST_MODEL]).toBe(model);
        expect(span.attributes[PromptfooAttributes.PROVIDER_ID]).toBe(`${system}:${model}`);
        expect(span.status.code).toBe(SpanStatusCode.OK);

        memoryExporter.reset();
      },
    );

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

    it.each(categoryBProviders)(
      'should support inherited instrumentation for %s (via OpenAI base)',
      async (system) => {
        // Category B providers inherit from OpenAI and should work with the same pattern
        await withGenAISpan(
          {
            system,
            operationName: 'chat',
            model: 'model-name',
            providerId: `${system}:model-name`,
          },
          async () => ({ output: 'test' }),
        );

        const span = memoryExporter.getFinishedSpans()[0];
        expect(span.attributes[GenAIAttributes.PROVIDER_NAME]).toBe(
          system === 'xai' ? 'x_ai' : system,
        );
        expect(span.status.code).toBe(SpanStatusCode.OK);

        memoryExporter.reset();
      },
    );
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
