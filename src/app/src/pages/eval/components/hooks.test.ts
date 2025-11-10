import { renderHook, act } from '@testing-library/react';
import type { EvaluateTable } from '@promptfoo/types';
import { describe, expect, it, vi } from 'vitest';

import {
  usePassingTestCounts,
  useTestCounts,
  usePassRates,
  useApplyFilterFromMetric,
} from './hooks';
import { useTableStore } from './store';
import {
  isPolicyMetric,
  deserializePolicyIdFromMetric,
} from '@promptfoo/redteam/plugins/policy/utils';

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
    });

    const { result } = renderHook(() => usePassingTestCounts());

    expect(result.current).toEqual([15, 30, 5]);
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

    expect(result.current).toEqual([15, 0, 0, 0]);
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

    expect(result.current).toEqual([15, 0]);
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

    expect(result.current).toEqual([0]);
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

    expect(result.current).toEqual([15, 30, 8]);
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

    expect(result.current).toEqual([10, 5, 0, 10]);
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

    expect(result.current).toEqual([0, 30]);
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

    expect(result.current).toEqual([0]);
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

    expect(result.current).toEqual([80, 50, 100, 0]);
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

    expect(result.current).toEqual([0, 50]);
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

    expect(result.current).toEqual([(120 / 140) * 100, 50]);
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
