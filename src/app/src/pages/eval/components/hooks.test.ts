import {
  deserializePolicyIdFromMetric,
  isPolicyMetric,
} from '@promptfoo/redteam/plugins/policy/utils';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  useApplyFilterFromMetric,
  useMetricsGetter,
  usePassingTestCounts,
  usePassRates,
  useTestCounts,
} from './hooks';
import { useTableStore } from './store';
import type { EvaluateTable } from '@promptfoo/types';

vi.mock('./store', () => ({
  useTableStore: vi.fn(),
}));

vi.mock('@promptfoo/redteam/plugins/policy/utils', () => ({
  isPolicyMetric: vi.fn(),
  deserializePolicyIdFromMetric: vi.fn(),
}));

const mockedUseTableStore = vi.mocked(useTableStore);
const mockedIsPolicyMetric = vi.mocked(isPolicyMetric);
const mockedDeserializePolicyIdFromMetric = vi.mocked(deserializePolicyIdFromMetric);

describe('usePassingTestCounts', () => {
  it('should return an array of passing test counts for each prompt when the table is defined and each prompt has a metrics.testPassCount value', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: { testPassCount: 15 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: { testPassCount: 30 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 3',
            label: 'Test prompt 3',
            provider: 'test-provider-3',
            metrics: { testPassCount: 5 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics: null,
    });

    const { result } = renderHook(() => usePassingTestCounts());

    expect(result.current).toEqual([
      { total: 15, filtered: null },
      { total: 30, filtered: null },
      { total: 5, filtered: null },
    ]);
  });

  it('should return 0 for prompts where metrics or metrics.testPassCount is missing or undefined, while returning the correct count for prompts where it is present', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: { testPassCount: 15 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: {} as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 3',
            label: 'Test prompt 3',
            provider: 'test-provider-3',
            metrics: { testPassCount: undefined } as any,
          },
          {
            raw: 'Test prompt 4',
            label: 'Test prompt 4',
            provider: 'test-provider-4',
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
    });

    const { result } = renderHook(() => usePassingTestCounts());

    expect(result.current).toEqual([
      { total: 15, filtered: null },
      { total: 0, filtered: null },
      { total: 0, filtered: null },
      { total: 0, filtered: null },
    ]);
  });

  it('should return an empty array when the table is not defined in the store', () => {
    mockedUseTableStore.mockReturnValue({
      table: null,
    });

    const { result } = renderHook(() => usePassingTestCounts());

    expect(result.current).toEqual([]);
  });

  it('should return 0 for prompts where metrics.testPassCount is explicitly null', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 15,
            } as any as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: {
              testPassCount: null,
            } as any as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
    });

    const { result } = renderHook(() => usePassingTestCounts());

    expect(result.current).toEqual([
      { total: 15, filtered: null },
      { total: 0, filtered: null },
    ]);
  });

  it('should return 0 when testPassCount is explicitly 0', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: { testPassCount: 0 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
    });

    const { result } = renderHook(() => usePassingTestCounts());

    expect(result.current).toEqual([{ total: 0, filtered: null }]);
  });

  it('should return null as the filtered value when filteredMetrics array is shorter than prompts array', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: { testPassCount: 15 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: { testPassCount: 30 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 3',
            label: 'Test prompt 3',
            provider: 'test-provider-3',
            metrics: { testPassCount: 5 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics: [{ testPassCount: 7 }],
    });

    const { result } = renderHook(() => usePassingTestCounts());

    expect(result.current).toEqual([
      { total: 15, filtered: 7 },
      { total: 30, filtered: null },
      { total: 5, filtered: null },
    ]);
  });

  it('should preserve an explicit 0 value in filteredMetrics for testPassCount', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: { testPassCount: 15 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics: [{ testPassCount: 0 }],
    });

    const { result } = renderHook(() => usePassingTestCounts());

    expect(result.current).toEqual([{ total: 15, filtered: 0 }]);
  });

  it('should correctly handle a filteredMetrics entry with an explicit null testPassCount value', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: { testPassCount: 15 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: { testPassCount: 30 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    const filteredMetrics = [{ testPassCount: 5 }, { testPassCount: null }];

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics,
    });

    const { result } = renderHook(() => usePassingTestCounts());

    expect(result.current).toEqual([
      { total: 15, filtered: 5 },
      { total: 30, filtered: null },
    ]);
  });

  it('should handle undefined entries in filteredMetrics array by returning null for the filtered count', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: { testPassCount: 15 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: { testPassCount: 30 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 3',
            label: 'Test prompt 3',
            provider: 'test-provider-3',
            metrics: { testPassCount: 5 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    const filteredMetrics = [undefined, { testPassCount: 20 }, undefined];

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics,
    });

    const { result } = renderHook(() => usePassingTestCounts());

    expect(result.current).toEqual([
      { total: 15, filtered: null },
      { total: 30, filtered: 20 },
      { total: 5, filtered: null },
    ]);
  });
});

describe('useTestCounts', () => {
  it('should return an array of total test counts for each prompt when the table is defined and metrics are present', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 10,
              testFailCount: 5,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: {
              testPassCount: 20,
              testFailCount: 10,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 3',
            label: 'Test prompt 3',
            provider: 'test-provider-3',
            metrics: {
              testPassCount: 0,
              testFailCount: 8,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
    });

    const { result } = renderHook(() => useTestCounts());

    expect(result.current).toEqual([
      { total: 15, filtered: null },
      { total: 30, filtered: null },
      { total: 8, filtered: null },
    ]);
  });

  it('should treat missing testPassCount or testFailCount as zero and return the correct total for each prompt', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: { testPassCount: 10 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: { testFailCount: 5 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 3',
            label: 'Test prompt 3',
            provider: 'test-provider-3',
            metrics: {} as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 4',
            label: 'Test prompt 4',
            provider: 'test-provider-4',
            metrics: {
              testPassCount: 7,
              testFailCount: 3,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
    });

    const { result } = renderHook(() => useTestCounts());

    expect(result.current).toEqual([
      { total: 10, filtered: null },
      { total: 5, filtered: null },
      { total: 0, filtered: null },
      { total: 10, filtered: null },
    ]);
  });

  it('should return an empty array when the table is not defined', () => {
    mockedUseTableStore.mockReturnValue({
      table: null,
    });

    const { result } = renderHook(() => useTestCounts());

    expect(result.current).toEqual([]);
  });

  it('should handle null metrics object and return 0 for the prompt', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: null as any,
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: {
              testPassCount: 20,
              testFailCount: 10,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
    });

    const { result } = renderHook(() => useTestCounts());

    expect(result.current).toEqual([
      { total: 0, filtered: null },
      { total: 30, filtered: null },
    ]);
  });

  it('should return an empty array when prompts array is empty', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
    });

    const { result } = renderHook(() => useTestCounts());

    expect(result.current).toEqual([]);
  });

  it('should return 0 when a prompt has metrics data but zero tests (testPassCount and testFailCount are 0)', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 0,
              testFailCount: 0,
              cost: 1.5,
              tokenUsage: {
                prompt: 100,
                completion: 50,
                total: 150,
              },
              totalLatencyMs: 200,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
    });

    const { result } = renderHook(() => useTestCounts());

    expect(result.current).toEqual([{ total: 0, filtered: null }]);
  });

  it('should prevent recalculation when the table reference changes but the test counts remain the same', () => {
    const initialMockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 10,
              testFailCount: 5,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: {
              testPassCount: 20,
              testFailCount: 10,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: initialMockTable,
    });

    const { result: initialResult } = renderHook(() => useTestCounts());
    const initialTestCounts = initialResult.current;

    const newMockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 10,
              testFailCount: 5,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: {
              testPassCount: 20,
              testFailCount: 10,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: newMockTable,
    });

    const { result: newResult } = renderHook(() => useTestCounts());
    const newTestCounts = newResult.current;

    expect(newTestCounts).toStrictEqual(initialTestCounts);
  });

  it('should handle missing data in filteredMetrics gracefully', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 10,
              testFailCount: 5,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: {
              testPassCount: 20,
              testFailCount: 10,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 3',
            label: 'Test prompt 3',
            provider: 'test-provider-3',
            metrics: {
              testPassCount: 0,
              testFailCount: 8,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    const filteredMetrics = [
      { testPassCount: 8, testFailCount: 2 },
      undefined,
      { testPassCount: 0, testFailCount: 0 },
    ];

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics,
    });

    const { result } = renderHook(() => useTestCounts());

    expect(result.current).toEqual([
      { total: 15, filtered: 10 },
      { total: 30, filtered: null },
      { total: 8, filtered: 0 },
    ]);
  });

  it('should handle the case where filteredMetrics array length does not match the prompts array length', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 10,
              testFailCount: 5,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: {
              testPassCount: 20,
              testFailCount: 10,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 3',
            label: 'Test prompt 3',
            provider: 'test-provider-3',
            metrics: {
              testPassCount: 5,
              testFailCount: 2,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    const filteredMetrics = [
      { testPassCount: 8, testFailCount: 2 },
      { testPassCount: 15, testFailCount: 5 },
    ];

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics,
    });

    const { result } = renderHook(() => useTestCounts());

    expect(result.current).toEqual([
      { total: 15, filtered: 10 },
      { total: 30, filtered: 20 },
      { total: 7, filtered: null },
    ]);
  });

  it('should handle very large numbers for testPassCount and testFailCount correctly', () => {
    const largeNumber = Number.MAX_SAFE_INTEGER;
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: largeNumber,
              testFailCount: largeNumber,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    const filteredMetrics = [
      {
        testPassCount: largeNumber,
        testFailCount: largeNumber,
      },
    ];

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics,
    });

    const { result } = renderHook(() => useTestCounts());

    expect(result.current).toEqual([
      { total: largeNumber + largeNumber, filtered: largeNumber + largeNumber },
    ]);
  });
});

describe('usePassRates', () => {
  it('should return an array of pass rates (percentages) for each prompt when the table is defined and each prompt has testPassCount and testFailCount metrics', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 8,
              testFailCount: 2,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: {
              testPassCount: 5,
              testFailCount: 5,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 3',
            label: 'Test prompt 3',
            provider: 'test-provider-3',
            metrics: {
              testPassCount: 10,
              testFailCount: 0,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 4',
            label: 'Test prompt 4',
            provider: 'test-provider-4',
            metrics: {
              testPassCount: 0,
              testFailCount: 10,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
    });

    const { result } = renderHook(() => usePassRates());

    expect(result.current).toEqual([
      { total: 80, filtered: null },
      { total: 50, filtered: null },
      { total: 100, filtered: null },
      { total: 0, filtered: null },
    ]);
  });

  it('should return 0 for prompts where the total number of tests (testPassCount + testFailCount) is zero', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 0,
              testFailCount: 0,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: {
              testPassCount: 5,
              testFailCount: 5,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
    });

    const { result } = renderHook(() => usePassRates());

    expect(result.current).toEqual([
      { total: 0, filtered: null },
      { total: 50, filtered: null },
    ]);
  });

  it('should return an empty array when the table is undefined', () => {
    mockedUseTableStore.mockReturnValue({
      table: null,
    });

    const { result } = renderHook(() => usePassRates());

    expect(result.current).toEqual([]);
  });

  it('should handle cases where the number of passing tests exceeds the total number of tests', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 120,
              testFailCount: 20,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: {
              testPassCount: 5,
              testFailCount: 5,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
    });

    const { result } = renderHook(() => usePassRates());

    expect(result.current).toEqual([
      { total: (120 / 140) * 100, filtered: null },
      { total: 50, filtered: null },
    ]);
  });

  it('should return a filtered pass rate of 0 for a prompt when the filtered test count is zero, while still returning the correct total pass rate', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 10,
              testFailCount: 0,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    const filteredMetrics = [
      {
        testPassCount: 0,
        testFailCount: 0,
      },
    ];

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics,
    });

    const { result } = renderHook(() => usePassRates());

    expect(result.current).toEqual([{ total: 100, filtered: 0 }]);
  });

  it('should correctly calculate pass rates with floating point precision when passing counts are very close to total counts', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 9999999,
              testFailCount: 1,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
    });

    const { result } = renderHook(() => usePassRates());

    expect(result.current).toHaveLength(1);
    expect(result.current[0].filtered).toBe(null);
    expect(result.current[0].total).toBeCloseTo(99.99999, 5);
  });
});

describe('Filtered Metrics Behavior', () => {
  describe('usePassingTestCounts with filteredMetrics', () => {
    it('should use filteredMetrics instead of prompt.metrics when filteredMetrics is available', () => {
      const mockTable: EvaluateTable = {
        head: {
          prompts: [
            {
              raw: 'Test prompt 1',
              label: 'Test prompt 1',
              provider: 'test-provider-1',
              metrics: {
                testPassCount: 100,
              } as EvaluateTable['head']['prompts'][number]['metrics'],
            },
            {
              raw: 'Test prompt 2',
              label: 'Test prompt 2',
              provider: 'test-provider-2',
              metrics: {
                testPassCount: 200,
              } as EvaluateTable['head']['prompts'][number]['metrics'],
            },
          ],
          vars: [],
        },
        body: [],
      };

      const filteredMetrics = [{ testPassCount: 15 }, { testPassCount: 25 }];

      mockedUseTableStore.mockReturnValue({
        table: mockTable,
        filteredMetrics,
      });

      const { result } = renderHook(() => usePassingTestCounts());

      // Should return both total and filtered
      expect(result.current).toEqual([
        { total: 100, filtered: 15 },
        { total: 200, filtered: 25 },
      ]);
    });

    it('should fall back to prompt.metrics when filteredMetrics is null', () => {
      const mockTable: EvaluateTable = {
        head: {
          prompts: [
            {
              raw: 'Test prompt 1',
              label: 'Test prompt 1',
              provider: 'test-provider-1',
              metrics: {
                testPassCount: 100,
              } as EvaluateTable['head']['prompts'][number]['metrics'],
            },
          ],
          vars: [],
        },
        body: [],
      };

      mockedUseTableStore.mockReturnValue({
        table: mockTable,
        filteredMetrics: null,
      });

      const { result } = renderHook(() => usePassingTestCounts());

      expect(result.current).toEqual([{ total: 100, filtered: null }]);
    });
  });

  describe('useTestCounts with filteredMetrics', () => {
    it('should use filteredMetrics instead of prompt.metrics when filteredMetrics is available', () => {
      const mockTable: EvaluateTable = {
        head: {
          prompts: [
            {
              raw: 'Test prompt 1',
              label: 'Test prompt 1',
              provider: 'test-provider-1',
              metrics: {
                testPassCount: 100,
                testFailCount: 50,
              } as EvaluateTable['head']['prompts'][number]['metrics'],
            },
            {
              raw: 'Test prompt 2',
              label: 'Test prompt 2',
              provider: 'test-provider-2',
              metrics: {
                testPassCount: 200,
                testFailCount: 100,
              } as EvaluateTable['head']['prompts'][number]['metrics'],
            },
          ],
          vars: [],
        },
        body: [],
      };

      const filteredMetrics = [
        { testPassCount: 8, testFailCount: 2 },
        { testPassCount: 15, testFailCount: 5 },
      ];

      mockedUseTableStore.mockReturnValue({
        table: mockTable,
        filteredMetrics,
      });

      const { result } = renderHook(() => useTestCounts());

      // Should return both total and filtered
      expect(result.current).toEqual([
        { total: 150, filtered: 10 },
        { total: 300, filtered: 20 },
      ]);
    });

    it('should fall back to prompt.metrics when filteredMetrics is null', () => {
      const mockTable: EvaluateTable = {
        head: {
          prompts: [
            {
              raw: 'Test prompt 1',
              label: 'Test prompt 1',
              provider: 'test-provider-1',
              metrics: {
                testPassCount: 100,
                testFailCount: 50,
              } as EvaluateTable['head']['prompts'][number]['metrics'],
            },
          ],
          vars: [],
        },
        body: [],
      };

      mockedUseTableStore.mockReturnValue({
        table: mockTable,
        filteredMetrics: null,
      });

      const { result } = renderHook(() => useTestCounts());

      expect(result.current).toEqual([{ total: 150, filtered: null }]);
    });
  });

  describe('usePassRates with filteredMetrics', () => {
    it('should calculate pass rates using filteredMetrics when available', () => {
      const mockTable: EvaluateTable = {
        head: {
          prompts: [
            {
              raw: 'Test prompt 1',
              label: 'Test prompt 1',
              provider: 'test-provider-1',
              metrics: {
                testPassCount: 100,
                testFailCount: 0,
              } as EvaluateTable['head']['prompts'][number]['metrics'],
            },
          ],
          vars: [],
        },
        body: [],
      };

      const filteredMetrics = [{ testPassCount: 8, testFailCount: 2 }];

      mockedUseTableStore.mockReturnValue({
        table: mockTable,
        filteredMetrics,
      });

      const { result } = renderHook(() => usePassRates());

      // Should return both total and filtered pass rates
      expect(result.current).toEqual([{ total: 100, filtered: 80 }]);
    });
  });
});

describe('useMetricsGetter', () => {
  it('should return a function that gets metrics for a specific prompt index', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 10,
              testFailCount: 5,
              cost: 1.5,
              totalLatencyMs: 200,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: {
              testPassCount: 20,
              testFailCount: 10,
              cost: 2.5,
              totalLatencyMs: 300,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics: null,
    });

    const { result } = renderHook(() => useMetricsGetter());
    const getMetrics = result.current;

    const metrics0 = getMetrics(0);
    const metrics1 = getMetrics(1);

    expect(metrics0).toEqual({
      total: {
        testPassCount: 10,
        testFailCount: 5,
        cost: 1.5,
        totalLatencyMs: 200,
      },
      filtered: null,
    });

    expect(metrics1).toEqual({
      total: {
        testPassCount: 20,
        testFailCount: 10,
        cost: 2.5,
        totalLatencyMs: 300,
      },
      filtered: null,
    });
  });

  it('should use filteredMetrics when available instead of prompt.metrics', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 100,
              testFailCount: 50,
              cost: 10.0,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    const filteredMetrics = [
      {
        testPassCount: 8,
        testFailCount: 2,
        cost: 0.8,
      },
    ];

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics,
    });

    const { result } = renderHook(() => useMetricsGetter());
    const getMetrics = result.current;

    const metrics = getMetrics(0);

    // Should return both total and filtered
    expect(metrics).toEqual({
      total: {
        testPassCount: 100,
        testFailCount: 50,
        cost: 10.0,
      },
      filtered: {
        testPassCount: 8,
        testFailCount: 2,
        cost: 0.8,
      },
    });
  });

  it('should return null for out-of-bounds index', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 10,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics: null,
    });

    const { result } = renderHook(() => useMetricsGetter());
    const getMetrics = result.current;

    expect(getMetrics(-1)).toEqual({ total: null, filtered: null });
    expect(getMetrics(1)).toEqual({ total: null, filtered: null });
    expect(getMetrics(999)).toEqual({ total: null, filtered: null });
  });

  it('should return null when table is not defined', () => {
    mockedUseTableStore.mockReturnValue({
      table: null,
      filteredMetrics: null,
    });

    const { result } = renderHook(() => useMetricsGetter());
    const getMetrics = result.current;

    expect(getMetrics(0)).toEqual({ total: null, filtered: null });
  });

  it('should fall back to prompt.metrics when filteredMetrics is null', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 100,
              cost: 5.0,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics: null,
    });

    const { result } = renderHook(() => useMetricsGetter());
    const getMetrics = result.current;

    const metrics = getMetrics(0);

    expect(metrics).toEqual({
      total: {
        testPassCount: 100,
        cost: 5.0,
      },
      filtered: null,
    });
  });

  it('should handle the case where filteredMetrics is an empty array but the table has prompts', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 10,
              testFailCount: 5,
              cost: 1.5,
              totalLatencyMs: 200,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: {
              testPassCount: 20,
              testFailCount: 10,
              cost: 2.5,
              totalLatencyMs: 300,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics: [],
    });

    const { result } = renderHook(() => useMetricsGetter());
    const getMetrics = result.current;

    const metrics0 = getMetrics(0);
    const metrics1 = getMetrics(1);

    expect(metrics0).toEqual({
      total: {
        testPassCount: 10,
        testFailCount: 5,
        cost: 1.5,
        totalLatencyMs: 200,
      },
      filtered: null,
    });

    expect(metrics1).toEqual({
      total: {
        testPassCount: 20,
        testFailCount: 10,
        cost: 2.5,
        totalLatencyMs: 300,
      },
      filtered: null,
    });
  });

  it('should handle the case where filteredMetrics array is shorter than the prompts array', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: {
              testPassCount: 10,
              testFailCount: 5,
              cost: 1.5,
              totalLatencyMs: 200,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
          {
            raw: 'Test prompt 2',
            label: 'Test prompt 2',
            provider: 'test-provider-2',
            metrics: {
              testPassCount: 20,
              testFailCount: 10,
              cost: 2.5,
              totalLatencyMs: 300,
            } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    const filteredMetrics = [
      {
        testPassCount: 5,
        testFailCount: 2,
        cost: 0.5,
        totalLatencyMs: 100,
      },
    ];

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics,
    });

    const { result } = renderHook(() => useMetricsGetter());
    const getMetrics = result.current;

    const metrics0 = getMetrics(0);
    const metrics1 = getMetrics(1);

    expect(metrics0).toEqual({
      total: {
        testPassCount: 10,
        testFailCount: 5,
        cost: 1.5,
        totalLatencyMs: 200,
      },
      filtered: {
        testPassCount: 5,
        testFailCount: 2,
        cost: 0.5,
        totalLatencyMs: 100,
      },
    });

    expect(metrics1).toEqual({
      total: {
        testPassCount: 20,
        testFailCount: 10,
        cost: 2.5,
        totalLatencyMs: 300,
      },
      filtered: null,
    });
  });

  it('should maintain referential stability when dependencies do not change', () => {
    const mockTable: EvaluateTable = {
      head: {
        prompts: [
          {
            raw: 'Test prompt 1',
            label: 'Test prompt 1',
            provider: 'test-provider-1',
            metrics: { testPassCount: 10 } as EvaluateTable['head']['prompts'][number]['metrics'],
          },
        ],
        vars: [],
      },
      body: [],
    };

    const mockFilteredMetrics = [{ testPassCount: 5 }];

    mockedUseTableStore.mockReturnValue({
      table: mockTable,
      filteredMetrics: mockFilteredMetrics,
    });

    const { result, rerender } = renderHook(() => useMetricsGetter());
    const getMetrics1 = result.current;

    rerender();
    const getMetrics2 = result.current;

    expect(getMetrics2).toBe(getMetrics1);
  });
});

describe('useApplyFilterFromMetric', () => {
  it('should not call addFilter if an identical filter is already present in filters.values', () => {
    const mockAddFilter = vi.fn();
    const metricName = 'latency';
    const existingFilter = {
      type: 'metric' as const,
      operator: 'is_defined' as const,
      value: '',
      field: metricName,
      logicOperator: 'or' as const,
    };

    mockedUseTableStore.mockReturnValue({
      filters: {
        values: {
          existingFilterId: existingFilter,
        },
      },
      addFilter: mockAddFilter,
    } as any);

    const { result } = renderHook(() => useApplyFilterFromMetric());
    const applyFilterCallback = result.current;

    act(() => {
      applyFilterCallback(metricName);
    });

    expect(mockAddFilter).not.toHaveBeenCalled();
  });

  it('should add a metric filter when called with a non-policy metric string', () => {
    const mockAddFilter = vi.fn();
    mockedIsPolicyMetric.mockReturnValue(false);
    mockedUseTableStore.mockReturnValue({
      filters: { values: {} },
      addFilter: mockAddFilter,
    } as any);

    const { result } = renderHook(() => useApplyFilterFromMetric());
    const applyFilterCallback = result.current;

    const metricName = 'latency';
    act(() => {
      applyFilterCallback(metricName);
    });

    expect(mockAddFilter).toHaveBeenCalledTimes(1);
    expect(mockAddFilter).toHaveBeenCalledWith({
      type: 'metric',
      operator: 'is_defined',
      value: '',
      field: metricName,
      logicOperator: 'or',
    });
  });

  it('should add a policy filter with type policy, operator equals, value set to the deserialized policy ID, field undefined, and logicOperator or when called with a policy metric string', () => {
    const mockAddFilter = vi.fn();
    mockedIsPolicyMetric.mockReturnValue(true);
    mockedDeserializePolicyIdFromMetric.mockReturnValue('policy-id');
    mockedUseTableStore.mockReturnValue({
      filters: { values: {} },
      addFilter: mockAddFilter,
    } as any);

    const { result } = renderHook(() => useApplyFilterFromMetric());
    const applyFilterCallback = result.current;

    const policyMetric = 'PolicyViolation:policy-id';
    act(() => {
      applyFilterCallback(policyMetric);
    });

    expect(mockAddFilter).toHaveBeenCalledTimes(1);
    expect(mockAddFilter).toHaveBeenCalledWith({
      type: 'policy',
      operator: 'equals',
      value: 'policy-id',
      field: undefined,
      logicOperator: 'or',
    });
  });

  it('should add a filter when a similar filter exists but with different properties', () => {
    const mockAddFilter = vi.fn();
    mockedIsPolicyMetric.mockReturnValue(false);
    const existingFilter = {
      type: 'metric' as const,
      operator: 'is_defined' as const,
      value: '',
      field: 'cost',
      logicOperator: 'or' as const,
    };

    mockedUseTableStore.mockReturnValue({
      filters: { values: { existingFilterId: existingFilter } },
      addFilter: mockAddFilter,
    } as any);

    const { result } = renderHook(() => useApplyFilterFromMetric());
    const applyFilterCallback = result.current;

    const metricName = 'latency';
    act(() => {
      applyFilterCallback(metricName);
    });

    expect(mockAddFilter).toHaveBeenCalledTimes(1);
    expect(mockAddFilter).toHaveBeenCalledWith({
      type: 'metric',
      operator: 'is_defined',
      value: '',
      field: metricName,
      logicOperator: 'or',
    });
  });

  it("should construct a metric filter with value: '' for non-policy metrics", () => {
    const mockAddFilter = vi.fn();
    mockedIsPolicyMetric.mockReturnValue(false);
    mockedUseTableStore.mockReturnValue({
      filters: { values: {} },
      addFilter: mockAddFilter,
    } as any);

    const { result } = renderHook(() => useApplyFilterFromMetric());
    const applyFilterCallback = result.current;

    const metricName = 'custom_metric';
    act(() => {
      applyFilterCallback(metricName);
    });

    expect(mockAddFilter).toHaveBeenCalledTimes(1);
    expect(mockAddFilter).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'metric',
        operator: 'is_defined',
        value: '',
        field: metricName,
        logicOperator: 'or',
      }),
    );
  });

  it('should correctly set field property for policy and metric filters', () => {
    const mockAddFilter = vi.fn();
    mockedUseTableStore.mockReturnValue({
      filters: { values: {} },
      addFilter: mockAddFilter,
    } as any);

    mockedIsPolicyMetric.mockImplementation((value: string) => value === 'policy:test-policy');
    mockedDeserializePolicyIdFromMetric.mockReturnValue('test-policy-id');

    const { result } = renderHook(() => useApplyFilterFromMetric());
    const applyFilterCallback = result.current;

    act(() => {
      applyFilterCallback('policy:test-policy');
    });

    expect(mockAddFilter).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'policy',
        field: undefined,
      }),
    );

    act(() => {
      applyFilterCallback('latency');
    });

    expect(mockAddFilter).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'metric',
        field: 'latency',
      }),
    );
  });

  it('should add a filter when filters?.values is an empty object', () => {
    const mockAddFilter = vi.fn();
    mockedIsPolicyMetric.mockReturnValue(false);
    mockedUseTableStore.mockReturnValue({
      filters: { values: {} },
      addFilter: mockAddFilter,
    } as any);

    const { result } = renderHook(() => useApplyFilterFromMetric());
    const applyFilterCallback = result.current;

    const metricName = 'latency';
    act(() => {
      applyFilterCallback(metricName);
    });

    expect(mockAddFilter).toHaveBeenCalledTimes(1);
    expect(mockAddFilter).toHaveBeenCalledWith({
      type: 'metric',
      operator: 'is_defined',
      value: '',
      field: metricName,
      logicOperator: 'or',
    });
  });
});
