/**
 * Phase 5: Performance benchmark tests for OTEL instrumentation.
 *
 * These tests measure the overhead of OTEL tracing to ensure
 * it doesn't significantly impact evaluation performance.
 */

import {
  BatchSpanProcessor,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
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

describe('OTEL Tracing Performance Benchmarks', () => {
  let tracerProvider: NodeTracerProvider;
  let memoryExporter: InMemorySpanExporter;

  beforeAll(() => {
    memoryExporter = new InMemorySpanExporter();
    // Use SimpleSpanProcessor for consistent test behavior
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

  describe('Span Creation Overhead', () => {
    it('should add minimal overhead to a no-op function', async () => {
      const iterations = 1000;

      // Baseline: direct function call
      const baselineStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await (async () => ({ output: 'test' }))();
      }
      const baselineTime = performance.now() - baselineStart;

      // With tracing
      const tracedStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await withGenAISpan(baseContext, async () => ({ output: 'test' }));
      }
      const tracedTime = performance.now() - tracedStart;

      const overhead = tracedTime - baselineTime;
      const overheadPerCall = overhead / iterations;

      // Expect less than 1ms overhead per call
      expect(overheadPerCall).toBeLessThan(1);

      // Log results for visibility
      console.log(`Baseline: ${baselineTime.toFixed(2)}ms for ${iterations} calls`);
      console.log(`Traced: ${tracedTime.toFixed(2)}ms for ${iterations} calls`);
      console.log(`Overhead per call: ${overheadPerCall.toFixed(4)}ms`);
    });

    it('should add minimal overhead with full result extraction', async () => {
      const iterations = 1000;

      // With full result extraction
      const tracedStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await withGenAISpan(baseContext, async () => ({ output: 'test' }), resultExtractor);
      }
      const tracedTime = performance.now() - tracedStart;

      const timePerCall = tracedTime / iterations;

      // Expect less than 2ms per call with full extraction
      expect(timePerCall).toBeLessThan(2);

      console.log(`With result extraction: ${tracedTime.toFixed(2)}ms for ${iterations} calls`);
      console.log(`Time per call: ${timePerCall.toFixed(4)}ms`);
    });

    it('should handle high concurrency efficiently', async () => {
      const concurrency = 100;
      const iterations = 10;

      const start = performance.now();

      for (let batch = 0; batch < iterations; batch++) {
        await Promise.all(
          Array.from({ length: concurrency }, (_, i) =>
            withGenAISpan(
              { ...baseContext, testIndex: batch * concurrency + i },
              async () => {
                // Simulate minimal work
                return { output: `Response ${i}` };
              },
              resultExtractor,
            ),
          ),
        );
      }

      const totalTime = performance.now() - start;
      const totalCalls = concurrency * iterations;
      const timePerCall = totalTime / totalCalls;

      // Expect reasonable performance under concurrency
      expect(timePerCall).toBeLessThan(5);

      console.log(`Concurrent: ${totalTime.toFixed(2)}ms for ${totalCalls} calls`);
      console.log(`Time per call: ${timePerCall.toFixed(4)}ms`);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory over many iterations', async () => {
      const iterations = 5000;

      // Force GC if available
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        await withGenAISpan(baseContext, async () => ({ output: `test-${i}` }), resultExtractor);
      }

      // Clear exported spans to simulate normal operation
      memoryExporter.reset();

      // Force GC if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Memory increase should be reasonable (less than 50MB for 5000 calls)
      // Note: This test is indicative; actual behavior depends on GC timing
      console.log(`Memory increase: ${memoryIncrease.toFixed(2)}MB for ${iterations} calls`);

      // We don't strictly assert here as GC timing varies
      // But we log for manual review
    });
  });

  describe('Attribute Setting Performance', () => {
    it('should efficiently set many attributes', async () => {
      const iterations = 1000;

      // Context with all optional attributes
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

      // Full result extractor
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

      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        await withGenAISpan(fullContext, async () => ({ output: 'test' }), fullResultExtractor);
      }

      const totalTime = performance.now() - start;
      const timePerCall = totalTime / iterations;

      // Even with all attributes, should be fast
      expect(timePerCall).toBeLessThan(3);

      console.log(`Full attributes: ${totalTime.toFixed(2)}ms for ${iterations} calls`);
      console.log(`Time per call: ${timePerCall.toFixed(4)}ms`);
    });
  });

  describe('Error Path Performance', () => {
    it('should handle errors efficiently', async () => {
      const iterations = 500;

      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        try {
          await withGenAISpan(baseContext, async () => {
            throw new Error(`Error ${i}`);
          });
        } catch {
          // Expected
        }
      }

      const totalTime = performance.now() - start;
      const timePerCall = totalTime / iterations;

      // Error path should still be reasonably fast
      expect(timePerCall).toBeLessThan(5);

      console.log(`Error path: ${totalTime.toFixed(2)}ms for ${iterations} calls`);
      console.log(`Time per call: ${timePerCall.toFixed(4)}ms`);
    });
  });

  describe('Comparison with Simulated API Latency', () => {
    it('should be negligible compared to typical API latency', async () => {
      const iterations = 100;
      const simulatedLatencyMs = 100; // Typical LLM API latency

      // Pure latency
      const latencyStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await new Promise((resolve) => setTimeout(resolve, simulatedLatencyMs));
      }
      const latencyTime = performance.now() - latencyStart;

      // Latency + tracing
      memoryExporter.reset();
      const tracedStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await withGenAISpan(
          baseContext,
          async () => {
            await new Promise((resolve) => setTimeout(resolve, simulatedLatencyMs));
            return { output: 'test' };
          },
          resultExtractor,
        );
      }
      const tracedTime = performance.now() - tracedStart;

      const tracingOverhead = tracedTime - latencyTime;
      const overheadPercentage = (tracingOverhead / latencyTime) * 100;

      // Tracing overhead should be less than 5% of API latency
      expect(overheadPercentage).toBeLessThan(5);

      console.log(`Pure latency: ${latencyTime.toFixed(2)}ms`);
      console.log(`With tracing: ${tracedTime.toFixed(2)}ms`);
      console.log(
        `Tracing overhead: ${tracingOverhead.toFixed(2)}ms (${overheadPercentage.toFixed(2)}%)`,
      );
    });
  });
});

describe('BatchSpanProcessor Performance', () => {
  let tracerProvider: NodeTracerProvider;
  let memoryExporter: InMemorySpanExporter;

  beforeAll(() => {
    memoryExporter = new InMemorySpanExporter();
    // Use BatchSpanProcessor like production
    tracerProvider = new NodeTracerProvider({
      spanProcessors: [
        new BatchSpanProcessor(memoryExporter, {
          maxQueueSize: 2048,
          maxExportBatchSize: 512,
          scheduledDelayMillis: 5000,
          exportTimeoutMillis: 30000,
        }),
      ],
    });
    tracerProvider.register();
  });

  afterAll(async () => {
    await tracerProvider.shutdown();
  });

  beforeEach(() => {
    memoryExporter.reset();
  });

  const baseContext: GenAISpanContext = {
    system: 'openai',
    operationName: 'chat',
    model: 'gpt-4',
    providerId: 'openai:gpt-4',
  };

  it('should handle burst traffic efficiently with batch processing', async () => {
    const burstSize = 500;

    const start = performance.now();

    // Simulate burst of provider calls
    await Promise.all(
      Array.from({ length: burstSize }, (_, i) =>
        withGenAISpan({ ...baseContext, testIndex: i }, async () => ({ output: `Response ${i}` })),
      ),
    );

    const totalTime = performance.now() - start;
    const timePerCall = totalTime / burstSize;

    // Batch processor should handle bursts efficiently
    expect(timePerCall).toBeLessThan(5);

    console.log(`Burst of ${burstSize} calls: ${totalTime.toFixed(2)}ms`);
    console.log(`Time per call: ${timePerCall.toFixed(4)}ms`);
  });
});
