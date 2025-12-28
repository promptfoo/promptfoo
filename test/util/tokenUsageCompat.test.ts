import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenUsageTracker } from '../../src/util/tokenUsage';
import {
  aggregateUsageFromSpans,
  extractUsageFromSpan,
  getTokenUsage,
  getTokenUsageByProvider,
  getTokenUsageByTestIndex,
  getTokenUsageFromEvaluation,
  getTokenUsageFromTrace,
} from '../../src/util/tokenUsageCompat';

import type { SpanData } from '../../src/tracing/store';

// Mock the TraceStore
vi.mock('../../src/tracing/store', () => ({
  getTraceStore: vi.fn(),
}));

// Mock the TokenUsageTracker
vi.mock('../../src/util/tokenUsage', () => ({
  TokenUsageTracker: {
    getInstance: vi.fn(),
  },
}));

import { getTraceStore } from '../../src/tracing/store';

describe('tokenUsageCompat', () => {
  const mockTraceStore = {
    getSpans: vi.fn(),
    getTracesByEvaluation: vi.fn(),
  };

  const mockTracker = {
    getProviderUsage: vi.fn(),
    getTotalUsage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTraceStore).mockReturnValue(mockTraceStore as any);
    vi.mocked(TokenUsageTracker.getInstance).mockReturnValue(mockTracker as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('extractUsageFromSpan', () => {
    it('should return undefined for spans without attributes', () => {
      const span: SpanData = {
        spanId: 'span-1',
        name: 'test',
        startTime: 0,
      };

      expect(extractUsageFromSpan(span)).toBeUndefined();
    });

    it('should return undefined for spans without GenAI usage attributes', () => {
      const span: SpanData = {
        spanId: 'span-1',
        name: 'test',
        startTime: 0,
        attributes: {
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
        },
      };

      expect(extractUsageFromSpan(span)).toBeUndefined();
    });

    it('should extract input tokens', () => {
      const span: SpanData = {
        spanId: 'span-1',
        name: 'test',
        startTime: 0,
        attributes: {
          'gen_ai.usage.input_tokens': 100,
        },
      };

      const usage = extractUsageFromSpan(span);
      expect(usage).toEqual({
        numRequests: 1,
        prompt: 100,
      });
    });

    it('should extract output tokens', () => {
      const span: SpanData = {
        spanId: 'span-1',
        name: 'test',
        startTime: 0,
        attributes: {
          'gen_ai.usage.output_tokens': 50,
        },
      };

      const usage = extractUsageFromSpan(span);
      expect(usage).toEqual({
        numRequests: 1,
        completion: 50,
      });
    });

    it('should extract all standard usage attributes', () => {
      const span: SpanData = {
        spanId: 'span-1',
        name: 'test',
        startTime: 0,
        attributes: {
          'gen_ai.usage.input_tokens': 100,
          'gen_ai.usage.output_tokens': 50,
          'gen_ai.usage.total_tokens': 150,
          'gen_ai.usage.cached_tokens': 25,
        },
      };

      const usage = extractUsageFromSpan(span);
      expect(usage).toEqual({
        numRequests: 1,
        prompt: 100,
        completion: 50,
        total: 150,
        cached: 25,
      });
    });

    it('should extract completion details attributes', () => {
      const span: SpanData = {
        spanId: 'span-1',
        name: 'test',
        startTime: 0,
        attributes: {
          'gen_ai.usage.input_tokens': 100,
          'gen_ai.usage.output_tokens': 50,
          'gen_ai.usage.total_tokens': 150,
          'gen_ai.usage.reasoning_tokens': 20,
          'gen_ai.usage.accepted_prediction_tokens': 10,
          'gen_ai.usage.rejected_prediction_tokens': 5,
        },
      };

      const usage = extractUsageFromSpan(span);
      expect(usage).toEqual({
        numRequests: 1,
        prompt: 100,
        completion: 50,
        total: 150,
        completionDetails: {
          reasoning: 20,
          acceptedPrediction: 10,
          rejectedPrediction: 5,
        },
      });
    });

    it('should ignore non-numeric attribute values', () => {
      const span: SpanData = {
        spanId: 'span-1',
        name: 'test',
        startTime: 0,
        attributes: {
          'gen_ai.usage.input_tokens': 'not-a-number' as any,
          'gen_ai.usage.output_tokens': 50,
        },
      };

      const usage = extractUsageFromSpan(span);
      expect(usage).toEqual({
        numRequests: 1,
        completion: 50,
      });
    });
  });

  describe('aggregateUsageFromSpans', () => {
    it('should return empty usage for empty spans array', () => {
      const result = aggregateUsageFromSpans([]);
      expect(result).toEqual({
        prompt: 0,
        completion: 0,
        cached: 0,
        total: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
        assertions: {
          total: 0,
          prompt: 0,
          completion: 0,
          cached: 0,
          numRequests: 0,
          completionDetails: {
            reasoning: 0,
            acceptedPrediction: 0,
            rejectedPrediction: 0,
          },
        },
      });
    });

    it('should aggregate usage from multiple spans', () => {
      const spans: SpanData[] = [
        {
          spanId: 'span-1',
          name: 'chat gpt-4',
          startTime: 0,
          attributes: {
            'gen_ai.usage.input_tokens': 100,
            'gen_ai.usage.output_tokens': 50,
            'gen_ai.usage.total_tokens': 150,
          },
        },
        {
          spanId: 'span-2',
          name: 'chat gpt-4',
          startTime: 1000,
          attributes: {
            'gen_ai.usage.input_tokens': 200,
            'gen_ai.usage.output_tokens': 75,
            'gen_ai.usage.total_tokens': 275,
          },
        },
      ];

      const result = aggregateUsageFromSpans(spans);
      expect(result.prompt).toBe(300);
      expect(result.completion).toBe(125);
      expect(result.total).toBe(425);
      expect(result.numRequests).toBe(2);
    });

    it('should skip spans without usage attributes', () => {
      const spans: SpanData[] = [
        {
          spanId: 'span-1',
          name: 'internal-span',
          startTime: 0,
          attributes: {
            'some.other.attribute': 'value',
          },
        },
        {
          spanId: 'span-2',
          name: 'chat gpt-4',
          startTime: 1000,
          attributes: {
            'gen_ai.usage.input_tokens': 100,
            'gen_ai.usage.output_tokens': 50,
            'gen_ai.usage.total_tokens': 150,
          },
        },
      ];

      const result = aggregateUsageFromSpans(spans);
      expect(result.prompt).toBe(100);
      expect(result.completion).toBe(50);
      expect(result.total).toBe(150);
      expect(result.numRequests).toBe(1);
    });

    it('should aggregate completion details from multiple spans', () => {
      const spans: SpanData[] = [
        {
          spanId: 'span-1',
          name: 'chat o1',
          startTime: 0,
          attributes: {
            'gen_ai.usage.input_tokens': 100,
            'gen_ai.usage.output_tokens': 50,
            'gen_ai.usage.total_tokens': 150,
            'gen_ai.usage.reasoning_tokens': 20,
          },
        },
        {
          spanId: 'span-2',
          name: 'chat o1',
          startTime: 1000,
          attributes: {
            'gen_ai.usage.input_tokens': 100,
            'gen_ai.usage.output_tokens': 50,
            'gen_ai.usage.total_tokens': 150,
            'gen_ai.usage.reasoning_tokens': 30,
          },
        },
      ];

      const result = aggregateUsageFromSpans(spans);
      expect(result.completionDetails?.reasoning).toBe(50);
    });
  });

  describe('getTokenUsageFromTrace', () => {
    it('should fetch spans and aggregate usage', async () => {
      const spans: SpanData[] = [
        {
          spanId: 'span-1',
          name: 'chat gpt-4',
          startTime: 0,
          attributes: {
            'gen_ai.usage.input_tokens': 100,
            'gen_ai.usage.output_tokens': 50,
            'gen_ai.usage.total_tokens': 150,
          },
        },
      ];

      mockTraceStore.getSpans.mockResolvedValue(spans);

      const result = await getTokenUsageFromTrace('trace-123');

      expect(mockTraceStore.getSpans).toHaveBeenCalledWith('trace-123', {
        sanitizeAttributes: false,
        includeInternalSpans: true,
      });
      expect(result.prompt).toBe(100);
      expect(result.completion).toBe(50);
      expect(result.total).toBe(150);
    });
  });

  describe('getTokenUsageFromEvaluation', () => {
    it('should aggregate usage from all traces in evaluation', async () => {
      const traces = [
        {
          traceId: 'trace-1',
          spans: [
            {
              spanId: 'span-1',
              name: 'chat gpt-4',
              startTime: 0,
              attributes: {
                'gen_ai.usage.input_tokens': 100,
                'gen_ai.usage.output_tokens': 50,
                'gen_ai.usage.total_tokens': 150,
              },
            },
          ],
        },
        {
          traceId: 'trace-2',
          spans: [
            {
              spanId: 'span-2',
              name: 'chat claude-3',
              startTime: 0,
              attributes: {
                'gen_ai.usage.input_tokens': 200,
                'gen_ai.usage.output_tokens': 100,
                'gen_ai.usage.total_tokens': 300,
              },
            },
          ],
        },
      ];

      mockTraceStore.getTracesByEvaluation.mockResolvedValue(traces);

      const result = await getTokenUsageFromEvaluation('eval-456');

      expect(mockTraceStore.getTracesByEvaluation).toHaveBeenCalledWith('eval-456');
      expect(result.prompt).toBe(300);
      expect(result.completion).toBe(150);
      expect(result.total).toBe(450);
      expect(result.numRequests).toBe(2);
    });
  });

  describe('getTokenUsage', () => {
    it('should use OTEL data when traceId is provided', async () => {
      const spans: SpanData[] = [
        {
          spanId: 'span-1',
          name: 'chat gpt-4',
          startTime: 0,
          attributes: {
            'gen_ai.usage.input_tokens': 100,
            'gen_ai.usage.output_tokens': 50,
            'gen_ai.usage.total_tokens': 150,
          },
        },
      ];

      mockTraceStore.getSpans.mockResolvedValue(spans);

      const result = await getTokenUsage({ traceId: 'trace-123' });

      expect(mockTraceStore.getSpans).toHaveBeenCalled();
      expect(result.prompt).toBe(100);
    });

    it('should use OTEL data when evalId is provided', async () => {
      const traces = [
        {
          traceId: 'trace-1',
          spans: [
            {
              spanId: 'span-1',
              name: 'chat gpt-4',
              startTime: 0,
              attributes: {
                'gen_ai.usage.input_tokens': 100,
                'gen_ai.usage.output_tokens': 50,
                'gen_ai.usage.total_tokens': 150,
              },
            },
          ],
        },
      ];

      mockTraceStore.getTracesByEvaluation.mockResolvedValue(traces);

      const result = await getTokenUsage({ evalId: 'eval-456' });

      expect(mockTraceStore.getTracesByEvaluation).toHaveBeenCalled();
      expect(result.prompt).toBe(100);
    });

    it('should fall back to legacy tracker for providerId query', async () => {
      mockTracker.getProviderUsage.mockReturnValue({
        prompt: 500,
        completion: 200,
        total: 700,
        numRequests: 5,
      });

      const result = await getTokenUsage({ providerId: 'openai:gpt-4' });

      expect(mockTracker.getProviderUsage).toHaveBeenCalledWith('openai:gpt-4');
      expect(result.prompt).toBe(500);
    });

    it('should fall back to legacy tracker getTotalUsage for empty query', async () => {
      mockTracker.getTotalUsage.mockReturnValue({
        prompt: 1000,
        completion: 500,
        total: 1500,
        numRequests: 10,
      });

      const result = await getTokenUsage({});

      expect(mockTracker.getTotalUsage).toHaveBeenCalled();
      expect(result.total).toBe(1500);
    });

    it('should return empty usage when provider not found', async () => {
      mockTracker.getProviderUsage.mockReturnValue(undefined);

      const result = await getTokenUsage({ providerId: 'unknown-provider' });

      expect(result.numRequests).toBe(0);
    });
  });

  describe('getTokenUsageByProvider', () => {
    it('should group usage by provider ID', async () => {
      const spans: SpanData[] = [
        {
          spanId: 'span-1',
          name: 'chat gpt-4',
          startTime: 0,
          attributes: {
            'promptfoo.provider.id': 'openai:gpt-4',
            'gen_ai.usage.input_tokens': 100,
            'gen_ai.usage.output_tokens': 50,
            'gen_ai.usage.total_tokens': 150,
          },
        },
        {
          spanId: 'span-2',
          name: 'chat gpt-4',
          startTime: 1000,
          attributes: {
            'promptfoo.provider.id': 'openai:gpt-4',
            'gen_ai.usage.input_tokens': 100,
            'gen_ai.usage.output_tokens': 50,
            'gen_ai.usage.total_tokens': 150,
          },
        },
        {
          spanId: 'span-3',
          name: 'chat claude-3',
          startTime: 2000,
          attributes: {
            'promptfoo.provider.id': 'anthropic:claude-3-opus',
            'gen_ai.usage.input_tokens': 200,
            'gen_ai.usage.output_tokens': 100,
            'gen_ai.usage.total_tokens': 300,
          },
        },
      ];

      mockTraceStore.getSpans.mockResolvedValue(spans);

      const result = await getTokenUsageByProvider('trace-123');

      expect(result.size).toBe(2);
      expect(result.get('openai:gpt-4')?.total).toBe(300);
      expect(result.get('openai:gpt-4')?.numRequests).toBe(2);
      expect(result.get('anthropic:claude-3-opus')?.total).toBe(300);
      expect(result.get('anthropic:claude-3-opus')?.numRequests).toBe(1);
    });

    it('should skip spans without provider ID', async () => {
      const spans: SpanData[] = [
        {
          spanId: 'span-1',
          name: 'internal-span',
          startTime: 0,
          attributes: {
            'gen_ai.usage.input_tokens': 100,
            'gen_ai.usage.output_tokens': 50,
            'gen_ai.usage.total_tokens': 150,
          },
        },
        {
          spanId: 'span-2',
          name: 'chat gpt-4',
          startTime: 1000,
          attributes: {
            'promptfoo.provider.id': 'openai:gpt-4',
            'gen_ai.usage.input_tokens': 200,
            'gen_ai.usage.output_tokens': 100,
            'gen_ai.usage.total_tokens': 300,
          },
        },
      ];

      mockTraceStore.getSpans.mockResolvedValue(spans);

      const result = await getTokenUsageByProvider('trace-123');

      expect(result.size).toBe(1);
      expect(result.get('openai:gpt-4')?.total).toBe(300);
    });
  });

  describe('getTokenUsageByTestIndex', () => {
    it('should group usage by test index', async () => {
      const spans: SpanData[] = [
        {
          spanId: 'span-1',
          name: 'chat gpt-4',
          startTime: 0,
          attributes: {
            'promptfoo.test.index': 0,
            'gen_ai.usage.input_tokens': 100,
            'gen_ai.usage.output_tokens': 50,
            'gen_ai.usage.total_tokens': 150,
          },
        },
        {
          spanId: 'span-2',
          name: 'chat gpt-4',
          startTime: 1000,
          attributes: {
            'promptfoo.test.index': 0,
            'gen_ai.usage.input_tokens': 100,
            'gen_ai.usage.output_tokens': 50,
            'gen_ai.usage.total_tokens': 150,
          },
        },
        {
          spanId: 'span-3',
          name: 'chat gpt-4',
          startTime: 2000,
          attributes: {
            'promptfoo.test.index': 1,
            'gen_ai.usage.input_tokens': 200,
            'gen_ai.usage.output_tokens': 100,
            'gen_ai.usage.total_tokens': 300,
          },
        },
      ];

      mockTraceStore.getSpans.mockResolvedValue(spans);

      const result = await getTokenUsageByTestIndex('trace-123');

      expect(result.size).toBe(2);
      expect(result.get(0)?.total).toBe(300);
      expect(result.get(0)?.numRequests).toBe(2);
      expect(result.get(1)?.total).toBe(300);
      expect(result.get(1)?.numRequests).toBe(1);
    });

    it('should skip spans without test index', async () => {
      const spans: SpanData[] = [
        {
          spanId: 'span-1',
          name: 'synthesis-span',
          startTime: 0,
          attributes: {
            'gen_ai.usage.input_tokens': 100,
            'gen_ai.usage.output_tokens': 50,
            'gen_ai.usage.total_tokens': 150,
          },
        },
        {
          spanId: 'span-2',
          name: 'chat gpt-4',
          startTime: 1000,
          attributes: {
            'promptfoo.test.index': 0,
            'gen_ai.usage.input_tokens': 200,
            'gen_ai.usage.output_tokens': 100,
            'gen_ai.usage.total_tokens': 300,
          },
        },
      ];

      mockTraceStore.getSpans.mockResolvedValue(spans);

      const result = await getTokenUsageByTestIndex('trace-123');

      expect(result.size).toBe(1);
      expect(result.get(0)?.total).toBe(300);
    });
  });
});
