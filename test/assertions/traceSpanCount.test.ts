import { handleTraceSpanCount } from '../../src/assertions/traceSpanCount';

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
      endTime: 1500,
    },
    {
      spanId: 'span-2',
      name: 'llm.chat',
      startTime: 1600,
      endTime: 2000,
    },
    {
      spanId: 'span-3',
      name: 'database.query',
      startTime: 2100,
      endTime: 2200,
    },
    {
      spanId: 'span-4',
      name: 'retrieval.search',
      startTime: 2300,
      endTime: 2400,
    },
    {
      spanId: 'span-5',
      name: 'api.external_call',
      startTime: 2500,
      endTime: 2600,
    },
  ],
};

const defaultParams = {
  baseType: 'trace-span-count' as const,
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

describe('handleTraceSpanCount', () => {
  it('should pass when span count is within max limit', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-count',
        value: { pattern: '*llm*', max: 3 },
      },
      renderedValue: { pattern: '*llm*', max: 3 },
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    const result = handleTraceSpanCount(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason:
        'Found 2 spans matching pattern "*llm*" (expected at most 3). Matched spans: llm.completion, llm.chat',
      assertion: params.assertion,
    });
  });

  it('should fail when span count exceeds max limit', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-count',
        value: { pattern: '*llm*', max: 1 },
      },
      renderedValue: { pattern: '*llm*', max: 1 },
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    const result = handleTraceSpanCount(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason:
        'Found 2 spans matching pattern "*llm*", expected at most 1. Matched spans: llm.completion, llm.chat',
      assertion: params.assertion,
    });
  });

  it('should pass when span count meets min requirement', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-count',
        value: { pattern: '*retrieval*', min: 1 },
      },
      renderedValue: { pattern: '*retrieval*', min: 1 },
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    const result = handleTraceSpanCount(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason:
        'Found 1 spans matching pattern "*retrieval*" (expected at least 1). Matched spans: retrieval.search',
      assertion: params.assertion,
    });
  });

  it('should fail when span count is below min requirement', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-count',
        value: { pattern: '*retrieval*', min: 2 },
      },
      renderedValue: { pattern: '*retrieval*', min: 2 },
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    const result = handleTraceSpanCount(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason:
        'Found 1 spans matching pattern "*retrieval*", expected at least 2. Matched spans: retrieval.search',
      assertion: params.assertion,
    });
  });

  it('should pass when span count is within min and max range', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-count',
        value: { pattern: '*', min: 3, max: 10 },
      },
      renderedValue: { pattern: '*', min: 3, max: 10 },
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    const result = handleTraceSpanCount(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason:
        'Found 5 spans matching pattern "*" (expected 3-10). Matched spans: llm.completion, llm.chat, database.query, retrieval.search, api.external_call',
      assertion: params.assertion,
    });
  });

  it('should handle patterns with ? wildcard', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-count',
        value: { pattern: 'llm.c?at', max: 1 },
      },
      renderedValue: { pattern: 'llm.c?at', max: 1 },
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    const result = handleTraceSpanCount(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason:
        'Found 1 spans matching pattern "llm.c?at" (expected at most 1). Matched spans: llm.chat',
      assertion: params.assertion,
    });
  });

  it('should handle case-insensitive matching', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-count',
        value: { pattern: '*LLM*', max: 5 },
      },
      renderedValue: { pattern: '*LLM*', max: 5 },
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    const result = handleTraceSpanCount(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason:
        'Found 2 spans matching pattern "*LLM*" (expected at most 5). Matched spans: llm.completion, llm.chat',
      assertion: params.assertion,
    });
  });

  it('should fail when no trace data is available', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-count',
        value: { pattern: '*', min: 1 },
      },
      renderedValue: { pattern: '*', min: 1 },
    };

    const result = handleTraceSpanCount(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'No trace data available for trace-span-count assertion',
      assertion: params.assertion,
    });
  });

  it('should handle empty trace spans', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-span-count',
        value: { pattern: '*', max: 0 },
      },
      renderedValue: { pattern: '*', max: 0 },
      context: {
        ...defaultParams.context,
        trace: { traceId: 'empty-trace', spans: [] },
      },
    };

    const result = handleTraceSpanCount(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Found 0 spans matching pattern "*" (expected at most 0)',
      assertion: params.assertion,
    });
  });

  it('should throw error for invalid value format', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'trace-span-count', value: 'invalid' },
      renderedValue: 'invalid',
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    expect(() => handleTraceSpanCount(params)).toThrow(
      'trace-span-count assertion must have a value object with pattern property',
    );
  });

  it('should throw error for missing pattern', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'trace-span-count', value: { max: 5 } },
      renderedValue: { max: 5 },
      context: {
        ...defaultParams.context,
        trace: mockTraceData,
      },
    };

    expect(() => handleTraceSpanCount(params)).toThrow(
      'trace-span-count assertion must have a value object with pattern property',
    );
  });
});
