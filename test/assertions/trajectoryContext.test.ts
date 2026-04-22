import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertions } from '../../src/assertions/index';

import type { AtomicTestCase, ProviderResponse } from '../../src/types/index';
import type { TraceData } from '../../src/types/tracing';

const { createTraceTrajectorySpy, mockTraceStore } = vi.hoisted(() => ({
  createTraceTrajectorySpy: vi.fn(),
  mockTraceStore: {
    getTrace: vi.fn(),
  },
}));

vi.mock('../../src/tracing/store', () => ({
  getTraceStore: vi.fn(() => mockTraceStore),
}));

vi.mock('../../src/assertions/trajectoryUtils', async () => {
  const actual = await vi.importActual<typeof import('../../src/assertions/trajectoryUtils')>(
    '../../src/assertions/trajectoryUtils',
  );

  return {
    ...actual,
    createTraceTrajectory: vi.fn((trace: TraceData) => {
      createTraceTrajectorySpy(trace.traceId);
      return actual.createTraceTrajectory(trace);
    }),
  };
});

describe('trajectory assertion context', () => {
  const traceData: TraceData = {
    traceId: 'shared-trace-id',
    evaluationId: 'eval-id',
    testCaseId: 'test-case-id',
    spans: [
      {
        spanId: 'root-span',
        name: 'agent.run',
        startTime: 1000,
        endTime: 2000,
      },
      {
        spanId: 'tool-span',
        parentSpanId: 'root-span',
        name: 'tool.call',
        startTime: 1100,
        endTime: 1200,
        attributes: {
          'tool.name': 'lookup_order',
        },
      },
    ],
  };

  const providerResponse: ProviderResponse = {
    output: 'Test output',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    createTraceTrajectorySpy.mockReset();
    mockTraceStore.getTrace.mockReset();
    mockTraceStore.getTrace.mockResolvedValue(traceData);
  });

  it('loads trace data and normalizes trajectory once per row', async () => {
    const test: AtomicTestCase = {
      assert: [
        {
          type: 'javascript',
          value: `
            return Boolean(
              context.trace &&
              context.trajectory &&
              context.trajectory.steps.some(
                (step) => step.type === 'tool' && step.name === 'lookup_order',
              )
            );
          `,
        },
        {
          type: 'trace-span-count',
          value: {
            pattern: '*',
            min: 2,
            max: 2,
          },
        },
        {
          type: 'trajectory:tool-used',
          value: 'lookup_order',
        },
        {
          type: 'trajectory:step-count',
          value: {
            type: 'tool',
            min: 1,
            max: 1,
          },
        },
      ],
    };

    const result = await runAssertions({
      test,
      providerResponse,
      traceId: traceData.traceId,
    });

    expect(result.pass).toBe(true);
    expect(mockTraceStore.getTrace).toHaveBeenCalledTimes(2);
    expect(createTraceTrajectorySpy).toHaveBeenCalledTimes(1);
  });
});
