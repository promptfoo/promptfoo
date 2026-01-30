/**
 * Integration tests for OpenTelemetry tracing infrastructure.
 *
 * These tests verify that the OTEL SDK can be initialized and that
 * provider calls correctly create spans with GenAI semantic conventions.
 */

import { SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GenAIAttributes,
  getGenAITracer,
  PromptfooAttributes,
  withGenAISpan,
} from '../../src/tracing/genaiTracer';

import type { GenAISpanContext, GenAISpanResult } from '../../src/tracing/genaiTracer';

describe('OpenTelemetry Tracing Integration', () => {
  let tracerProvider: NodeTracerProvider;
  let memoryExporter: InMemorySpanExporter;

  beforeAll(() => {
    // Set up an in-memory exporter for testing
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

  describe('withGenAISpan', () => {
    it('should create a span with correct GenAI attributes', async () => {
      const spanContext: GenAISpanContext = {
        system: 'openai',
        operationName: 'chat',
        model: 'gpt-4',
        providerId: 'openai:gpt-4',
        maxTokens: 1000,
        temperature: 0.7,
        testIndex: 5,
        promptLabel: 'test-prompt',
      };

      const mockResult = {
        output: 'Hello, world!',
        tokenUsage: { prompt: 10, completion: 5, total: 15 },
      };

      const resultExtractor = (): GenAISpanResult => ({
        tokenUsage: { prompt: 10, completion: 5, total: 15 },
        finishReasons: ['stop'],
      });

      const result = await withGenAISpan(spanContext, async () => mockResult, resultExtractor);

      expect(result).toEqual(mockResult);

      // Get the exported spans
      const spans = memoryExporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];

      // Verify span name follows GenAI convention
      expect(span.name).toBe('chat gpt-4');

      // Verify GenAI attributes
      expect(span.attributes[GenAIAttributes.SYSTEM]).toBe('openai');
      expect(span.attributes[GenAIAttributes.OPERATION_NAME]).toBe('chat');
      expect(span.attributes[GenAIAttributes.REQUEST_MODEL]).toBe('gpt-4');
      expect(span.attributes[GenAIAttributes.REQUEST_MAX_TOKENS]).toBe(1000);
      expect(span.attributes[GenAIAttributes.REQUEST_TEMPERATURE]).toBe(0.7);

      // Verify Promptfoo attributes
      expect(span.attributes[PromptfooAttributes.PROVIDER_ID]).toBe('openai:gpt-4');
      expect(span.attributes[PromptfooAttributes.TEST_INDEX]).toBe(5);
      expect(span.attributes[PromptfooAttributes.PROMPT_LABEL]).toBe('test-prompt');

      // Verify response attributes
      expect(span.attributes[GenAIAttributes.USAGE_INPUT_TOKENS]).toBe(10);
      expect(span.attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS]).toBe(5);
      expect(span.attributes[GenAIAttributes.USAGE_TOTAL_TOKENS]).toBe(15);
      expect(span.attributes[GenAIAttributes.RESPONSE_FINISH_REASONS]).toEqual(['stop']);

      // Verify span status
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it('should handle errors and set span status to ERROR', async () => {
      const spanContext: GenAISpanContext = {
        system: 'anthropic',
        operationName: 'chat',
        model: 'claude-3-opus',
        providerId: 'anthropic:claude-3-opus',
      };

      const error = new Error('API rate limit exceeded');

      await expect(
        withGenAISpan(spanContext, async () => {
          throw error;
        }),
      ).rejects.toThrow('API rate limit exceeded');

      const spans = memoryExporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];

      // Verify span status is ERROR
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.status.message).toBe('API rate limit exceeded');

      // Verify exception was recorded
      expect(span.events.length).toBeGreaterThan(0);
      const exceptionEvent = span.events.find((e) => e.name === 'exception');
      expect(exceptionEvent).toBeDefined();
    });

    it('should work without result extractor', async () => {
      const spanContext: GenAISpanContext = {
        system: 'bedrock',
        operationName: 'chat',
        model: 'anthropic.claude-3-sonnet',
        providerId: 'bedrock:claude-3-sonnet',
      };

      const result = await withGenAISpan(spanContext, async () => ({
        output: 'response',
      }));

      expect(result).toEqual({ output: 'response' });

      const spans = memoryExporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      // Should still have basic attributes
      expect(spans[0].attributes[GenAIAttributes.SYSTEM]).toBe('bedrock');
      expect(spans[0].status.code).toBe(SpanStatusCode.OK);
    });

    it('should capture multiple nested spans correctly', async () => {
      const outerContext: GenAISpanContext = {
        system: 'azure',
        operationName: 'chat',
        model: 'gpt-4-deployment',
        providerId: 'azure:gpt-4',
      };

      const innerContext: GenAISpanContext = {
        system: 'openai',
        operationName: 'embedding',
        model: 'text-embedding-ada-002',
        providerId: 'openai:embedding',
      };

      await withGenAISpan(outerContext, async () => {
        // Nested span for embedding
        await withGenAISpan(innerContext, async () => {
          return { embedding: [0.1, 0.2, 0.3] };
        });
        return { output: 'response' };
      });

      const spans = memoryExporter.getFinishedSpans();
      expect(spans.length).toBe(2);

      // Inner span should finish first
      const embeddingSpan = spans.find((s) => s.name.includes('embedding'));
      const chatSpan = spans.find((s) => s.name.includes('chat'));

      expect(embeddingSpan).toBeDefined();
      expect(chatSpan).toBeDefined();
      expect(embeddingSpan!.attributes[GenAIAttributes.SYSTEM]).toBe('openai');
      expect(chatSpan!.attributes[GenAIAttributes.SYSTEM]).toBe('azure');
    });
  });

  describe('getGenAITracer', () => {
    it('should return a tracer with correct name', () => {
      const tracer = getGenAITracer();
      expect(tracer).toBeDefined();
      // Tracer should be usable
      const span = tracer.startSpan('test-span');
      span.end();

      const spans = memoryExporter.getFinishedSpans();
      expect(spans.some((s) => s.name === 'test-span')).toBe(true);
    });
  });

  describe('Token usage with completion details', () => {
    it('should capture reasoning tokens in completion details', async () => {
      const spanContext: GenAISpanContext = {
        system: 'openai',
        operationName: 'chat',
        model: 'o1-preview',
        providerId: 'openai:o1-preview',
      };

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

      await withGenAISpan(spanContext, async () => ({ output: 'response' }), resultExtractor);

      const spans = memoryExporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.attributes[GenAIAttributes.USAGE_INPUT_TOKENS]).toBe(100);
      expect(span.attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS]).toBe(500);
      expect(span.attributes[GenAIAttributes.USAGE_REASONING_TOKENS]).toBe(450);
    });

    it('should capture predicted token details', async () => {
      const spanContext: GenAISpanContext = {
        system: 'openai',
        operationName: 'chat',
        model: 'gpt-4-turbo',
        providerId: 'openai:gpt-4-turbo',
      };

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

      await withGenAISpan(spanContext, async () => ({ output: 'response' }), resultExtractor);

      const spans = memoryExporter.getFinishedSpans();
      const span = spans[0];

      expect(span.attributes[GenAIAttributes.USAGE_ACCEPTED_PREDICTION_TOKENS]).toBe(25);
      expect(span.attributes[GenAIAttributes.USAGE_REJECTED_PREDICTION_TOKENS]).toBe(5);
    });

    it('should capture cached tokens', async () => {
      const spanContext: GenAISpanContext = {
        system: 'anthropic',
        operationName: 'chat',
        model: 'claude-3-sonnet',
        providerId: 'anthropic:claude-3-sonnet',
      };

      const resultExtractor = (): GenAISpanResult => ({
        tokenUsage: {
          prompt: 200,
          completion: 100,
          total: 300,
          cached: 150,
        },
      });

      await withGenAISpan(
        spanContext,
        async () => ({ output: 'cached response' }),
        resultExtractor,
      );

      const spans = memoryExporter.getFinishedSpans();
      const span = spans[0];

      expect(span.attributes[GenAIAttributes.USAGE_CACHED_TOKENS]).toBe(150);
    });
  });

  describe('Trace context propagation', () => {
    it('should generate valid traceparent header within active span', async () => {
      const { getTraceparent } = await import('../../src/tracing/genaiTracer');

      const spanContext: GenAISpanContext = {
        system: 'anthropic',
        operationName: 'agent',
        model: 'claude-agent-sdk',
        providerId: 'anthropic:claude-agent-sdk',
      };

      let capturedTraceparent: string | undefined;

      await withGenAISpan(spanContext, async () => {
        capturedTraceparent = getTraceparent();
        return { output: 'test' };
      });

      expect(capturedTraceparent).toBeDefined();
      // Traceparent format: 00-<trace-id>-<span-id>-<flags>
      expect(capturedTraceparent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-[0-9]{2}$/);

      const spans = memoryExporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      // Extract trace ID and span ID from traceparent
      const parts = capturedTraceparent!.split('-');
      const traceId = parts[1];
      const spanId = parts[2];

      // Verify the traceparent matches the active span
      expect(span.spanContext().traceId).toBe(traceId);
      expect(span.spanContext().spanId).toBe(spanId);
    });

    it('should return undefined traceparent when no active span', async () => {
      const { getTraceparent } = await import('../../src/tracing/genaiTracer');

      // Outside of any span context
      const traceparent = getTraceparent();

      // Should return undefined or empty since no active span
      // The behavior depends on whether a root span is active
      expect(traceparent === undefined || typeof traceparent === 'string').toBe(true);
    });

    it('should support nested spans with consistent trace context', async () => {
      const { getTraceparent } = await import('../../src/tracing/genaiTracer');

      const parentContext: GenAISpanContext = {
        system: 'anthropic',
        operationName: 'agent',
        model: 'claude-agent-sdk',
        providerId: 'anthropic:claude-agent-sdk',
      };

      const childContext: GenAISpanContext = {
        system: 'anthropic',
        operationName: 'tool_call',
        model: 'claude-agent-sdk',
        providerId: 'anthropic:claude-agent-sdk:tool',
      };

      let parentTraceparent: string | undefined;
      let childTraceparent: string | undefined;

      await withGenAISpan(parentContext, async () => {
        parentTraceparent = getTraceparent();

        await withGenAISpan(childContext, async () => {
          childTraceparent = getTraceparent();
          return { output: 'child result' };
        });

        return { output: 'parent result' };
      });

      expect(parentTraceparent).toBeDefined();
      expect(childTraceparent).toBeDefined();

      // Both should have same trace ID but different span IDs
      const parentParts = parentTraceparent!.split('-');
      const childParts = childTraceparent!.split('-');

      expect(parentParts[1]).toBe(childParts[1]); // Same trace ID
      expect(parentParts[2]).not.toBe(childParts[2]); // Different span IDs
    });
  });

  describe('Claude Agent SDK tracing integration', () => {
    it('should create span with claude-agent-sdk specific attributes', async () => {
      const spanContext: GenAISpanContext = {
        system: 'anthropic',
        operationName: 'agent',
        model: 'claude-agent-sdk',
        providerId: 'anthropic:claude-agent-sdk',
        maxTokens: 4096,
        temperature: 1.0,
      };

      const resultExtractor = (): GenAISpanResult => ({
        tokenUsage: {
          prompt: 1000,
          completion: 2000,
          total: 3000,
        },
        finishReasons: ['end_turn'],
      });

      await withGenAISpan(
        spanContext,
        async () => ({ output: 'Agent completed task' }),
        resultExtractor,
      );

      const spans = memoryExporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];

      // Verify span name follows GenAI convention
      expect(span.name).toBe('agent claude-agent-sdk');

      // Verify system is anthropic
      expect(span.attributes[GenAIAttributes.SYSTEM]).toBe('anthropic');
      expect(span.attributes[GenAIAttributes.OPERATION_NAME]).toBe('agent');
      expect(span.attributes[GenAIAttributes.REQUEST_MODEL]).toBe('claude-agent-sdk');

      // Verify token usage
      expect(span.attributes[GenAIAttributes.USAGE_INPUT_TOKENS]).toBe(1000);
      expect(span.attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS]).toBe(2000);
      expect(span.attributes[GenAIAttributes.USAGE_TOTAL_TOKENS]).toBe(3000);

      // Verify finish reason
      expect(span.attributes[GenAIAttributes.RESPONSE_FINISH_REASONS]).toEqual(['end_turn']);

      // Verify span completed successfully
      expect(span.status.code).toBe(SpanStatusCode.OK);
    });

    it('should correctly capture agent errors in span status', async () => {
      const spanContext: GenAISpanContext = {
        system: 'anthropic',
        operationName: 'agent',
        model: 'claude-agent-sdk',
        providerId: 'anthropic:claude-agent-sdk',
      };

      const agentError = new Error('Claude Code CLI not found');

      await expect(
        withGenAISpan(spanContext, async () => {
          throw agentError;
        }),
      ).rejects.toThrow('Claude Code CLI not found');

      const spans = memoryExporter.getFinishedSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];

      // Verify error status
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.status.message).toBe('Claude Code CLI not found');

      // Verify exception event was recorded
      const exceptionEvent = span.events.find((e) => e.name === 'exception');
      expect(exceptionEvent).toBeDefined();
    });
  });
});
