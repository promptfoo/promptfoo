import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertions } from '../../src/assertions';
import { DefaultGradingProvider } from '../../src/providers/openai/defaults';

import type { ApiProvider, Assertion, AtomicTestCase, ProviderResponse } from '../../src/types';

// Lazily-mocked trace store: runAssertions only reaches getTraceStore().getTrace
// when a *reached* trace-aware assertion needs trace context.
const { getTraceMock } = vi.hoisted(() => ({ getTraceMock: vi.fn() }));
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

afterEach(() => {
  vi.restoreAllMocks();
  getTraceMock.mockReset();
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
  ];

  it.each(graderCases)('does not let a passing fallback mask a $name grader outage', async ({
    primary,
    options,
  }) => {
    const assertions: Assertion[] = [
      primary,
      // A `contains` that WOULD pass on the output. It must not run / must not
      // mask the grader outage.
      { type: 'contains', value: 'test' },
    ];

    const result = await runAssertions({
      prompt: 'some prompt',
      test: createTestCase(assertions, options),
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
  });
});

describe('Fallback chains fail closed on validator hard errors', () => {
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
  });
});
