import { act } from '@testing-library/react';
import { v4 as uuidv4 } from 'uuid';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useTableStore, type ResultsFilter } from './store';
import { callApi } from '@app/utils/api';
import type { EvaluateTable, PromptMetrics } from './types';

vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

const baseMetrics: Omit<PromptMetrics, 'namedScores'> = {
  cost: 0,
  score: 0,
  testPassCount: 0,
  testFailCount: 0,
  testErrorCount: 0,
  assertPassCount: 0,
  assertFailCount: 0,
  totalLatencyMs: 0,
  tokenUsage: {},
  namedScoresCount: {},
};

describe('useTableStore', () => {
  beforeEach(() => {
    act(() => {
      const initialState = useTableStore.getState();
      useTableStore.setState({
        ...initialState,
        table: null,
        filters: {
          values: {},
          appliedCount: 0,
          options: {
            metric: [],
          },
        },
      });
    });
    vi.clearAllMocks();
  });

  describe('filters', () => {
    it('should add a new filter to `filters.values` and increment `filters.appliedCount` when `addFilter` is called with a filter that has a value', () => {
      const mockFilterId = 'mock-uuid-1';
      (uuidv4 as Mock<() => string>).mockImplementation(() => mockFilterId);

      const newFilter = {
        type: 'metric' as const,
        operator: 'equals' as const,
        value: 'test-metric-value',
      };

      act(() => {
        useTableStore.getState().addFilter(newFilter);
      });

      const state = useTableStore.getState();

      expect(state.filters.appliedCount).toBe(1);

      expect(Object.keys(state.filters.values)).toHaveLength(1);
      const addedFilter = state.filters.values[mockFilterId];
      expect(addedFilter).toBeDefined();

      expect(addedFilter).toEqual({
        ...newFilter,
        id: mockFilterId,
        logicOperator: 'and',
      });
    });

    it('should remove a filter from `filters.values` and decrement `filters.appliedCount` when `removeFilter` is called with a valid filter id', () => {
      const mockFilterId = 'mock-uuid-1';
      (uuidv4 as Mock<() => string>).mockImplementation(() => mockFilterId);

      const newFilter = {
        type: 'metric' as const,
        operator: 'equals' as const,
        value: 'test-metric-value',
      };

      act(() => {
        useTableStore.getState().addFilter(newFilter);
      });

      act(() => {
        useTableStore.getState().removeFilter(mockFilterId);
      });

      const state = useTableStore.getState();
      expect(state.filters.appliedCount).toBe(0);
      expect(state.filters.values[mockFilterId]).toBeUndefined();
      expect(Object.keys(state.filters.values)).toHaveLength(0);
    });

    it('should clear all filters and set `filters.appliedCount` to 0 when `resetFilters` is called', () => {
      const mockFilterId = 'mock-uuid-1';
      (uuidv4 as Mock<() => string>).mockImplementation(() => mockFilterId);

      const newFilter = {
        type: 'metric' as const,
        operator: 'equals' as const,
        value: 'test-metric-value',
      };

      act(() => {
        useTableStore.getState().addFilter(newFilter);
      });

      act(() => {
        useTableStore.getState().resetFilters();
      });

      const state = useTableStore.getState();
      expect(state.filters.values).toEqual({});
      expect(state.filters.appliedCount).toBe(0);
    });

    it('should decrement `filters.appliedCount` when `updateFilter` is called with a filter that changes from having a value to having an empty value', () => {
      const mockFilterId = 'mock-uuid-1';
      (uuidv4 as Mock<() => string>).mockImplementation(() => mockFilterId);

      const initialFilter = {
        id: mockFilterId,
        type: 'metric' as const,
        operator: 'equals' as const,
        value: 'test-metric-value',
        logicOperator: 'and' as const,
      };

      act(() => {
        useTableStore.setState((prevState) => ({
          filters: {
            ...prevState.filters,
            values: {
              [mockFilterId]: initialFilter,
            },
            appliedCount: 1,
          },
        }));
      });

      const updatedFilter: ResultsFilter = {
        ...initialFilter,
        value: '',
      };

      act(() => {
        useTableStore.getState().updateFilter(updatedFilter);
      });

      const state = useTableStore.getState();
      expect(state.filters.appliedCount).toBe(0);
      expect(state.filters.values[mockFilterId].value).toBe('');
    });
  });

  describe('fetchEvalData', () => {
    it('should properly handle filters with special characters in their values when building the API request URL', async () => {
      const evalId = 'test-eval-id';
      const filterValue = 'test value with !@#$%^&*()_+=-`~[]\{}|;\':",./<>? special characters';
      const filter: ResultsFilter = {
        id: 'test-filter-id',
        type: 'metric',
        operator: 'equals',
        value: filterValue,
        logicOperator: 'and',
      };

      const expectedEncodedFilterValue = JSON.stringify({
        logicOperator: filter.logicOperator,
        type: filter.type,
        operator: filter.operator,
        value: filter.value,
      });

      const mockCallApi = vi.mocked(callApi).mockResolvedValue({
        ok: true,
        json: async () => ({
          table: { head: { prompts: [] }, body: [] },
          totalCount: 0,
          filteredCount: 0,
        }),
      } as any);

      await act(async () => {
        await useTableStore.getState().fetchEvalData(evalId, { filters: [filter] });
      });

      expect(mockCallApi).toHaveBeenCalledTimes(1);
      const url = mockCallApi.mock.calls[0][0];
      const urlParams = new URL(url, 'http://example.com').searchParams;
      const rawFilterParam = urlParams.get('filter');
      const actualFilterParam = JSON.parse(rawFilterParam || '{}');
      const expectedFilterParam = JSON.parse(expectedEncodedFilterValue);
      expect(actualFilterParam).toEqual(expectedFilterParam);
    });

    it('should handle non-200 response from API', async () => {
      const mockEvalId = 'test-eval-id';
      (callApi as Mock).mockResolvedValue({
        ok: false,
      });

      const initialState = useTableStore.getState();
      expect(initialState.isFetching).toBe(false);

      let result;
      await act(async () => {
        result = await useTableStore.getState().fetchEvalData(mockEvalId);
      });

      const state = useTableStore.getState();
      expect(state.isFetching).toBe(false);
      expect(result).toBe(null);
    });
  });

  describe('computeAvailableMetrics', () => {
    it('should return a sorted array of unique metric names when the EvaluateTable contains multiple prompts with different namedScores', () => {
      const mockTable: EvaluateTable = {
        head: {
          prompts: [
            {
              raw: 'Test prompt 1',
              label: 'Test prompt 1',
              provider: 'test-provider',
              metrics: {
                ...baseMetrics,
                namedScores: {
                  accuracy: 0.9,
                  bleu: 0.8,
                },
              },
            },
            {
              raw: 'Test prompt 2',
              label: 'Test prompt 2',
              provider: 'test-provider',
              metrics: {
                ...baseMetrics,
                namedScores: {
                  rouge: 0.7,
                  bleu: 0.85,
                },
              },
            },
            {
              raw: 'Test prompt 3',
              label: 'Test prompt 3',
              provider: 'test-provider',
              metrics: {
                ...baseMetrics,
                namedScores: {},
              },
            },
            {
              raw: 'Test prompt 4',
              label: 'Test prompt 4',
              provider: 'test-provider',
            },
          ],
          vars: [],
        },
        body: [],
      };

      act(() => {
        useTableStore.getState().setTable(mockTable);
      });

      const availableMetrics = useTableStore.getState().filters.options.metric;
      expect(availableMetrics).toEqual(['accuracy', 'bleu', 'rouge']);
    });

    it('should return an empty array when the EvaluateTable contains prompts but none have metrics.namedScores defined', () => {
      const mockTable: EvaluateTable = {
        head: {
          prompts: [
            {
              raw: 'Test prompt 1',
              label: 'Test prompt 1',
              provider: 'test-provider',
              metrics: {
                ...baseMetrics,
                namedScores: {},
              },
            },
            {
              raw: 'Test prompt 2',
              label: 'Test prompt 2',
              provider: 'test-provider',
              metrics: {
                ...baseMetrics,
                namedScores: {},
              },
            },
          ],
          vars: [],
        },
        body: [],
      };

      act(() => {
        useTableStore.getState().setTable(mockTable);
      });

      const availableMetrics = useTableStore.getState().filters.options.metric;
      expect(availableMetrics).toEqual([]);
    });

    it('should handle prompts with empty namedScores objects gracefully', () => {
      const mockTable: EvaluateTable = {
        head: {
          prompts: [
            {
              raw: 'Test prompt 1',
              label: 'Test prompt 1',
              provider: 'test-provider',
              metrics: {
                ...baseMetrics,
                namedScores: {
                  accuracy: 0.9,
                  bleu: 0.8,
                },
              },
            },
            {
              raw: 'Test prompt 2',
              label: 'Test prompt 2',
              provider: 'test-provider',
              metrics: {
                ...baseMetrics,
                namedScores: {},
              },
            },
            {
              raw: 'Test prompt 3',
              label: 'Test prompt 3',
              provider: 'test-provider',
              metrics: {
                ...baseMetrics,
                namedScores: {
                  rouge: 0.7,
                },
              },
            },
          ],
          vars: [],
        },
        body: [],
      };

      act(() => {
        useTableStore.getState().setTable(mockTable);
      });

      const availableMetrics = useTableStore.getState().filters.options.metric;
      expect(availableMetrics).toEqual(['accuracy', 'bleu', 'rouge']);
    });

    it('should correctly handle unusual metric names, such as those containing special characters or very long strings', () => {
      const longMetricName = 'a'.repeat(200);
      const mockTable: EvaluateTable = {
        head: {
          prompts: [
            {
              raw: 'Test prompt 1',
              label: 'Test prompt 1',
              provider: 'test-provider',
              metrics: {
                ...baseMetrics,
                namedScores: {
                  'metric.with.dots': 0.9,
                  'metric-with-dashes': 0.8,
                  [longMetricName]: 0.7,
                },
              },
            },
          ],
          vars: [],
        },
        body: [],
      };

      act(() => {
        useTableStore.getState().setTable(mockTable);
      });

      const availableMetrics = useTableStore.getState().filters.options.metric;
      expect(availableMetrics).toEqual([longMetricName, 'metric-with-dashes', 'metric.with.dots']);
    });

    it('should handle gracefully when a prompt has metrics.namedScores set to null', () => {
      const mockTable: EvaluateTable = {
        head: {
          prompts: [
            {
              raw: 'Test prompt 1',
              label: 'Test prompt 1',
              provider: 'test-provider',
              metrics: {
                ...baseMetrics,
                namedScores: {},
              },
            },
          ],
          vars: [],
        },
        body: [],
      };

      act(() => {
        useTableStore.getState().setTable(mockTable);
      });

      const availableMetrics = useTableStore.getState().filters.options.metric;
      expect(availableMetrics).toEqual([]);
    });
  });
});
