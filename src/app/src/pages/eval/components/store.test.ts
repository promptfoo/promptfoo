import { callApi } from '@app/utils/api';
import { act } from '@testing-library/react';
import { Severity } from '@promptfoo/redteam/constants';
import { v4 as uuidv4 } from 'uuid';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { type ResultsFilter, useTableStore } from './store';

import type { EvaluateTable, PromptMetrics, ResultsFile } from './types';

vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
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

// Helper function to compute available metrics (mimics the store's computeAvailableMetrics)
function computeAvailableMetrics(table: EvaluateTable | null): string[] {
  if (!table || !table.head?.prompts) {
    return [];
  }

  const metrics = new Set<string>();
  table.head.prompts.forEach((prompt) => {
    if (prompt.metrics?.namedScores) {
      Object.keys(prompt.metrics.namedScores).forEach((metric) => metrics.add(metric));
    }
  });

  return Array.from(metrics).sort();
}

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
            metadata: [],
            plugin: [],
            strategy: [],
            severity: [],
          },
        },
        shouldHighlightSearchText: false,
        isStreaming: false,
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
        sortIndex: 0,
      });
    });

    it('should add a new severity filter to `filters.values` and increment `filters.appliedCount` when `addFilter` is called with a severity filter that has a value', () => {
      const mockFilterId = 'mock-uuid-2';
      (uuidv4 as Mock<() => string>).mockImplementation(() => mockFilterId);

      const newFilter = {
        type: 'severity' as const,
        operator: 'equals' as const,
        value: 'critical',
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
        sortIndex: 0,
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
        sortIndex: 0,
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
        sortIndex: 0,
      };

      act(() => {
        useTableStore.getState().updateFilter(updatedFilter);
      });

      const state = useTableStore.getState();
      expect(state.filters.appliedCount).toBe(0);
      expect(state.filters.values[mockFilterId].value).toBe('');
    });

    it('should decrement `filters.appliedCount` when `updateFilter` is called with a severity filter that changes from having a value to having an empty value', () => {
      const mockFilterId = 'mock-uuid-1';
      (uuidv4 as Mock<() => string>).mockImplementation(() => mockFilterId);

      const initialFilter = {
        id: mockFilterId,
        type: 'severity' as const,
        operator: 'equals' as const,
        value: 'High',
        logicOperator: 'and' as const,
        sortIndex: 0,
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
        sortIndex: 0,
      };

      act(() => {
        useTableStore.getState().updateFilter(updatedFilter);
      });

      const state = useTableStore.getState();
      expect(state.filters.appliedCount).toBe(0);
      expect(state.filters.values[mockFilterId].value).toBe('');
    });

    it("should update `filters.options.strategy` with unique strategy IDs (from both strings and objects) and always include 'basic' when `fetchEvalData` receives a config with mixed strategy types", async () => {
      const mockEvalId = 'test-eval-id';
      const mockStrategies = ['strategy1', { id: 'strategy2' }, 'strategy1', { id: 'strategy3' }];

      (callApi as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          table: { head: { prompts: [] }, body: [] },
          totalCount: 0,
          filteredCount: 0,
          config: {
            redteam: {
              strategies: mockStrategies,
            },
          },
        }),
      });

      await act(async () => {
        await useTableStore.getState().fetchEvalData(mockEvalId);
      });

      const state = useTableStore.getState();
      expect(state.filters.options.strategy).toEqual([
        'strategy1',
        'strategy2',
        'strategy3',
        'basic',
      ]);
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
        sortIndex: 0,
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

    it("should handle a null strategies array in the API response by setting filters.options.strategy to ['basic']", async () => {
      const mockEvalId = 'test-eval-id';
      (callApi as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          table: { head: { prompts: [] }, body: [] },
          totalCount: 0,
          filteredCount: 0,
          config: {
            redteam: {
              strategies: null,
            },
          },
        }),
      } as any);

      await act(async () => {
        await useTableStore.getState().fetchEvalData(mockEvalId);
      });

      const state = useTableStore.getState();
      expect(state.filters.options.strategy).toEqual(['basic']);
    });

    it('should not set isFetching to true when fetchEvalData is called with skipLoadingState=true, and should set isFetching to true when called with skipLoadingState=false (or omitted)', async () => {
      const mockEvalId = 'test-eval-id';
      (callApi as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          table: { head: { prompts: [] }, body: [] },
          totalCount: 0,
          filteredCount: 0,
        }),
        headers: new Headers(),
        redirected: false,
        status: 200,
        statusText: 'OK',
        type: 'basic',
        url: 'http://example.com',
        body: null,
        bodyUsed: false,
        clone: () =>
          ({
            json: async () => ({
              table: { head: { prompts: [] }, body: [] },
              totalCount: 0,
              filteredCount: 0,
            }),
          }) as any,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        blob: () => Promise.resolve(new Blob()),
        formData: () => Promise.resolve(new FormData()),
        text: () => Promise.resolve(''),
        bytes: () => Promise.resolve(new Uint8Array()),
      } as Response);

      const initialState = useTableStore.getState();
      expect(initialState.isFetching).toBe(false);

      await act(async () => {
        await useTableStore.getState().fetchEvalData(mockEvalId, { skipLoadingState: true });
      });

      let state = useTableStore.getState();
      expect(state.isFetching).toBe(false);

      const mockCallApi = vi.mocked(callApi);
      mockCallApi.mockClear();
      mockCallApi.mockResolvedValue({
        ok: true,
        json: async () => ({
          table: { head: { prompts: [] }, body: [] },
          totalCount: 0,
          filteredCount: 0,
        }),
        headers: new Headers(),
        redirected: false,
        status: 200,
        statusText: 'OK',
        type: 'basic',
        url: 'http://example.com',
        body: null,
        bodyUsed: false,
        clone: () =>
          ({
            json: async () => ({
              table: { head: { prompts: [] }, body: [] },
              totalCount: 0,
              filteredCount: 0,
            }),
          }) as any,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        blob: () => Promise.resolve(new Blob()),
        formData: () => Promise.resolve(new FormData()),
        text: () => Promise.resolve(''),
        bytes: () => Promise.resolve(new Uint8Array()),
      } as Response);

      let isFetchingDuringFetch: boolean = false;
      mockCallApi.mockImplementation(async () => {
        isFetchingDuringFetch = useTableStore.getState().isFetching;
        return {
          ok: true,
          json: async () => ({
            table: { head: { prompts: [] }, body: [] },
            totalCount: 0,
            filteredCount: 0,
          }),
          headers: new Headers(),
          redirected: false,
          status: 200,
          statusText: 'OK',
          type: 'basic',
          url: 'http://example.com',
          body: null,
          bodyUsed: false,
          clone: () =>
            ({
              json: async () => ({
                table: { head: { prompts: [] }, body: [] },
                totalCount: 0,
                filteredCount: 0,
              }),
            }) as any,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
          blob: () => Promise.resolve(new Blob()),
          formData: () => Promise.resolve(new FormData()),
          text: () => Promise.resolve(''),
          bytes: () => Promise.resolve(new Uint8Array()),
        } as Response;
      });

      await act(async () => {
        await useTableStore.getState().fetchEvalData(mockEvalId);
      });

      state = useTableStore.getState();
      expect(isFetchingDuringFetch).toBe(true);
      expect(state.isFetching).toBe(false);
    });

    it('should complete successfully without showing loading indicators when skipLoadingState=true and isStreaming=false', async () => {
      const mockEvalId = 'test-eval-id';
      (callApi as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          table: { head: { prompts: [] }, body: [] },
          totalCount: 0,
          filteredCount: 0,
        }),
      });

      const initialState = useTableStore.getState();
      expect(initialState.isFetching).toBe(false);

      let result;
      await act(async () => {
        result = await useTableStore
          .getState()
          .fetchEvalData(mockEvalId, { skipLoadingState: true });
      });

      const state = useTableStore.getState();
      expect(state.isFetching).toBe(false);
      expect(result).not.toBe(null);
    });

    it('should keep isFetching unchanged when fetchEvalData is called with skipLoadingState=true and the API call fails', async () => {
      const mockEvalId = 'test-eval-id';
      (callApi as Mock).mockResolvedValue({
        ok: false,
      });

      act(() => {
        useTableStore.setState({ isFetching: true });
      });

      const initialState = useTableStore.getState();
      expect(initialState.isFetching).toBe(true);

      await act(async () => {
        await useTableStore.getState().fetchEvalData(mockEvalId, { skipLoadingState: true });
      });

      const state = useTableStore.getState();
      expect(state.isFetching).toBe(true);
    });

    it('should update `filters.options.severity` with the correct severities in order when `fetchEvalData` receives a config with redteam plugins with defined severities', async () => {
      const mockEvalId = 'test-eval-id';
      const mockPlugins = [
        { id: 'plugin1', severity: Severity.High },
        { id: 'plugin2', severity: Severity.Low },
        { id: 'plugin3', severity: Severity.Critical },
        { id: 'plugin4', severity: Severity.Medium },
      ];

      (callApi as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          table: { head: { prompts: [] }, body: [] },
          totalCount: 0,
          filteredCount: 0,
          config: {
            redteam: {
              plugins: mockPlugins,
            },
          },
          version: 4,
        }),
      });

      await act(async () => {
        await useTableStore.getState().fetchEvalData(mockEvalId);
      });

      const state = useTableStore.getState();
      expect(state.filters.options.severity).toEqual([
        Severity.Critical,
        Severity.High,
        Severity.Medium,
        Severity.Low,
      ]);
    });

    it('should set `filters.options.severity` to an empty array when `fetchEvalData` receives a config with no redteam plugins', async () => {
      const mockEvalId = 'test-eval-id';
      (callApi as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          table: { head: { prompts: [] }, body: [] },
          totalCount: 0,
          filteredCount: 0,
          config: {
            redteam: {
              plugins: [],
            },
          },
        }),
      } as any);

      await act(async () => {
        await useTableStore.getState().fetchEvalData(mockEvalId);
      });

      const state = useTableStore.getState();
      expect(state.filters.options.severity).toEqual([]);
    });

    describe('shouldHighlightSearchText', () => {
      it('should keep `shouldHighlightSearchText` as `false` after data is loaded if `searchText` is empty', async () => {
        const mockEvalId = 'test-eval-id';
        (callApi as Mock).mockResolvedValue({
          ok: true,
          json: async () => ({
            table: { head: { prompts: [] }, body: [] },
            totalCount: 0,
            filteredCount: 0,
          }),
        });

        await act(async () => {
          await useTableStore.getState().fetchEvalData(mockEvalId, { searchText: '' });
        });

        const state = useTableStore.getState();
        expect(state.shouldHighlightSearchText).toBe(false);
      });

      it('should set `shouldHighlightSearchText` to `false` when `fetchEvalData` is called, and then to `true` after data is loaded if `searchText` is non-empty', async () => {
        const mockEvalId = 'test-eval-id';
        const mockSearchText = 'test search text';
        (callApi as Mock).mockResolvedValue({
          ok: true,
          json: async () => ({
            table: { head: { prompts: [] }, body: [] },
            totalCount: 0,
            filteredCount: 0,
            config: {},
            version: 4,
            author: 'test',
          }),
        } as any);

        const initialState = useTableStore.getState();
        expect(initialState.shouldHighlightSearchText).toBe(false);

        let stateAfterFetch = initialState;
        await act(async () => {
          await useTableStore.getState().fetchEvalData(mockEvalId, { searchText: mockSearchText });
          stateAfterFetch = useTableStore.getState();
        });

        expect(stateAfterFetch.shouldHighlightSearchText).toBe(true);
      });

      it('should update shouldHighlightSearchText based on the most recent completed request when multiple fetchEvalData calls are made in succession', async () => {
        const mockEvalId = 'test-eval-id';
        const mockCallApi = vi.mocked(callApi);

        mockCallApi
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              table: { head: { prompts: [] }, body: [] },
              totalCount: 0,
              filteredCount: 0,
              config: {},
              version: 4,
            }),
          } as any)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              table: { head: { prompts: [] }, body: [] },
              totalCount: 0,
              filteredCount: 0,
              config: {},
              version: 4,
            }),
          } as any)
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              table: { head: { prompts: [] }, body: [] },
              totalCount: 0,
              filteredCount: 0,
              config: {},
              version: 4,
            }),
          } as any);

        await act(async () => {
          await useTableStore
            .getState()
            .fetchEvalData(mockEvalId, { searchText: 'initial search' });
          await useTableStore
            .getState()
            .fetchEvalData(mockEvalId, { searchText: 'another search' });
          await useTableStore.getState().fetchEvalData(mockEvalId, { searchText: '' });
        });

        expect(useTableStore.getState().shouldHighlightSearchText).toBe(false);
      });

      it('should update shouldHighlightSearchText from true to false when fetchEvalData is called with non-empty search text and then with empty search text', async () => {
        const mockEvalId = 'test-eval-id';
        (callApi as Mock).mockResolvedValue({
          ok: true,
          json: async () => ({
            table: { head: { prompts: [] }, body: [] },
            totalCount: 0,
            filteredCount: 0,
          }),
        });

        let state = useTableStore.getState();
        expect(state.shouldHighlightSearchText).toBe(false);

        await act(async () => {
          await useTableStore.getState().fetchEvalData(mockEvalId, { searchText: 'test' });
        });

        state = useTableStore.getState();
        expect(state.shouldHighlightSearchText).toBe(true);

        await act(async () => {
          await useTableStore.getState().fetchEvalData(mockEvalId, { searchText: '' });
        });

        state = useTableStore.getState();
        expect(state.shouldHighlightSearchText).toBe(false);
      });

      it('should not show search highlights when isFetching is true, even if shouldHighlightSearchText is true', async () => {
        const mockEvalId = 'test-eval-id';
        let resolvePromise: (value: any) => void = () => {};
        const _mockPromise = new Promise((resolve) => {
          resolvePromise = resolve;
        });

        (callApi as Mock).mockReturnValue({
          ok: true,
          json: async () => ({
            table: { head: { prompts: [] }, body: [] },
            totalCount: 0,
            filteredCount: 0,
          }),
        });

        act(() => {
          useTableStore.setState({ shouldHighlightSearchText: true });
        });

        const initialState = useTableStore.getState();
        expect(initialState.isFetching).toBe(false);
        expect(initialState.shouldHighlightSearchText).toBe(true);

        let stateDuringFetch: any;
        act(() => {
          useTableStore.getState().fetchEvalData(mockEvalId, { searchText: 'test' });
          stateDuringFetch = useTableStore.getState();
        });

        expect(stateDuringFetch.isFetching).toBe(true);
        expect(stateDuringFetch.shouldHighlightSearchText).toBe(false);

        await act(async () => {
          resolvePromise({
            table: { head: { prompts: [] }, body: [] },
            totalCount: 0,
            filteredCount: 0,
          });
        });

        const state = useTableStore.getState();
        expect(state.isFetching).toBe(false);
        expect(state.shouldHighlightSearchText).toBe(true);
      });
    });
  });

  it('should set isStreaming to true when setIsStreaming(true) is called, and to false when setIsStreaming(false) is called', () => {
    const initialState = useTableStore.getState();
    expect(initialState.isStreaming).toBe(false);

    act(() => {
      useTableStore.getState().setIsStreaming(true);
    });

    expect(useTableStore.getState().isStreaming).toBe(true);

    act(() => {
      useTableStore.getState().setIsStreaming(false);
    });

    expect(useTableStore.getState().isStreaming).toBe(false);
  });

  describe('isStreaming and fetchEvalData interaction', () => {
    it('should set isFetching to false when isStreaming is true and fetchEvalData is called without skipLoadingState', async () => {
      const mockEvalId = 'test-eval-id';
      (callApi as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          table: { head: { prompts: [] }, body: [] },
          totalCount: 0,
          filteredCount: 0,
        }),
      });

      act(() => {
        useTableStore.getState().setIsStreaming(true);
      });

      await act(async () => {
        await useTableStore.getState().fetchEvalData(mockEvalId);
      });

      const state = useTableStore.getState();
      expect(state.isFetching).toBe(false);
    });

    it('should reset isStreaming to false when an error occurs during a streaming update', async () => {
      const mockEvalId = 'test-eval-id';
      (callApi as Mock).mockRejectedValue(new Error('API error'));

      act(() => {
        useTableStore.getState().setIsStreaming(true);
      });

      expect(useTableStore.getState().isStreaming).toBe(true);

      await act(async () => {
        try {
          await useTableStore.getState().fetchEvalData(mockEvalId);
        } catch (_e) {}
      });

      expect(useTableStore.getState().isStreaming).toBe(false);
    });

    it('should allow isStreaming and isFetching to be true simultaneously when fetchEvalData is called without skipLoadingState and isStreaming is already true', async () => {
      const mockEvalId = 'test-eval-id';
      (callApi as Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          table: { head: { prompts: [] }, body: [] },
          totalCount: 0,
          filteredCount: 0,
        }),
      });

      act(() => {
        useTableStore.getState().setIsStreaming(true);
      });

      let isFetchingDuringFetch = false;
      let isStreamingDuringFetch = false;

      const originalFetchEvalData = useTableStore.getState().fetchEvalData;
      const wrappedFetchEvalData = async (id: string, options?: any) => {
        const result = originalFetchEvalData(id, options);
        // Check state immediately after fetchEvalData starts (which sets isFetching: true)
        isFetchingDuringFetch = useTableStore.getState().isFetching;
        isStreamingDuringFetch = useTableStore.getState().isStreaming;
        return result;
      };

      useTableStore.setState({ fetchEvalData: wrappedFetchEvalData });

      await act(async () => {
        await useTableStore.getState().fetchEvalData(mockEvalId);
      });

      expect(isFetchingDuringFetch).toBe(true);
      expect(isStreamingDuringFetch).toBe(true);
    });
  });

  describe('setTableFromResultsFile', () => {
    it("should set `filters.options.strategy` to only include 'basic' when `setTableFromResultsFile` is called with a resultsFile that has no strategies defined", () => {
      const mockResultsFile: ResultsFile = {
        version: 4,
        config: {
          redteam: {
            strategies: [],
          },
        },
        results: {
          results: [],
        } as any,
        prompts: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        author: 'test',
      };

      act(() => {
        useTableStore.getState().setTableFromResultsFile(mockResultsFile);
      });

      const state = useTableStore.getState();
      expect(state.filters.options.strategy).toEqual(['basic']);
    });

    it('should deduplicate strategy IDs in filters.options.strategy when resultsFile contains duplicate strategy IDs', () => {
      const resultsFile: ResultsFile = {
        version: 3,
        config: {
          redteam: {
            strategies: ['strategy1', 'strategy2', 'strategy1'],
          },
        },
        results: {
          table: {
            head: { prompts: [], vars: [] },
            body: [],
          },
        },
        prompts: [],
      } as any;

      act(() => {
        useTableStore.getState().setTableFromResultsFile(resultsFile);
      });

      const state = useTableStore.getState();
      expect(state.filters.options.strategy).toEqual(['strategy1', 'strategy2', 'basic']);
    });

    it('should populate `filters.options.severity` with the correct severities in order when `setTableFromResultsFile` is called with a resultsFile containing redteam plugins with defined severities', () => {
      const mockResultsFile: ResultsFile = {
        version: 4,
        config: {
          redteam: {
            plugins: [
              { id: 'plugin1', severity: Severity.Critical },
              { id: 'plugin2', severity: Severity.High },
              { id: 'plugin3', severity: Severity.Medium },
              { id: 'plugin4', severity: Severity.Low },
            ],
          },
        },
        results: {
          results: [],
        } as any,
        prompts: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        author: 'test',
      };

      act(() => {
        useTableStore.getState().setTableFromResultsFile(mockResultsFile);
      });

      const state = useTableStore.getState();
      expect(state.filters.options.severity).toEqual([
        Severity.Critical,
        Severity.High,
        Severity.Medium,
        Severity.Low,
      ]);
    });

    it('should correctly populate severity options when handling a results file with version < 4 that contains redteam plugins with severities', () => {
      const mockResultsFile: ResultsFile = {
        version: 3,
        config: {
          redteam: {
            plugins: [
              { id: 'plugin1', severity: Severity.Critical },
              { id: 'plugin2', severity: Severity.High },
              { id: 'plugin3', severity: Severity.Medium },
              { id: 'plugin4', severity: Severity.Low },
            ],
          },
        },
        results: {
          table: {
            head: { prompts: [], vars: [] },
            body: [],
          },
        } as any,
        prompts: [],
      } as any;

      act(() => {
        useTableStore.getState().setTableFromResultsFile(mockResultsFile);
      });

      const state = useTableStore.getState();
      expect(state.filters.options.severity).toEqual([
        Severity.Critical,
        Severity.High,
        Severity.Medium,
        Severity.Low,
      ]);
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
        useTableStore.setState({
          table: mockTable,
          filters: {
            values: {},
            appliedCount: 0,
            options: {
              metric: computeAvailableMetrics(mockTable),
              metadata: [],
              plugin: [],
              strategy: [],
              severity: [],
            },
          },
        });
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
        useTableStore.setState({
          table: mockTable,
          filters: {
            values: {},
            appliedCount: 0,
            options: {
              metric: computeAvailableMetrics(mockTable),
              metadata: [],
              plugin: [],
              strategy: [],
              severity: [],
            },
          },
        });
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
        useTableStore.setState({
          table: mockTable,
          filters: {
            values: {},
            appliedCount: 0,
            options: {
              metric: computeAvailableMetrics(mockTable),
              metadata: [],
              plugin: [],
              strategy: [],
              severity: [],
            },
          },
        });
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
        useTableStore.setState({
          table: mockTable,
          filters: {
            values: {},
            appliedCount: 0,
            options: {
              metric: computeAvailableMetrics(mockTable),
              metadata: [],
              plugin: [],
              strategy: [],
              severity: [],
            },
          },
        });
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
        useTableStore.setState({
          table: mockTable,
          filters: {
            values: {},
            appliedCount: 0,
            options: {
              metric: computeAvailableMetrics(mockTable),
              metadata: [],
              plugin: [],
              strategy: [],
              severity: [],
            },
          },
        });
      });

      const availableMetrics = useTableStore.getState().filters.options.metric;
      expect(availableMetrics).toEqual([]);
    });
  });

  describe('computeAvailableSeverities', () => {
    beforeEach(() => {
      act(() => {
        useTableStore.setState(useTableStore.getInitialState(), true);
      });
    });

    it('should return a sorted array of unique severity values when plugins have defined severities', () => {
      const mockResultsFile: ResultsFile = {
        version: 4,
        config: {
          redteam: {
            plugins: [
              { id: 'plugin-medium', severity: Severity.Medium },
              { id: 'plugin-critical', severity: Severity.Critical },
              { id: 'plugin-low', severity: Severity.Low },
              { id: 'plugin-high', severity: Severity.High },
              { id: 'plugin-critical-duplicate', severity: Severity.Critical },
            ],
          },
        },
        results: {
          results: [],
        } as any,
        prompts: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        author: 'test',
      };

      act(() => {
        useTableStore.getState().setTableFromResultsFile(mockResultsFile);
      });

      const state = useTableStore.getState();
      const expectedSeverities = [Severity.Critical, Severity.High, Severity.Medium, Severity.Low];

      expect(state.filters.options.severity).toEqual(expectedSeverities);
    });

    it('should return the correct severities based on the default riskCategorySeverityMap when given an array of plugin IDs (strings) without explicit severity overrides', () => {
      const pluginIds = ['pii', 'jailbreak', 'prompt-injection'];
      const mockResultsFile: ResultsFile = {
        version: 4,
        config: {
          redteam: {
            plugins: pluginIds.map((id) => ({ id })),
          },
        },
        results: {
          results: [],
        } as any,
        prompts: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        author: 'test',
      };

      act(() => {
        useTableStore.getState().setTableFromResultsFile(mockResultsFile);
      });

      const state = useTableStore.getState();
      const expectedSeverities = [Severity.Critical, Severity.High, Severity.Medium, Severity.Low];
      expect(state.filters.options.severity).toEqual(expectedSeverities);
    });

    it('should handle case-insensitive severity values correctly', () => {
      const mockResultsFile: ResultsFile = {
        version: 4,
        config: {
          redteam: {
            plugins: [{ id: 'plugin-critical', severity: Severity.Critical }],
          },
        },
        results: {
          results: [],
        } as any,
        prompts: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        author: 'test',
      };

      act(() => {
        useTableStore.getState().setTableFromResultsFile(mockResultsFile);
      });

      const state = useTableStore.getState();
      expect(state.filters.options.severity).toContain(Severity.Critical);
    });
  });
});
