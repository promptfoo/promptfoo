import { evaluate } from '../../src/evaluator';
import type Eval from '../../src/models/eval';
import { getTraceStore } from '../../src/tracing/store';
import type { TestSuite, EvaluateOptions } from '../../src/types';

// Mock dependencies
jest.mock('../../src/tracing/store');
jest.mock('../../src/tracing/otlpReceiver', () => ({
  startOTLPReceiver: jest.fn(),
  stopOTLPReceiver: jest.fn(),
}));

// Mock evaluatorTracing module
jest.mock('../../src/tracing/evaluatorTracing', () => ({
  generateTraceId: jest.fn(() => 'abcdef1234567890abcdef1234567890'),
  generateSpanId: jest.fn(() => '0123456789abcdef'),
  generateTraceparent: jest.fn((traceId, spanId) => `00-${traceId}-${spanId}-01`),
  generateTraceContextIfNeeded: jest.fn(),
  startOtlpReceiverIfNeeded: jest.fn(),
  stopOtlpReceiverIfNeeded: jest.fn(),
  isOtlpReceiverStarted: jest.fn(() => false),
  isTracingEnabled: jest.fn((test) => test.metadata?.tracingEnabled === true),
}));

describe('evaluator trace integration', () => {
  const mockTraceStore = {
    createTrace: jest.fn(),
    getTrace: jest.fn(),
  };

  const mockEval = {
    id: 'test-eval-id',
    addResult: jest.fn(),
    addPrompts: jest.fn(),
    fetchResultsByTestIdx: jest.fn(),
    setVars: jest.fn(),
    results: [],
    prompts: [],
    persisted: false,
    config: {
      outputPath: undefined,
    },
  } as unknown as Eval;

  beforeEach(() => {
    jest.clearAllMocks();
    (getTraceStore as jest.Mock).mockReturnValue(mockTraceStore);
  });

  it('should pass traceId through to assertions when tracing is enabled', async () => {
    // Mock trace creation and retrieval
    const testTraceId = 'abcdef1234567890abcdef1234567890';
    mockTraceStore.createTrace.mockResolvedValue(undefined);
    mockTraceStore.getTrace.mockResolvedValue({
      traceId: testTraceId,
      spans: [
        {
          spanId: 'test-span',
          name: 'test.operation',
          startTime: 1000,
          endTime: 2000,
        },
      ],
    });

    // Mock generateTraceContextIfNeeded
    const { generateTraceContextIfNeeded } = require('../../src/tracing/evaluatorTracing');
    generateTraceContextIfNeeded.mockResolvedValue({
      traceparent: `00-${testTraceId}-0123456789abcdef-01`,
      evaluationId: 'test-eval-id',
      testCaseId: 'test-case-id',
    });

    const testSuite: TestSuite = {
      providers: [
        {
          id: () => 'mock-provider',
          callApi: jest.fn().mockResolvedValue({
            output: 'Test response',
            tokenUsage: {},
          }),
        },
      ],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [
        {
          vars: { input: 'test' },
          metadata: {
            tracingEnabled: true,
            evaluationId: 'test-eval-id',
          },
          assert: [
            {
              type: 'javascript',
              value: `
                // Verify trace data is available
                if (!context.trace) return false;
                return context.trace.spans.length > 0 && 
                       context.trace.spans[0].name === 'test.operation';
              `,
            },
          ],
        },
      ],
      tracing: {
        enabled: true,
        otlp: {
          http: {
            enabled: true,
            port: 4318,
            host: '0.0.0.0',
            acceptFormats: ['application/x-protobuf'],
          },
        },
      },
    };

    const options: EvaluateOptions = {
      maxConcurrency: 1,
    };

    // Run evaluation
    await evaluate(testSuite, mockEval, options);

    // Verify trace context was generated
    expect(generateTraceContextIfNeeded).toHaveBeenCalled();

    // Verify trace was fetched for assertion
    expect(mockTraceStore.getTrace).toHaveBeenCalledWith(testTraceId);

    // Verify result was added with passing assertion
    expect(mockEval.addResult).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        score: 1,
      }),
    );
  });

  it('should handle assertions gracefully when tracing is disabled', async () => {
    // Mock generateTraceContextIfNeeded to return null when tracing is disabled
    const { generateTraceContextIfNeeded } = require('../../src/tracing/evaluatorTracing');
    generateTraceContextIfNeeded.mockResolvedValue(null);

    const testSuite: TestSuite = {
      providers: [
        {
          id: () => 'mock-provider',
          callApi: jest.fn().mockResolvedValue({
            output: 'Test response',
            tokenUsage: {},
          }),
        },
      ],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [
        {
          vars: { input: 'test' },
          // No tracingEnabled in metadata
          assert: [
            {
              type: 'javascript',
              value: `
                // Should pass when trace is undefined
                return context.trace === undefined && output === 'Test response';
              `,
            },
          ],
        },
      ],
      // Tracing not enabled in test suite
    };

    const options: EvaluateOptions = {
      maxConcurrency: 1,
    };

    // Run evaluation
    await evaluate(testSuite, mockEval, options);

    // Verify trace was NOT created or fetched
    expect(mockTraceStore.createTrace).not.toHaveBeenCalled();
    expect(mockTraceStore.getTrace).not.toHaveBeenCalled();

    // Verify result was added with passing assertion
    expect(mockEval.addResult).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        score: 1,
      }),
    );
  });

  it('should extract traceId correctly from traceparent header', async () => {
    const testTraceId = '0af7651916cd43dd8448eb211c80319c';
    const testSpanId = 'b7ad6b7169203331';

    // Mock the trace context generation
    const { generateTraceContextIfNeeded } = require('../../src/tracing/evaluatorTracing');
    generateTraceContextIfNeeded.mockResolvedValue({
      traceparent: `00-${testTraceId}-${testSpanId}-01`,
      evaluationId: 'test-eval-id',
      testCaseId: 'test-case-id',
    });

    mockTraceStore.createTrace.mockResolvedValue(undefined);
    mockTraceStore.getTrace.mockResolvedValue({
      traceId: testTraceId,
      spans: [
        {
          spanId: 'test-span',
          name: 'extracted.correctly',
          startTime: 1000,
          endTime: 2000,
        },
      ],
    });

    const testSuite: TestSuite = {
      providers: [
        {
          id: () => 'mock-provider',
          callApi: jest.fn().mockResolvedValue({
            output: 'Test response',
            tokenUsage: {},
          }),
        },
      ],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [
        {
          vars: { input: 'test' },
          metadata: {
            tracingEnabled: true,
            evaluationId: 'test-eval-id',
          },
          assert: [
            {
              type: 'javascript',
              value: `
                // Verify the extracted traceId matches
                return context.trace && context.trace.traceId === '${testTraceId}';
              `,
            },
          ],
        },
      ],
    };

    const options: EvaluateOptions = {
      maxConcurrency: 1,
    };

    // Run evaluation
    await evaluate(testSuite, mockEval, options);

    // Verify trace was fetched with the correct traceId
    expect(mockTraceStore.getTrace).toHaveBeenCalledWith(testTraceId);

    // Verify result was added with passing assertion
    expect(mockEval.addResult).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      }),
    );
  });
});
