import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertions } from '../../src/assertions';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';
import { withProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';

import type { ApiProvider, Assertion, AtomicTestCase, ProviderResponse } from '../../src/types';

// Lazily-mocked trace store: runAssertions only reaches getTraceStore().getTrace
// when a *reached* trace-aware assertion needs trace context.
const { getTraceMock, flushOtelMock } = vi.hoisted(() => ({
  getTraceMock: vi.fn(),
  flushOtelMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/tracing/otelSdk', () => ({ flushOtel: flushOtelMock }));
vi.mock('../../src/tracing/store', () => ({
  getTraceStore: () => ({ getTrace: getTraceMock }),
}));

// Force the METEOR optional-dependency import to fail so we can exercise the
// missing-dependency path deterministically even though `natural` is installed.
vi.mock('../../src/assertions/meteor', () => ({
  handleMeteorAssertion: () => {
    throw new Error("Cannot find module 'natural'");
  },
}));

vi.mock('../../src/cliState', () => ({
  default: { basePath: '/base/path' },
}));

const mockProviderResponse: ProviderResponse = {
  output: 'test output',
  tokenUsage: { total: 10, prompt: 5, completion: 5 },
};

const createTestCase = (
  assertions: Assertion[],
  options?: AtomicTestCase['options'],
): AtomicTestCase => ({
  assert: assertions,
  vars: {},
  ...(options ? { options } : {}),
});

describe('Fallback grading contracts', () => {
  it('stops after a context-recall response without attribution verdicts', async () => {
    const grader: ApiProvider = {
      id: () => 'malformed-recall',
      callApi: vi.fn().mockResolvedValue({ output: 'Unable to classify this answer.' }),
    };
    const result = await runAssertions({
      prompt: 'Paris is the capital of France.',
      test: createTestCase(
        [
          { type: 'context-recall', value: 'Paris', threshold: 0.5, fallback: 'next' },
          { type: 'contains', value: 'test' },
        ],
        { provider: grader },
      ),
      providerResponse: mockProviderResponse,
    });
    expect(result.pass).toBe(false);
    expect(result.componentResults).toHaveLength(1);
    expect(result.componentResults?.[0].metadata?.graderError).toBe(true);
  });

  it.each([false, true])(
    'preserves detailed fallback usage with a cached primary: %s',
    async (primaryCached) => {
      const primaryUsage = {
        total: 10,
        prompt: 6,
        completion: 4,
        numRequests: 1,
        completionDetails: { reasoning: 2, cacheReadInputTokens: 3 },
      };
      const terminalUsage = {
        total: 20,
        prompt: 15,
        completion: 5,
        numRequests: 1,
        completionDetails: { reasoning: 3 },
      };
      const grader: ApiProvider = {
        id: () => 'usage-grader',
        callApi: vi
          .fn()
          .mockResolvedValueOnce({
            output: '{"pass":false,"score":0}',
            tokenUsage: primaryUsage,
            cached: primaryCached,
          })
          .mockResolvedValueOnce({
            output: '{"pass":true,"score":1}',
            tokenUsage: terminalUsage,
            cached: !primaryCached,
          }),
      };
      const result = await runAssertions({
        test: createTestCase(
          [
            { type: 'llm-rubric', value: 'first criterion', fallback: 'next' },
            { type: 'llm-rubric', value: 'second criterion' },
          ],
          { provider: grader },
        ),
        providerResponse: mockProviderResponse,
      });
      expect(result.pass).toBe(true);
      expect(result.tokensUsed).toMatchObject({
        total: 30,
        prompt: 21,
        completion: 9,
        numRequests: 2,
        cached: primaryCached ? 10 : 20,
        completionDetails: { reasoning: 5, cacheReadInputTokens: 3 },
        incurredTokenUsage: primaryCached ? terminalUsage : primaryUsage,
      });
      expect(result.componentResults?.[0].metadata?.cachedResponse).toBe(false);
      expect(primaryUsage.completionDetails).toEqual({ reasoning: 2, cacheReadInputTokens: 3 });
      expect(terminalUsage.completionDetails).toEqual({ reasoning: 3 });
    },
  );

  it('preserves the active grader span when calling a fallback grader', async () => {
    const traceId = '11111111111111111111111111111111';
    const traceparent = `00-${traceId}-2222222222222222-01`;
    const callApi = vi.fn().mockResolvedValue({ output: '{"pass":true,"score":1}' });
    const grader: ApiProvider = { id: () => 'traced-grader', callApi };
    await withProviderCallTracingContext(
      {
        getActiveTraceparent: () => traceparent,
        withGraderSpan: async (_options, invoke) => invoke(),
        withProviderSpan: async ({ callContext }, invoke) => invoke(callContext),
      },
      () =>
        runAssertions({
          traceId,
          provider: grader,
          test: createTestCase(
            [
              { type: 'contains', value: 'missing', fallback: 'next' },
              { type: 'llm-rubric', value: 'criterion' },
            ],
            { provider: grader },
          ),
          providerResponse: mockProviderResponse,
        }),
    );
    expect(callApi.mock.calls[0][1].traceparent).toBe(traceparent);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  getTraceMock.mockReset();
  flushOtelMock.mockReset().mockResolvedValue(undefined);
  vi.useRealTimers();
});

/**
 * SECURITY CONTRACT: a grader outage (provider/transport/timeout error) must
 * fail CLOSED. A fallback that would otherwise pass must never mask a broken
 * grader.
 */
describe('Fallback chains fail closed on grader outages (P1)', () => {
  beforeEach(() => {
    // Every text grader (llm-rubric, factuality, model-graded-closedqa) resolves
    // to the default grading provider; simulate a total provider outage.
    vi.spyOn(DefaultGradingProvider, 'callApi').mockResolvedValue({
      error: 'grader unavailable',
    } as never);
  });

  const erroringClassificationProvider: ApiProvider = {
    id: () => 'erroring-classifier',
    callApi: async () => ({ error: 'classifier unavailable' }),
    callClassificationApi: async () => ({ error: 'classifier unavailable' }),
  };

  const graderCases: Array<{
    name: string;
    primary: Assertion;
    options?: AtomicTestCase['options'];
    vars?: Record<string, string>;
  }> = [
    {
      name: 'llm-rubric',
      primary: { type: 'llm-rubric', value: 'must be helpful', fallback: 'next' },
    },
    {
      name: 'factuality',
      primary: { type: 'factuality', value: 'the expected answer', fallback: 'next' },
    },
    {
      name: 'model-graded-closedqa',
      primary: { type: 'model-graded-closedqa', value: 'meets the criterion', fallback: 'next' },
    },
    {
      name: 'classifier',
      primary: { type: 'classifier', value: 'toxic', fallback: 'next' },
      options: { provider: erroringClassificationProvider },
    },
    {
      name: 'not-classifier',
      primary: { type: 'not-classifier', value: 'toxic', fallback: 'next' },
      options: { provider: erroringClassificationProvider },
    },
    {
      name: 'similar array',
      primary: { type: 'similar', value: ['first', 'second'], fallback: 'next' },
      options: {
        provider: {
          id: () => 'erroring-similarity',
          callApi: async () => ({ error: 'similarity unavailable' }),
          callSimilarityApi: async () => ({ error: 'similarity unavailable' }),
        },
      },
    },
    {
      name: 'context-faithfulness',
      primary: { type: 'context-faithfulness', fallback: 'next' },
      vars: { query: 'question', context: 'document' },
    },
  ];

  it.each(graderCases)(
    'does not let a passing fallback mask a $name grader outage',
    async ({ primary, options, vars }) => {
      const assertions: Assertion[] = [
        primary,
        // A `contains` that WOULD pass on the output. It must not run / must not
        // mask the grader outage.
        { type: 'contains', value: 'test' },
      ];

      const result = await runAssertions({
        prompt: 'some prompt',
        test: { ...createTestCase(assertions, options), ...(vars && { vars }) },
        providerResponse: mockProviderResponse,
      });

      // Fail closed: the grader outage terminates the chain.
      expect(result.pass).toBe(false);

      const graderComponent = result.componentResults?.find(
        (component) => component.metadata?.graderError === true,
      );
      expect(graderComponent).toBeDefined();
      expect(graderComponent?.pass).toBe(false);

      // The passing `contains` fallback never contributed a passing result.
      const passingContains = result.componentResults?.some(
        (component) => component.assertion?.type === 'contains' && component.pass,
      );
      expect(passingContains).toBe(false);
    },
  );

  it.each(['factuality', 'model-graded-closedqa'] as const)(
    'does not mask a malformed %s grader response',
    async (type) => {
      vi.mocked(DefaultGradingProvider.callApi).mockResolvedValueOnce({
        output: 'no structured verdict',
      });
      const result = await runAssertions({
        prompt: 'some prompt',
        test: createTestCase([
          { type, value: 'criterion', fallback: 'next' },
          { type: 'contains', value: 'test' },
        ]),
        providerResponse: mockProviderResponse,
      });
      expect(result.pass).toBe(false);
      expect(result.componentResults?.[0].metadata?.graderError).toBe(true);
      expect(result.componentResults).toHaveLength(1);
    },
  );

  it('keeps context-faithfulness errors from its second grader call terminal', async () => {
    vi.mocked(DefaultGradingProvider.callApi)
      .mockResolvedValueOnce({ output: 'one fact.' })
      .mockResolvedValueOnce({ error: 'second grader unavailable' });
    const result = await runAssertions({
      test: {
        ...createTestCase([
          { type: 'context-faithfulness', fallback: 'next' },
          { type: 'contains', value: 'test' },
        ]),
        vars: { query: 'question', context: 'document' },
      },
      providerResponse: mockProviderResponse,
    });
    expect(result.pass).toBe(false);
    expect(result.componentResults?.[0].metadata?.graderError).toBe(true);
    expect(result.componentResults).toHaveLength(1);
  });
});

describe('Fallback chains fail closed on validator hard errors', () => {
  it('keeps an unavailable grader terminal under threshold zero and custom scoring', async () => {
    const assertions: Assertion[] = [
      {
        type: 'javascript',
        value: () => {
          throw new Error('validator unavailable');
        },
        fallback: 'next',
      },
      { type: 'contains', value: 'test' },
    ];
    const test = {
      ...createTestCase(assertions),
      threshold: 0,
    };
    const result = await runAssertions({
      test,
      providerResponse: mockProviderResponse,
      assertScoringFunction: async () => ({ pass: true, score: 1, reason: 'custom score' }),
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('validator unavailable');

    const nestedResult = await runAssertions({
      test: {
        assert: [{ type: 'assert-set', threshold: 0, assert: assertions }],
        vars: {},
        threshold: 0,
      },
      providerResponse: mockProviderResponse,
    });
    expect(nestedResult.pass).toBe(false);
  });

  it('does not let weight:0 coerce a hard-erroring primary into a masking pass', async () => {
    const assertions: Assertion[] = [
      {
        type: 'javascript',
        weight: 0,
        value: () => {
          throw new Error('validator boom');
        },
        fallback: 'next',
      },
      { type: 'contains', value: 'test' },
    ];

    const result = await runAssertions({
      test: createTestCase(assertions),
      providerResponse: mockProviderResponse,
    });

    // Hard-error metadata wins over the weight-zero pass coercion → fail closed.
    expect(result.pass).toBe(false);
    expect(result.componentResults).toHaveLength(1);
    expect(result.componentResults?.[0].metadata?.assertionError).toBe(true);
    expect(result.componentResults?.[0].pass).toBe(false);
  });

  it('does not fall through a METEOR missing-dependency failure', async () => {
    const assertions: Assertion[] = [
      { type: 'meteor', value: 'reference text', fallback: 'next' },
      { type: 'contains', value: 'test' },
    ];

    const result = await runAssertions({
      test: createTestCase(assertions),
      providerResponse: mockProviderResponse,
    });

    expect(result.pass).toBe(false);
    expect(result.componentResults).toHaveLength(1);
    expect(result.componentResults?.[0].metadata?.assertionError).toBe(true);
    expect(result.componentResults?.[0].reason).toContain('natural');
  });
});

describe('Trace data is loaded only for reached assertions', () => {
  beforeEach(() => {
    // Single poll keeps the (mocked) trace load fast and deterministic.
    vi.stubEnv('PROMPTFOO_TRACE_FETCH_MAX_ATTEMPTS', '1');
    getTraceMock.mockResolvedValue({
      traceId: 'trace-1',
      spans: [{ spanId: 's1', name: 'llm.call', startTime: 0, endTime: 1 }],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not poll the trace store for an unreached trace-aware fallback', async () => {
    const assertions: Assertion[] = [
      // Passes → the trace-aware fallback is never reached.
      { type: 'contains', value: 'test', fallback: 'next' },
      { type: 'trace-span-count', value: { pattern: 'llm', min: 1 } },
    ];

    const result = await runAssertions({
      test: createTestCase(assertions),
      providerResponse: mockProviderResponse,
      traceId: 'trace-1',
    });

    expect(result.pass).toBe(true);
    expect(getTraceMock).not.toHaveBeenCalled();
  });

  it('flushes buffered grader parents before reading an external child span', async () => {
    let graderParentStored = false;
    flushOtelMock.mockImplementationOnce(async () => {
      await Promise.resolve();
      graderParentStored = true;
    });
    getTraceMock.mockImplementation(() => ({
      traceId: 'trace-1',
      spans: [
        { spanId: 'target', name: 'llm.target', startTime: 0, endTime: 1 },
        ...(graderParentStored
          ? []
          : [
              {
                spanId: 'external-child',
                parentSpanId: 'buffered-grader',
                name: 'llm.grader-child',
                startTime: 0,
                endTime: 1,
              },
            ]),
      ],
    }));
    const result = await runAssertions({
      test: createTestCase([
        { type: 'equals', value: 'mismatch', fallback: 'next' },
        { type: 'trace-span-count', value: { pattern: 'llm*', min: 1, max: 1 } },
      ]),
      providerResponse: mockProviderResponse,
      traceId: 'trace-1',
    });
    expect(result.pass).toBe(true);
  });

  it('waits for a sibling grader to finish before classifying its external child', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    let markStarted!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let graderFinished = false;
    const grader: ApiProvider = {
      id: () => 'delayed-grader',
      callApi: async () => {
        markStarted();
        await released;
        graderFinished = true;
        return { output: '{"pass":true,"score":1}' };
      },
    };
    flushOtelMock.mockImplementationOnce(() => started);
    getTraceMock.mockImplementation(() => ({
      traceId: 'trace-1',
      spans: [
        { spanId: 'target', name: 'llm.target', startTime: 0, endTime: 1 },
        ...(graderFinished
          ? []
          : [
              {
                spanId: 'external-child',
                parentSpanId: 'active-grader',
                name: 'llm.grader-child',
                startTime: 0,
                endTime: 1,
              },
            ]),
      ],
    }));
    const pending = runAssertions({
      test: createTestCase(
        [
          { type: 'llm-rubric', value: 'The answer is correct.' },
          { type: 'trace-span-count', value: { pattern: 'llm*', min: 1, max: 1 } },
        ],
        { provider: grader },
      ),
      providerResponse: mockProviderResponse,
      traceId: 'trace-1',
    });
    await started;
    await vi.advanceTimersByTimeAsync(0);
    const readWhileGrading = getTraceMock.mock.calls.length > 0;
    release();
    const result = await pending;

    expect(readWhileGrading).toBe(false);
    expect(result.pass).toBe(true);
  });

  it('loads trace data once (memoized) across reached trace-aware assertions', async () => {
    const assertions: Assertion[] = [
      // Fails (min 5 > available) → falls through to the second trace assertion.
      { type: 'trace-span-count', value: { pattern: 'llm*', min: 5 }, fallback: 'next' },
      { type: 'trace-span-count', value: { pattern: 'llm*', min: 1 } },
    ];

    const result = await runAssertions({
      test: createTestCase(assertions),
      providerResponse: mockProviderResponse,
      traceId: 'trace-1',
    });

    expect(result.pass).toBe(true);
    // Both reached assertions share a single memoized trace load.
    expect(getTraceMock).toHaveBeenCalledTimes(1);
    expect(getTraceMock).toHaveBeenCalledWith('trace-1', {
      sanitizeAttributes: false,
      includeInternalSpans: false,
    });
  });
});
