import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTrajectoryGoalSuccess } from '../../src/assertions/trajectory';
import { matchesTrajectoryGoalSuccess } from '../../src/matchers';

import type {
  ApiProvider,
  AssertionParams,
  AtomicTestCase,
  GradingResult,
} from '../../src/types/index';
import type { TraceData } from '../../src/types/tracing';

vi.mock('../../src/matchers', () => ({
  matchesTrajectoryGoalSuccess: vi.fn(),
}));

const mockProvider: ApiProvider = {
  id: () => 'mock',
  callApi: async () => ({ output: 'mock' }),
};

const mockTraceData: TraceData = {
  traceId: 'test-trace-id',
  evaluationId: 'test-evaluation-id',
  testCaseId: 'test-test-case-id',
  metadata: { test: 'value' },
  spans: [
    {
      spanId: 'span-1',
      name: 'chat gpt-5',
      startTime: 1000,
      endTime: 1800,
      attributes: {
        'promptfoo.provider.id': 'openai:gpt-5',
      },
    },
    {
      spanId: 'span-2',
      name: 'tool.call',
      startTime: 1100,
      endTime: 1200,
      attributes: {
        'tool.name': 'search_orders',
      },
    },
    {
      spanId: 'span-3',
      name: 'tool.call',
      startTime: 1400,
      endTime: 1500,
      attributes: {
        'tool.name': 'compose_reply',
      },
    },
  ],
};

const defaultParams: AssertionParams = {
  assertion: {
    type: 'trajectory:goal-success',
    value: 'Resolve the order lookup task',
  },
  baseType: 'trajectory:goal-success',
  assertionValueContext: {
    vars: {},
    test: {} as AtomicTestCase,
    prompt: 'test prompt',
    logProbs: undefined,
    provider: mockProvider,
    providerResponse: { output: 'test output' },
    trace: mockTraceData,
  },
  output: 'test output',
  outputString: 'test output',
  providerResponse: { output: 'test output' },
  test: {} as AtomicTestCase,
  inverse: false,
};

describe('handleTrajectoryGoalSuccess', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('passes the goal, summarized trajectory, and provider context to the matcher', async () => {
    const expectedResult: GradingResult = {
      pass: true,
      score: 0.9,
      reason: 'Goal achieved',
    };
    vi.mocked(matchesTrajectoryGoalSuccess).mockResolvedValue(expectedResult);

    const providerCallContext = {
      originalProvider: mockProvider,
      prompt: { raw: 'test prompt', label: 'test prompt' },
      vars: { orderId: '123' },
    };

    const params: AssertionParams = {
      ...defaultParams,
      assertionValueContext: {
        ...defaultParams.assertionValueContext,
        vars: { orderId: '123' },
      },
      providerCallContext,
      test: {
        vars: { orderId: '123' },
      },
    };

    const result = await handleTrajectoryGoalSuccess(params);

    expect(result).toEqual(expectedResult);
    expect(matchesTrajectoryGoalSuccess).toHaveBeenCalledWith(
      'Resolve the order lookup task',
      expect.stringContaining('"stepCount": 3'),
      'test output',
      undefined,
      { orderId: '123' },
      params.assertion,
      providerCallContext,
    );
    expect(vi.mocked(matchesTrajectoryGoalSuccess).mock.calls[0]?.[1]).toContain('search_orders');
    expect(vi.mocked(matchesTrajectoryGoalSuccess).mock.calls[0]?.[1]).toContain('compose_reply');
  });

  it('accepts an object value with a goal property', async () => {
    const expectedResult: GradingResult = {
      pass: false,
      score: 0.2,
      reason: 'Goal not achieved',
    };
    vi.mocked(matchesTrajectoryGoalSuccess).mockResolvedValue(expectedResult);

    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trajectory:goal-success',
        value: {
          goal: 'Send the user a confirmed shipping status',
        },
      },
      renderedValue: {
        goal: 'Send the user a confirmed shipping status',
      },
    };

    await handleTrajectoryGoalSuccess(params);

    expect(matchesTrajectoryGoalSuccess).toHaveBeenCalledWith(
      'Send the user a confirmed shipping status',
      expect.any(String),
      'test output',
      undefined,
      {},
      params.assertion,
      undefined,
    );
  });

  it('passes resolved assertion vars instead of the raw test vars', async () => {
    vi.mocked(matchesTrajectoryGoalSuccess).mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Goal achieved',
    });

    const params: AssertionParams = {
      ...defaultParams,
      assertionValueContext: {
        ...defaultParams.assertionValueContext,
        vars: { orderId: 'resolved-123' },
      },
      test: {
        vars: { orderId: '{{ order_id }}' },
      },
    };

    await handleTrajectoryGoalSuccess(params);

    expect(matchesTrajectoryGoalSuccess).toHaveBeenCalledWith(
      'Resolve the order lookup task',
      expect.any(String),
      'test output',
      undefined,
      { orderId: 'resolved-123' },
      params.assertion,
      undefined,
    );
  });

  it('inverts the result for not-trajectory:goal-success assertions', async () => {
    vi.mocked(matchesTrajectoryGoalSuccess).mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Goal achieved',
    });

    const params: AssertionParams = {
      ...defaultParams,
      inverse: true,
      assertion: {
        type: 'not-trajectory:goal-success',
        value: 'Resolve the order lookup task',
      },
    };

    const result = await handleTrajectoryGoalSuccess(params);

    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Agent unexpectedly achieved the goal: Resolve the order lookup task',
      assertion: params.assertion,
    });
  });

  it('throws when the assertion value does not include a goal', async () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'trajectory:goal-success',
        value: {},
      },
      renderedValue: {},
    };

    await expect(handleTrajectoryGoalSuccess(params)).rejects.toThrow(
      'trajectory:goal-success assertion must have a string value or an object with a goal property',
    );
  });
});
