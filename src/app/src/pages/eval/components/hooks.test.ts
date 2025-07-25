import { renderHook } from '@testing-library/react';
import type { EvaluateTable } from '@promptfoo/types';
import { describe, expect, it, vi } from 'vitest';

import { usePassingTestCounts, useTestCounts, usePassRates } from './hooks';
import { useTableStore } from './store';

vi.mock('./store', () => ({
  useTableStore: vi.fn(),
}));

const mockedUseTableStore = vi.mocked(useTableStore);

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
