import { handleTraceSpanDuration } from '../../src/assertions/traceSpanDuration';

import type { ApiProvider, AssertionParams, AtomicTestCase } from '../../src/types';
import type { TraceData } from '../../src/types/tracing';

const mockProvider: ApiProvider = {
  id: () => 'mock',
  callApi: async () => ({ output: 'mock' }),
};

const mockTraceData: TraceData = {
  traceId: 'test-trace-id',
  spans: [
    {
      spanId: 'span-1',
      name: 'llm.completion',
      startTime: 1000,
      endTime: 1500, // 500ms
    },
    {
      spanId: 'span-2',
      name: 'llm.chat',
      startTime: 1600,
      endTime: 2800, // 1200ms
    },
    {
      spanId: 'span-3',
      name: 'database.query',
      startTime: 2900,
      endTime: 2950, // 50ms
    },
    {
      spanId: 'span-4',
      name: 'api.external',
      startTime: 3000,
      endTime: 6000, // 3000ms - slow!
    },
    {
      spanId: 'span-5',
      name: 'cache.lookup',
      startTime: 6100,
      endTime: 6105, // 5ms
    },
  ],
};

const defaultParams = {
  baseType: 'trace-span-duration' as const,
  context: {
    vars: {},
    test: {} as AtomicTestCase,
    prompt: 'test prompt',
    logProbs: undefined,
    provider: mockProvider,
    providerResponse: { output: 'test output' },
  },
  output: 'test output',
  outputString: 'test output',
  providerResponse: { output: 'test output' },
  test: {} as AtomicTestCase,
  inverse: false,
};

describe('handleTraceSpanDuration', () => {
  it('should pass when all spans are within duration limit', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-duration',
        value: { max: 1500 },
      },
      renderedValue: { max: 1500 },
      context: {
        ...defaultParams.context,
        trace: {
          traceId: 'fast-trace',
          spans: [
            { spanId: '1', name: 'fast.op1', startTime: 0, endTime: 100 },
            { spanId: '2', name: 'fast.op2', startTime: 100, endTime: 500 },
            { spanId: '3', name: 'fast.op3', startTime: 500, endTime: 1000 },
          ],
        },
      },
    };

    const result = handleTraceSpanDuration(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'All 3 spans matching pattern "*" completed within 1500ms (max: 500ms)',
      assertion: params.assertion,
    });
  });

  it('should fail when some spans exceed duration limit', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-duration',
        value: { max: 1000 },
      },
      renderedValue: { max: 1000 },
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    const result = handleTraceSpanDuration(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason:
        '2 span(s) exceed duration threshold 1000ms. Slowest: api.external (3000ms), llm.chat (1200ms)',
      assertion: params.assertion,
    });
  });

  it('should filter spans by pattern', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-duration',
        value: { pattern: '*llm*', max: 1000 },
      },
      renderedValue: { pattern: '*llm*', max: 1000 },
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    const result = handleTraceSpanDuration(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: '1 span(s) exceed duration threshold 1000ms. Slowest: llm.chat (1200ms)',
      assertion: params.assertion,
    });
  });

  it('should check percentile duration when specified', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-duration',
        value: { max: 2000, percentile: 90 },
      },
      renderedValue: { max: 2000, percentile: 90 },
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    const result = handleTraceSpanDuration(params);
    // 90th percentile of [5, 50, 500, 1200, 3000] = 3000ms
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason:
        '90th percentile duration (3000ms) exceeds threshold 2000ms. Slowest spans: api.external (3000ms)',
      assertion: params.assertion,
    });
  });

  it('should pass when percentile duration is within limit', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-duration',
        value: { max: 1500, percentile: 50 },
      },
      renderedValue: { max: 1500, percentile: 50 },
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    const result = handleTraceSpanDuration(params);
    // 50th percentile (median) of [5, 50, 500, 1200, 3000] = 500ms
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: '50th percentile duration (500ms) is within threshold 1500ms',
      assertion: params.assertion,
    });
  });

  it('should handle spans without endTime', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-duration',
        value: { max: 1000 },
      },
      renderedValue: { max: 1000 },
      context: {
        ...defaultParams.context,
        trace: {
          traceId: 'incomplete-trace',
          spans: [
            { spanId: '1', name: 'complete.op', startTime: 0, endTime: 500 },
            { spanId: '2', name: 'incomplete.op', startTime: 600 }, // No endTime
          ],
        },
      },
    };

    const result = handleTraceSpanDuration(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'All 1 spans matching pattern "*" completed within 1000ms (max: 500ms)',
      assertion: params.assertion,
    });
  });

  it('should handle empty trace spans', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-duration',
        value: { max: 1000 },
      },
      renderedValue: { max: 1000 },
      context: {
        ...defaultParams.context,
        trace: { traceId: 'empty-trace', spans: [] },
      },
    };

    const result = handleTraceSpanDuration(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'No spans found matching pattern "*" with complete timing data',
      assertion: params.assertion,
    });
  });

  it('should fail when no trace data is available', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-duration',
        value: { max: 1000 },
      },
      renderedValue: { max: 1000 },
    };

    expect(() => handleTraceSpanDuration(params)).toThrow(
      'No trace data available for trace-span-duration assertion',
    );
  });

  it('should show top 3 slowest spans when limit exceeded', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-duration',
        value: { max: 100 },
      },
      renderedValue: { max: 100 },
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    const result = handleTraceSpanDuration(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason:
        '3 span(s) exceed duration threshold 100ms. Slowest: api.external (3000ms), llm.chat (1200ms), llm.completion (500ms)',
      assertion: params.assertion,
    });
  });

  it('should throw error for invalid value format', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'trace-span-duration', value: 'invalid' },
      renderedValue: 'invalid',
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    expect(() => handleTraceSpanDuration(params)).toThrow(
      'trace-span-duration assertion must have a value object with max property',
    );
  });

  it('should throw error for missing max property', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'trace-span-duration', value: { pattern: '*' } },
      renderedValue: { pattern: '*' },
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    expect(() => handleTraceSpanDuration(params)).toThrow(
      'trace-span-duration assertion must have a value object with max property',
    );
  });

  it('should handle edge case with single span for percentile', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-duration',
        value: { max: 1000, percentile: 95 },
      },
      renderedValue: { max: 1000, percentile: 95 },
      context: {
        ...defaultParams.context,
        trace: {
          traceId: 'single-span',
          spans: [{ spanId: '1', name: 'single.op', startTime: 0, endTime: 750 }],
        },
      },
    };

    const result = handleTraceSpanDuration(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: '95th percentile duration (750ms) is within threshold 1000ms',
      assertion: params.assertion,
    });
  });
});
