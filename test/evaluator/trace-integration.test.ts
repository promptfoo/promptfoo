import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { evaluate, runEval } from '../../src/evaluator';
import logger from '../../src/logger';
import { nodeEvaluatorRuntime } from '../../src/node/evaluatorRuntime';
import { resolveTracingOptions } from '../../src/redteam/providers/tracingOptions';
import { getProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';
import * as evaluatorTracing from '../../src/tracing/evaluatorTracing';
import { getTraceStore } from '../../src/tracing/store';
import { createMockProvider } from '../factories/provider';

import type { EvaluatorRuntime } from '../../src/evaluator/runtime';
import type Eval from '../../src/models/eval';
import type EvalResult from '../../src/models/evalResult';
import type {
  ApiProvider,
  EvaluateOptions,
  RunEvalOptions,
  TestSuite,
} from '../../src/types/index';

// Mock dependencies
vi.mock('../../src/tracing/store');
const mockFlushOtel = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFetchTraceContext = vi.hoisted(() => vi.fn());
const mockInitializeOtel = vi.hoisted(() => vi.fn());
const mockShutdownOtel = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../src/tracing/otelSdk', () => ({
  flushOtel: mockFlushOtel,
  initializeOtel: mockInitializeOtel,
  shutdownOtel: mockShutdownOtel,
}));

vi.mock('../../src/tracing/otlpReceiver', () => ({
  startOTLPReceiver: vi.fn(),
  stopOTLPReceiver: vi.fn(),
}));

vi.mock('../../src/tracing/traceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/tracing/traceContext')>()),
  fetchTraceContext: mockFetchTraceContext,
}));

// Mock evaluatorTracing module
vi.mock('../../src/tracing/evaluatorTracing', () => ({
  generateTraceId: vi.fn(() => 'abcdef1234567890abcdef1234567890'),
  generateSpanId: vi.fn(() => '0123456789abcdef'),
  generateTraceparent: vi.fn((traceId, spanId) => `00-${traceId}-${spanId}-01`),
  generateTraceContextIfNeeded: vi.fn(),
  startOtlpReceiverIfNeeded: vi.fn(),
  stopOtlpReceiverIfNeeded: vi.fn(),
  isOtlpReceiverStarted: vi.fn(() => false),
  isTracingEnabled: vi.fn((test) => test.metadata?.tracingEnabled === true),
}));

describe('evaluator trace integration', () => {
  const mockTraceStore = {
    createTrace: vi.fn(),
    getTrace: vi.fn(),
  };

  const mockEval = {
    id: 'test-eval-id',
    addResult: vi.fn(),
    addPrompts: vi.fn(),
    fetchResultsByTestIdx: vi.fn(),
    setVars: vi.fn(),
    setDurationMs: vi.fn(),
    results: [],
    prompts: [],
    persisted: false,
    config: {
      outputPath: undefined,
    },
  } as unknown as Eval;

  beforeEach(() => {
    vi.resetAllMocks();
    (getTraceStore as Mock).mockReturnValue(mockTraceStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    vi.mocked(evaluatorTracing.generateTraceContextIfNeeded).mockResolvedValue({
      traceparent: `00-${testTraceId}-0123456789abcdef-01`,
      evaluationId: 'test-eval-id',
      testCaseId: 'test-case-id',
    });

    const testSuite: TestSuite = {
      providers: [
        createMockProvider({
          id: 'mock-provider',
          response: { output: 'Test response', tokenUsage: {} },
        }),
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
            acceptFormats: ['protobuf'],
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
    expect(evaluatorTracing.generateTraceContextIfNeeded).toHaveBeenCalled();
    expect(evaluatorTracing.startOtlpReceiverIfNeeded).toHaveBeenCalledWith(
      testSuite,
      'test-eval-id',
    );

    // Verify trace was fetched for assertion
    expect(mockTraceStore.getTrace).toHaveBeenCalledWith(testTraceId, {
      sanitizeAttributes: false,
    });
    expect(mockFlushOtel).toHaveBeenCalled();
    expect(mockShutdownOtel).toHaveBeenCalledOnce();

    // Verify result was added with passing assertion
    expect(mockEval.addResult).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        score: 1,
      }),
    );
  });

  it('closes writers but skips OTEL shutdown when initialization fails', async () => {
    const writer = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const runtime: EvaluatorRuntime<Eval, EvalResult> = {
      createEvaluationStore: nodeEvaluatorRuntime.createEvaluationStore,
      createResultWriters: vi.fn().mockReturnValue([writer]),
    };
    mockInitializeOtel.mockImplementationOnce(() => {
      throw new Error('otel unavailable');
    });

    await expect(
      evaluate(
        {
          providers: [],
          prompts: [],
          tests: [],
          tracing: { enabled: true },
        },
        mockEval,
        {},
        runtime,
      ),
    ).rejects.toThrow('otel unavailable');

    expect(writer.close).toHaveBeenCalledOnce();
    expect(mockFlushOtel).not.toHaveBeenCalled();
    expect(mockShutdownOtel).not.toHaveBeenCalled();
  });

  it('flushes and shuts down OTEL after successful tracing initialization', async () => {
    await evaluate(
      {
        providers: [
          createMockProvider({
            id: 'mock-provider',
            response: { output: 'Test response', tokenUsage: {} },
          }),
        ],
        prompts: [{ raw: 'Test prompt', label: 'test' }],
        tests: [{}],
        tracing: { enabled: true },
      },
      mockEval,
      {},
    );

    expect(mockInitializeOtel).toHaveBeenCalledOnce();
    expect(mockFlushOtel).toHaveBeenCalledOnce();
    expect(mockShutdownOtel).toHaveBeenCalledOnce();
  });

  it('should handle assertions gracefully when tracing is disabled', async () => {
    // Mock generateTraceContextIfNeeded to return null when tracing is disabled
    vi.mocked(evaluatorTracing.generateTraceContextIfNeeded).mockResolvedValue(null);

    const testSuite: TestSuite = {
      providers: [
        createMockProvider({
          id: 'mock-provider',
          response: { output: 'Test response', tokenUsage: {} },
        }),
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
    expect(mockFlushOtel).not.toHaveBeenCalled();
    expect(mockShutdownOtel).not.toHaveBeenCalled();

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
    vi.mocked(evaluatorTracing.generateTraceContextIfNeeded).mockResolvedValue({
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
        createMockProvider({
          id: 'mock-provider',
          response: { output: 'Test response', tokenUsage: {} },
        }),
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
    expect(mockTraceStore.getTrace).toHaveBeenCalledWith(testTraceId, {
      sanitizeAttributes: false,
    });

    // Verify result was added with passing assertion
    expect(mockEval.addResult).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      }),
    );
  });

  it('should still run evaluator cleanup when receiver startup is fatal', async () => {
    vi.mocked(evaluatorTracing.startOtlpReceiverIfNeeded).mockRejectedValueOnce(
      new Error('receiver failed'),
    );

    const testSuite: TestSuite = {
      providers: [],
      prompts: [],
      tests: [],
      tracing: {
        enabled: true,
        failOnReceiverStartFailure: true,
        otlp: {
          http: {
            enabled: true,
            port: 4318,
            host: '127.0.0.1',
          },
        },
      },
    };

    await expect(evaluate(testSuite, mockEval, {})).rejects.toThrow('receiver failed');
    expect(evaluatorTracing.stopOtlpReceiverIfNeeded).toHaveBeenCalled();
    expect(mockFlushOtel).not.toHaveBeenCalled();
    expect(mockShutdownOtel).not.toHaveBeenCalled();
  });

  describe('external trace collection after provider calls', () => {
    const traceId = 'abcdef1234567890abcdef1234567890';
    const providerConfig = { id: 'tempo' as const, endpoint: 'http://tempo:3200' };
    const externalTrace = {
      traceId,
      fetchedAt: 123,
      insights: [],
      spans: [
        {
          spanId: '0123456789abcdef',
          name: 'target.call',
          kind: 'client',
          startTime: 1000,
          attributes: {},
          status: { code: 'ok' as const },
          depth: 0,
          events: [],
        },
      ],
    };
    const tracingSuite: TestSuite = {
      providers: [],
      prompts: [],
      tests: [],
      tracing: {
        enabled: true,
        provider: providerConfig,
        queryDelay: 750,
        otlp: {
          http: { enabled: true, port: 4318, redactAttributes: ['secret'] },
        },
      },
    };

    function createRunOptions(
      provider: ApiProvider,
      overrides: Partial<RunEvalOptions> = {},
    ): RunEvalOptions {
      return {
        delay: 0,
        evalId: 'test-eval-id',
        isRedteam: false,
        prompt: { raw: 'Test prompt', label: 'test' },
        promptIdx: 0,
        provider,
        repeatIndex: 0,
        test: {
          metadata: { tracingEnabled: true, evaluationId: 'test-eval-id' },
        },
        testIdx: 0,
        testSuite: tracingSuite,
        ...overrides,
      };
    }

    beforeEach(() => {
      vi.mocked(evaluatorTracing.generateTraceContextIfNeeded).mockResolvedValue({
        traceparent: `00-${traceId}-0123456789abcdef-01`,
        evaluationId: 'test-eval-id',
        testCaseId: 'test-case-id',
      });
      mockFetchTraceContext.mockResolvedValue(externalTrace);
      mockTraceStore.getTrace.mockResolvedValue({
        traceId,
        evaluationId: 'test-eval-id',
        testCaseId: 'test-case-id',
        spans: externalTrace.spans,
      });
    });

    it('fetches external traces before running trace-aware assertions', async () => {
      const provider = createMockProvider({ response: { output: 'Target output' } });
      const options = createRunOptions(provider);
      options.test.assert = [{ type: 'javascript', value: 'Boolean(context.trace)' }];

      const [result] = await runEval(options);

      expect(result.success).toBe(true);
      expect(mockFetchTraceContext).toHaveBeenCalledWith(
        traceId,
        expect.objectContaining({
          providerConfig,
          queryDelay: 750,
          maxRetries: 5,
          retryDelayMs: 1000,
          redactAttributes: ['secret'],
        }),
      );
      expect(mockFlushOtel).toHaveBeenCalledOnce();
      expect(mockFlushOtel.mock.invocationCallOrder[0]).toBeLessThan(
        mockFetchTraceContext.mock.invocationCallOrder[0],
      );
      expect(mockFetchTraceContext.mock.invocationCallOrder[0]).toBeLessThan(
        mockTraceStore.getTrace.mock.invocationCallOrder[0],
      );
    });

    it('attributes the trace to the provider override that handles the test', async () => {
      const configuredProvider = createMockProvider({ id: 'configured-provider' });
      const overrideProvider = createMockProvider({
        id: 'override-provider',
        response: { output: 'Override response' },
      });
      const options = createRunOptions(configuredProvider);
      options.test.provider = overrideProvider;

      const [result] = await runEval(options);

      expect(result.response?.output).toBe('Override response');
      expect(overrideProvider.callApi).toHaveBeenCalledOnce();
      expect(configuredProvider.callApi).not.toHaveBeenCalled();
      expect(evaluatorTracing.generateTraceContextIfNeeded).toHaveBeenCalledWith(
        options.test,
        undefined,
        options.testIdx,
        options.promptIdx,
        options.testSuite,
        expect.objectContaining({ providerId: 'override-provider' }),
      );
    });

    it('passes the real evaluation test index to the active provider', async () => {
      const provider = createMockProvider({ response: { output: 'Target output' } });
      const options = createRunOptions(provider, { testIdx: 7 });

      await runEval(options);

      expect(provider.callApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ testIdx: 7 }),
        undefined,
      );
    });

    it('scopes the real evaluation test index to grading without adding user variables', async () => {
      let activeTestIndex: number | undefined;
      const provider = createMockProvider({
        callApi: async () => {
          activeTestIndex = getProviderCallTracingContext()?.testIndex;
          return { output: 'Target output' };
        },
      });
      const options = createRunOptions(provider, { testIdx: 7 });
      options.test.vars = { input: 'ordinary user variable' };

      await runEval(options);

      expect(activeTestIndex).toBe(7);
      expect(options.test.vars).toEqual({ input: 'ordinary user variable' });
    });

    it('renders trace-provider credentials and suite environment overrides for programmatic evals', async () => {
      const provider = createMockProvider({ response: { output: 'Target output' } });
      const programmaticSuite: TestSuite = {
        ...tracingSuite,
        env: { TEMPO_READER_TOKEN: 'programmatic-tempo-secret' } as TestSuite['env'],
        providers: [provider],
        prompts: [{ raw: 'Test prompt', label: 'test' }],
        tests: [{ metadata: { tracingEnabled: true, evaluationId: 'test-eval-id' } }],
        tracing: {
          ...tracingSuite.tracing!,
          provider: {
            ...providerConfig,
            auth: { token: '{{ env.TEMPO_READER_TOKEN }}' },
            headers: { 'X-Tempo-Reader': '{{ env.TEMPO_READER_TOKEN }}' },
          },
        },
      };

      await evaluate(programmaticSuite, mockEval, { maxConcurrency: 1 });

      expect(mockFetchTraceContext).toHaveBeenCalledWith(
        traceId,
        expect.objectContaining({
          providerConfig: expect.objectContaining({
            auth: { token: 'programmatic-tempo-secret' },
            headers: { 'X-Tempo-Reader': 'programmatic-tempo-secret' },
          }),
        }),
      );
      expect(programmaticSuite.tracing?.provider?.auth?.token).toBe('{{ env.TEMPO_READER_TOKEN }}');
    });

    it('resolves chained config-local credential references for programmatic evals', async () => {
      const provider = createMockProvider({ response: { output: 'Target output' } });
      const programmaticSuite: TestSuite = {
        ...tracingSuite,
        env: {
          TEMPO_READER: '{{ env.TEMPO_INTERMEDIATE }}',
          TEMPO_INTERMEDIATE: '{{ env.TEMPO_SOURCE_SECRET }}',
          TEMPO_SOURCE_SECRET: 'programmatic-chained-secret',
        } as TestSuite['env'],
        providers: [provider],
        prompts: [{ raw: 'Test prompt', label: 'test' }],
        tests: [{ metadata: { tracingEnabled: true, evaluationId: 'test-eval-id' } }],
        tracing: {
          ...tracingSuite.tracing!,
          provider: {
            ...providerConfig,
            auth: { token: '{{ env.TEMPO_READER }}' },
            headers: { 'X-Tempo-Reader': '{{ env.TEMPO_READER }}' },
          },
        },
      };

      await evaluate(programmaticSuite, mockEval, { maxConcurrency: 1 });

      expect(mockFetchTraceContext).toHaveBeenCalledWith(
        traceId,
        expect.objectContaining({
          providerConfig: expect.objectContaining({
            auth: { token: 'programmatic-chained-secret' },
            headers: { 'X-Tempo-Reader': 'programmatic-chained-secret' },
          }),
        }),
      );
      expect(programmaticSuite.env).toEqual({
        TEMPO_READER: '{{ env.TEMPO_INTERMEDIATE }}',
        TEMPO_INTERMEDIATE: '{{ env.TEMPO_SOURCE_SECRET }}',
        TEMPO_SOURCE_SECRET: 'programmatic-chained-secret',
      });
    });

    it('makes request-scoped tracing configuration available without exposing it in provider context', async () => {
      const requestProviderConfig = {
        ...providerConfig,
        auth: { token: 'request-scoped-secret' },
      };
      const capturedTracingOptions = vi.fn();
      const provider = createMockProvider({
        async callApi(_prompt, context) {
          capturedTracingOptions(
            resolveTracingOptions({ strategyId: 'jailbreak', test: context?.test }),
          );
          expect(context).not.toHaveProperty('tracingConfig');
          return { output: 'Target output' };
        },
      });

      const [result] = await runEval(
        createRunOptions(provider, {
          testSuite: {
            ...tracingSuite,
            tracing: { ...tracingSuite.tracing!, provider: requestProviderConfig },
          },
        }),
      );

      expect(result.success).toBe(true);
      expect(capturedTracingOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: requestProviderConfig,
          queryDelay: 750,
          redactAttributes: ['secret'],
        }),
      );
    });

    it.each([
      { name: 'provider-reported errors', response: { error: 'Target returned HTTP 500' } },
      { name: 'missing output', response: {} },
      { name: 'null output', response: { output: null } },
    ])('fetches external traces for $name without grading retries', async ({ response }) => {
      const provider = createMockProvider({ response });
      const options = createRunOptions(provider);
      options.test.assert = [{ type: 'trace-error-spans' }];

      const [result] = await runEval(options);

      expect(result.success).toBe(false);
      expect(mockFetchTraceContext).toHaveBeenCalledWith(
        traceId,
        expect.objectContaining({ maxRetries: 0, queryDelay: 750 }),
      );
      expect(mockFlushOtel).not.toHaveBeenCalled();
    });

    it('fetches external traces when the provider throws', async () => {
      const provider = createMockProvider({
        callApi: async () => {
          throw new Error('Target connection failed');
        },
      });

      const [result] = await runEval(createRunOptions(provider));

      expect(result.error).toContain('Target connection failed');
      expect(result.traceId).toBe(traceId);
      expect(mockFetchTraceContext).toHaveBeenCalledWith(
        traceId,
        expect.objectContaining({ maxRetries: 0, queryDelay: 750 }),
      );
    });

    it('preserves the original provider error when trace collection also fails', async () => {
      const warning = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
      const provider = createMockProvider({
        callApi: async () => {
          throw new Error('Original provider failure');
        },
      });
      mockFetchTraceContext.mockRejectedValueOnce(new Error('Tempo unavailable'));

      const [result] = await runEval(createRunOptions(provider));

      expect(result.error).toContain('Original provider failure');
      expect(result.error).not.toContain('Tempo unavailable');
      expect(warning).toHaveBeenCalledWith(
        '[Evaluator] Failed to fetch external traces: Error: Tempo unavailable',
      );
    });

    it('preserves successful provider responses when trace collection fails', async () => {
      const warning = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
      const provider = createMockProvider({ response: { output: 'Target output' } });
      mockFetchTraceContext.mockRejectedValueOnce(new Error('Tempo unavailable'));

      const [result] = await runEval(createRunOptions(provider));

      expect(result.success).toBe(true);
      expect(result.response?.output).toBe('Target output');
      expect(warning).toHaveBeenCalledWith(
        '[Evaluator] Failed to fetch external traces: Error: Tempo unavailable',
      );
    });

    it('distinguishes missing external traces from successful fetches', async () => {
      const debug = vi.spyOn(logger, 'debug').mockImplementation(() => logger);
      const provider = createMockProvider({ response: { output: 'Target output' } });
      mockFetchTraceContext.mockResolvedValueOnce(null);

      await runEval(createRunOptions(provider));

      expect(debug).toHaveBeenCalledWith(
        `[Evaluator] No external traces found for traceId=${traceId}`,
      );
      expect(debug).not.toHaveBeenCalledWith(
        `[Evaluator] Successfully fetched traces for traceId=${traceId}`,
      );
    });

    it('skips external trace collection for cached provider responses', async () => {
      const provider = createMockProvider({
        response: { output: 'Cached output', cached: true },
      });

      const [result] = await runEval(createRunOptions(provider));

      expect(result.response?.cached).toBe(true);
      expect(mockFetchTraceContext).not.toHaveBeenCalled();
    });

    it('skips external trace collection when no provider is invoked', async () => {
      const provider = createMockProvider();
      const options = createRunOptions(provider);
      options.test.providerOutput = 'Precomputed output';

      const [result] = await runEval(options);

      expect(result.response?.output).toBe('Precomputed output');
      expect(provider.callApi).not.toHaveBeenCalled();
      expect(mockFetchTraceContext).not.toHaveBeenCalled();
    });

    it('skips external trace collection after an evaluation is canceled', async () => {
      const controller = new AbortController();
      const provider = createMockProvider({
        callApi: async () => {
          controller.abort();
          return { output: 'Target output' };
        },
      });

      await runEval(createRunOptions(provider, { abortSignal: controller.signal }));

      expect(mockFetchTraceContext).not.toHaveBeenCalled();
    });

    it('propagates cancellation during external trace collection', async () => {
      const controller = new AbortController();
      const provider = createMockProvider({ response: { output: 'Target output' } });
      mockFetchTraceContext.mockImplementationOnce(async () => {
        controller.abort();
        throw new Error('cancelled by user');
      });

      const [result] = await runEval(
        createRunOptions(provider, { abortSignal: controller.signal }),
      );

      expect(result.error).toContain('cancelled by user');
      expect(mockFetchTraceContext).toHaveBeenCalledWith(
        traceId,
        expect.objectContaining({ abortSignal: controller.signal }),
      );
    });

    it('does not include trace collection time in provider latency', async () => {
      vi.useFakeTimers();
      try {
        const provider = createMockProvider({
          callApi: async () => {
            vi.advanceTimersByTime(50);
            return { output: 'Target output' };
          },
        });
        mockFetchTraceContext.mockImplementationOnce(async () => {
          vi.advanceTimersByTime(3000);
          return externalTrace;
        });

        const [result] = await runEval(createRunOptions(provider));

        expect(result.latencyMs).toBe(50);
      } finally {
        vi.useRealTimers();
      }
    });

    it('collects external traces after releasing the provider rate limiter', async () => {
      let providerCallActive = false;
      const rateLimitRegistry = {
        execute: vi.fn(async (_provider, call) => {
          providerCallActive = true;
          try {
            return await call();
          } finally {
            providerCallActive = false;
          }
        }),
        dispose: vi.fn(),
      } satisfies NonNullable<RunEvalOptions['rateLimitRegistry']>;
      const provider = createMockProvider({ response: { output: 'Target output' } });
      mockFetchTraceContext.mockImplementationOnce(async () => {
        expect(providerCallActive).toBe(false);
        return externalTrace;
      });

      const [result] = await runEval(createRunOptions(provider, { rateLimitRegistry }));

      expect(result.success).toBe(true);
      expect(rateLimitRegistry.execute).toHaveBeenCalledOnce();
      expect(mockFetchTraceContext).toHaveBeenCalledOnce();
    });

    it('does not fetch traces when the rate limiter fails before invoking the provider', async () => {
      const rateLimitRegistry = {
        execute: vi.fn(async () => {
          throw new Error('Rate-limit queue failed');
        }),
        dispose: vi.fn(),
      } satisfies NonNullable<RunEvalOptions['rateLimitRegistry']>;
      const provider = createMockProvider({ response: { output: 'Target output' } });

      const [result] = await runEval(createRunOptions(provider, { rateLimitRegistry }));

      expect(result.error).toContain('Rate-limit queue failed');
      expect(provider.callApi).not.toHaveBeenCalled();
      expect(mockFetchTraceContext).not.toHaveBeenCalled();
    });
  });
});
