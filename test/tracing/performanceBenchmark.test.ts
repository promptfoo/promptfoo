/**
 * Smoke tests for OTEL instrumentation.
 *
 * These tests verify that tracing works correctly under various conditions
 * (concurrency, errors, many attributes, etc.) without asserting on timing.
 * Performance benchmarking should be done with dedicated tooling, not in CI.
 */

import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { withGenAISpan } from '../../src/tracing/genaiTracer';

import type { GenAISpanContext, GenAISpanResult } from '../../src/tracing/genaiTracer';

// Mock logger to reduce noise
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('OTEL Tracing Smoke Tests', () => {
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
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const baseContext: GenAISpanContext = {
    system: 'openai',
    operationName: 'chat',
    model: 'gpt-4',
    providerId: 'openai:gpt-4',
    maxTokens: 1000,
    temperature: 0.7,
  };

  const resultExtractor = (): GenAISpanResult => ({
    tokenUsage: { prompt: 100, completion: 50, total: 150 },
    responseId: 'chatcmpl-123',
    finishReasons: ['stop'],
  });

  describe('Basic Span Creation', () => {
    it('should create spans for traced operations', async () => {
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        await withGenAISpan(baseContext, async () => ({ output: 'test' }));
      }

      const spans = memoryExporter.getFinishedSpans();
      expect(spans.length).toBe(iterations);
    });

    it('should create spans with result extraction', async () => {
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        await withGenAISpan(baseContext, async () => ({ output: 'test' }), resultExtractor);
      }

      const spans = memoryExporter.getFinishedSpans();
      expect(spans.length).toBe(iterations);

      // Verify token usage attributes are set
      const span = spans[0];
      expect(span.attributes['gen_ai.usage.input_tokens']).toBe(100);
      expect(span.attributes['gen_ai.usage.output_tokens']).toBe(50);
    });

    it('should handle high concurrency without errors', async () => {
      const concurrency = 100;
      const batches = 3;

      for (let batch = 0; batch < batches; batch++) {
        await Promise.all(
          Array.from({ length: concurrency }, (_, i) =>
            withGenAISpan(
              { ...baseContext, testIndex: batch * concurrency + i },
              async () => ({ output: `Response ${i}` }),
              resultExtractor,
            ),
          ),
        );
      }

      const spans = memoryExporter.getFinishedSpans();
      expect(spans.length).toBe(concurrency * batches);
    });
  });

  describe('Attribute Handling', () => {
    it('should handle contexts with all optional attributes', async () => {
      const fullContext: GenAISpanContext = {
        system: 'openai',
        operationName: 'chat',
        model: 'gpt-4-turbo-preview',
        providerId: 'openai:gpt-4-turbo-preview',
        maxTokens: 4096,
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        stopSequences: ['END', 'STOP', '###'],
        frequencyPenalty: 0.5,
        presencePenalty: 0.5,
        evalId: 'eval-benchmark-test-123',
        testIndex: 42,
        promptLabel: 'benchmark-prompt-label',
      };

      const fullResultExtractor = (): GenAISpanResult => ({
        tokenUsage: {
          prompt: 1000,
          completion: 500,
          total: 1500,
          cached: 200,
          completionDetails: {
            reasoning: 300,
            acceptedPrediction: 150,
            rejectedPrediction: 50,
          },
        },
        responseModel: 'gpt-4-turbo-preview-2024-01-01',
        responseId: 'chatcmpl-benchmark123456789',
        finishReasons: ['stop'],
      });

      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        await withGenAISpan(fullContext, async () => ({ output: 'test' }), fullResultExtractor);
      }

      const spans = memoryExporter.getFinishedSpans();
      expect(spans.length).toBe(iterations);

      // Verify key attributes are set
      const span = spans[0];
      expect(span.attributes['gen_ai.request.model']).toBe('gpt-4-turbo-preview');
      expect(span.attributes['gen_ai.request.max_tokens']).toBe(4096);
      expect(span.attributes['gen_ai.usage.input_tokens']).toBe(1000);
    });
  });

  describe('Error Handling', () => {
    it('should properly record errors in spans', async () => {
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        try {
          await withGenAISpan(baseContext, async () => {
            throw new Error(`Test error ${i}`);
          });
        } catch {
          // Expected
        }
      }

      const spans = memoryExporter.getFinishedSpans();
      expect(spans.length).toBe(iterations);

      // Verify error is recorded
      const span = spans[0];
      expect(span.status.code).toBe(2); // SpanStatusCode.ERROR
    });
  });
});
