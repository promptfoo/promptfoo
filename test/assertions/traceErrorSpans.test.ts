import { handleTraceErrorSpans } from '../../src/assertions/traceErrorSpans';

import type { ApiProvider, AssertionParams, AtomicTestCase } from '../../src/types';
import type { TraceData } from '../../src/types/tracing';

const mockProvider: ApiProvider = {
  id: () => 'mock',
  callApi: async () => ({ output: 'mock' }),
};

const mockTraceDataWithErrors: TraceData = {
  traceId: 'test-trace-id',
  spans: [
    {
      spanId: 'span-1',
      name: 'http.request',
      startTime: 1000,
      endTime: 1500,
      statusCode: 200,
    },
    {
      spanId: 'span-2',
      name: 'api.call',
      startTime: 1600,
      endTime: 2000,
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    },
    {
      spanId: 'span-3',
      name: 'database.query',
      startTime: 2100,
      endTime: 2200,
      attributes: {
        error: true,
        'error.message': 'Connection timeout',
      },
    },
    {
      spanId: 'span-4',
      name: 'cache.get',
      startTime: 2300,
      endTime: 2400,
      attributes: {
        'http.status_code': 404,
      },
    },
    {
      spanId: 'span-5',
      name: 'service.process',
      startTime: 2500,
      endTime: 2600,
      attributes: {
        'otel.status_code': 'ERROR',
      },
    },
    {
      spanId: 'span-6',
      name: 'llm.completion',
      startTime: 2700,
      endTime: 3000,
      statusCode: 200,
    },
  ],
};

const defaultParams = {
  baseType: 'trace-error-spans' as const,
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

describe('handleTraceErrorSpans', () => {
  it('should pass when no errors exist and max_count is 0', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-error-spans',
        value: { max_count: 0 },
      },
      renderedValue: { max_count: 0 },
      context: {
        ...defaultParams.context,
        trace: {
          traceId: 'no-errors',
          spans: [
            { spanId: '1', name: 'op1', startTime: 0, endTime: 100, statusCode: 200 },
            { spanId: '2', name: 'op2', startTime: 100, endTime: 200, statusCode: 201 },
          ],
        },
      },
    };

    const result = handleTraceErrorSpans(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'No errors found in 2 spans matching pattern "*"',
      assertion: params.assertion,
    });
  });

  it('should fail when errors exceed max_count', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-error-spans',
        value: { max_count: 2 },
      },
      renderedValue: { max_count: 2 },
      context: {
        ...defaultParams.context,
        trace: mockTraceDataWithErrors,
      },
    };

    const result = handleTraceErrorSpans(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason:
        'Found 4 error spans, expected at most 2. Errors: api.call (Internal Server Error), database.query, cache.get and 1 more',
      assertion: params.assertion,
    });
  });

  it('should detect errors by status code', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-error-spans',
        value: { max_count: 0 },
      },
      renderedValue: { max_count: 0 },
      context: {
        ...defaultParams.context,
        trace: {
          traceId: 'status-errors',
          spans: [
            { spanId: '1', name: 'api.call', startTime: 0, endTime: 100, statusCode: 500 },
            { spanId: '2', name: 'api.call', startTime: 100, endTime: 200, statusCode: 403 },
          ],
        },
      },
    };

    const result = handleTraceErrorSpans(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason:
        'Found 2 error spans, expected at most 0. Errors: api.call (status: 500), api.call (status: 403)',
      assertion: params.assertion,
    });
  });

  it('should detect errors by attributes', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-error-spans',
        value: { max_count: 0 },
      },
      renderedValue: { max_count: 0 },
      context: {
        ...defaultParams.context,
        trace: {
          traceId: 'attr-errors',
          spans: [
            {
              spanId: '1',
              name: 'op1',
              startTime: 0,
              endTime: 100,
              attributes: { error: true },
            },
            {
              spanId: '2',
              name: 'op2',
              startTime: 100,
              endTime: 200,
              attributes: { exception: { type: 'RuntimeError', message: 'Failed' } },
            },
          ],
        },
      },
    };

    const result = handleTraceErrorSpans(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Found 2 error spans, expected at most 0. Errors: op1, op2',
      assertion: params.assertion,
    });
  });

  it('should check error percentage when max_percentage is specified', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-error-spans',
        value: { max_percentage: 50 },
      },
      renderedValue: { max_percentage: 50 },
      context: {
        ...defaultParams.context,
        trace: mockTraceDataWithErrors, // 4 errors out of 6 spans = 66.7%
      },
    };

    const result = handleTraceErrorSpans(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Error rate 66.7% exceeds threshold 50% (4 errors out of 6 spans)',
      assertion: params.assertion,
    });
  });

  it('should pass when error percentage is within limit', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-error-spans',
        value: { max_percentage: 70 },
      },
      renderedValue: { max_percentage: 70 },
      context: {
        ...defaultParams.context,
        trace: mockTraceDataWithErrors,
      },
    };

    const result = handleTraceErrorSpans(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Found 4 error(s) in 6 spans (66.7%), within threshold of 70%',
      assertion: params.assertion,
    });
  });

  it('should filter spans by pattern', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-error-spans',
        value: { pattern: '*api*', max_count: 0 },
      },
      renderedValue: { pattern: '*api*', max_count: 0 },
      context: {
        ...defaultParams.context,
        trace: mockTraceDataWithErrors,
      },
    };

    const result = handleTraceErrorSpans(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Found 1 error spans, expected at most 0. Errors: api.call (Internal Server Error)',
      assertion: params.assertion,
    });
  });

  it('should handle simple number value for backwards compatibility', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-error-spans',
        value: 1,
      },
      renderedValue: 1,
      context: {
        ...defaultParams.context,
        trace: mockTraceDataWithErrors,
      },
    };

    const result = handleTraceErrorSpans(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason:
        'Found 4 error spans, expected at most 1. Errors: api.call (Internal Server Error), database.query, cache.get and 1 more',
      assertion: params.assertion,
    });
  });

  it('should detect errors by status message', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-error-spans',
        value: { max_count: 0 },
      },
      renderedValue: { max_count: 0 },
      context: {
        ...defaultParams.context,
        trace: {
          traceId: 'msg-errors',
          spans: [
            {
              spanId: '1',
              name: 'op1',
              startTime: 0,
              endTime: 100,
              statusMessage: 'Operation failed due to timeout',
            },
            {
              spanId: '2',
              name: 'op2',
              startTime: 100,
              endTime: 200,
              statusMessage: 'Exception: NullPointerException',
            },
          ],
        },
      },
    };

    const result = handleTraceErrorSpans(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason:
        'Found 2 error spans, expected at most 0. Errors: op1 (Operation failed due to timeout), op2 (Exception: NullPointerException)',
      assertion: params.assertion,
    });
  });

  it('should fail when no trace data is available', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-error-spans',
        value: { max_count: 0 },
      },
      renderedValue: { max_count: 0 },
    };

    expect(() => handleTraceErrorSpans(params)).toThrow(
      'No trace data available for trace-error-spans assertion',
    );
  });

  it('should handle empty trace spans', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-error-spans',
        value: { max_count: 0 },
      },
      renderedValue: { max_count: 0 },
      context: {
        ...defaultParams.context,
        trace: { traceId: 'empty-trace', spans: [] },
      },
    };

    const result = handleTraceErrorSpans(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'No spans found matching pattern "*"',
      assertion: params.assertion,
    });
  });

  it('should default to max_count 0 when no value specified', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-error-spans',
        value: {},
      },
      renderedValue: {},
      context: {
        ...defaultParams.context,
        trace: mockTraceDataWithErrors,
      },
    };

    const result = handleTraceErrorSpans(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason:
        'Found 4 error spans, expected at most 0. Errors: api.call (Internal Server Error), database.query, cache.get and 1 more',
      assertion: params.assertion,
    });
  });

  it('should handle both max_count and max_percentage', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trace-error-spans',
        value: { max_count: 5, max_percentage: 50 },
      },
      renderedValue: { max_count: 5, max_percentage: 50 },
      context: {
        ...defaultParams.context,
        trace: mockTraceDataWithErrors, // 4 errors, 66.7%
      },
    };

    const result = handleTraceErrorSpans(params);
    // Should fail on percentage even though count is OK
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Error rate 66.7% exceeds threshold 50% (4 errors out of 6 spans)',
      assertion: params.assertion,
    });
  });
});
