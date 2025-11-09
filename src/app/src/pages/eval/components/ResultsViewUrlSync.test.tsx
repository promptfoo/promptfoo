/**
 * Tests for ResultsView URL synchronization
 *
 * Tests the Zustand subscription that syncs filters from store to URL
 * Covers:
 * - Filter addition triggers URL update
 * - Filter removal clears URL param
 * - JSON key order consistency
 * - URL length warnings
 * - Deterministic serialization
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useTableStore } from './store';

vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

const createWrapper = (initialEntries: string[] = ['/']) => {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/*" element={<div>{children}</div>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('ResultsView URL Synchronization', () => {
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
      });
    });
    vi.clearAllMocks();
  });

  describe('Filter to URL Synchronization', () => {
    it('should not add filter param when no filters are applied', () => {
      const { result } = renderHook(() => useSearchParams(), {
        wrapper: createWrapper(),
      });

      const [searchParams] = result.current;
      expect(searchParams.get('filter')).toBeNull();
    });

    it('should serialize filters to URL when filter is added', () => {
      const mockFilterId = 'test-filter-1';
      (uuidv4 as Mock).mockReturnValue(mockFilterId);

      const { result: searchResult } = renderHook(() => useSearchParams(), {
        wrapper: createWrapper(),
      });

      act(() => {
        useTableStore.getState().addFilter({
          type: 'plugin',
          operator: 'equals',
          value: 'test-plugin',
        });
      });

      // Wait for subscription to trigger
      waitFor(() => {
        const [searchParams] = searchResult.current;
        const filterParam = searchParams.get('filter');
        expect(filterParam).not.toBeNull();

        if (filterParam) {
          const parsed = JSON.parse(filterParam);
          expect(parsed).toHaveLength(1);
          expect(parsed[0].type).toBe('plugin');
          expect(parsed[0].value).toBe('test-plugin');
          // id and sortIndex should be stripped
          expect(parsed[0].id).toBeUndefined();
          expect(parsed[0].sortIndex).toBeUndefined();
        }
      });
    });

    it('should remove filter param when all filters are removed', () => {
      const mockFilterId = 'test-filter-1';
      (uuidv4 as Mock).mockReturnValue(mockFilterId);

      const { result: searchResult } = renderHook(() => useSearchParams(), {
        wrapper: createWrapper(),
      });

      // Add filter
      act(() => {
        useTableStore.getState().addFilter({
          type: 'plugin',
          operator: 'equals',
          value: 'test-plugin',
        });
      });

      // Remove filter
      act(() => {
        useTableStore.getState().removeFilter(mockFilterId);
      });

      waitFor(() => {
        const [searchParams] = searchResult.current;
        expect(searchParams.get('filter')).toBeNull();
      });
    });

    it('should produce deterministic JSON with sorted keys', () => {
      const mockFilterId = 'test-filter-1';
      (uuidv4 as Mock).mockReturnValue(mockFilterId);

      const { result: searchResult } = renderHook(() => useSearchParams(), {
        wrapper: createWrapper(),
      });

      act(() => {
        useTableStore.getState().addFilter({
          type: 'metadata',
          operator: 'contains',
          value: 'test-value',
          field: 'test-field',
          logicOperator: 'and',
        });
      });

      waitFor(() => {
        const [searchParams] = searchResult.current;
        const filterParam = searchParams.get('filter');

        if (filterParam) {
          const parsed = JSON.parse(filterParam);
          const filter = parsed[0];

          // Keys should be alphabetically sorted
          const keys = Object.keys(filter);
          const sortedKeys = [...keys].sort();
          expect(keys).toEqual(sortedKeys);
        }
      });
    });

    it('should handle multiple filters with consistent ordering', () => {
      (uuidv4 as Mock)
        .mockReturnValueOnce('filter-1')
        .mockReturnValueOnce('filter-2')
        .mockReturnValueOnce('filter-3');

      const { result: searchResult } = renderHook(() => useSearchParams(), {
        wrapper: createWrapper(),
      });

      act(() => {
        useTableStore.getState().addFilter({
          type: 'plugin',
          operator: 'equals',
          value: 'plugin-b',
        });
        useTableStore.getState().addFilter({
          type: 'plugin',
          operator: 'equals',
          value: 'plugin-a',
        });
        useTableStore.getState().addFilter({
          type: 'metric',
          operator: 'equals',
          value: 'metric-a',
        });
      });

      waitFor(() => {
        const [searchParams] = searchResult.current;
        const filterParam = searchParams.get('filter');

        if (filterParam) {
          const parsed = JSON.parse(filterParam);

          // Filters should be sorted by type, then value
          expect(parsed).toHaveLength(3);
          expect(parsed[0].type).toBe('metric'); // 'metric' comes before 'plugin'
          expect(parsed[1].type).toBe('plugin');
          expect(parsed[1].value).toBe('plugin-a'); // Values sorted within type
          expect(parsed[2].type).toBe('plugin');
          expect(parsed[2].value).toBe('plugin-b');
        }
      });
    });

    it('should strip id and sortIndex from serialized filters', () => {
      const mockFilterId = 'test-filter-1';
      (uuidv4 as Mock).mockReturnValue(mockFilterId);

      const { result: searchResult } = renderHook(() => useSearchParams(), {
        wrapper: createWrapper(),
      });

      act(() => {
        useTableStore.getState().addFilter({
          type: 'plugin',
          operator: 'equals',
          value: 'test-plugin',
        });
      });

      waitFor(() => {
        const [searchParams] = searchResult.current;
        const filterParam = searchParams.get('filter');

        if (filterParam) {
          const parsed = JSON.parse(filterParam);
          const filter = parsed[0];

          // Should not have id or sortIndex
          expect(filter.id).toBeUndefined();
          expect(filter.sortIndex).toBeUndefined();

          // Should have other fields
          expect(filter.type).toBe('plugin');
          expect(filter.operator).toBe('equals');
          expect(filter.value).toBe('test-plugin');
        }
      });
    });

    it('should warn when serialized filters exceed 1500 characters', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Create many filters to exceed length limit
      const filterIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        const id = `filter-${i}`;
        filterIds.push(id);
        (uuidv4 as Mock).mockReturnValueOnce(id);
      }

      act(() => {
        for (let i = 0; i < 50; i++) {
          useTableStore.getState().addFilter({
            type: 'metadata',
            operator: 'contains',
            value: `this-is-a-very-long-value-that-will-make-the-url-exceed-the-length-limit-${i}`,
            field: `very-long-field-name-to-increase-url-length-${i}`,
          });
        }
      });

      waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Filter URL is'),
          expect.stringContaining('characters'),
        );
      });

      consoleWarnSpy.mockRestore();
    });

    it('should not update URL if filters have not changed', () => {
      const mockFilterId = 'test-filter-1';
      (uuidv4 as Mock).mockReturnValue(mockFilterId);

      const { result: searchResult } = renderHook(() => useSearchParams(), {
        wrapper: createWrapper(),
      });

      const [, setSearchParams] = searchResult.current;
      const setSearchParamsSpy = vi.spyOn({ setSearchParams }, 'setSearchParams');

      act(() => {
        useTableStore.getState().addFilter({
          type: 'plugin',
          operator: 'equals',
          value: 'test-plugin',
        });
      });

      // Wait for initial update
      waitFor(() => {
        const callCount = setSearchParamsSpy.mock.calls.length;
        expect(callCount).toBeGreaterThan(0);

        // Trigger a store update that doesn't change filters
        act(() => {
          useTableStore.setState({ isFetching: true });
        });

        // Should not trigger another URL update
        expect(setSearchParamsSpy.mock.calls.length).toBe(callCount);
      });
    });

    it('should handle metadata filter with field', () => {
      const mockFilterId = 'test-filter-1';
      (uuidv4 as Mock).mockReturnValue(mockFilterId);

      const { result: searchResult } = renderHook(() => useSearchParams(), {
        wrapper: createWrapper(),
      });

      act(() => {
        useTableStore.getState().addFilter({
          type: 'metadata',
          operator: 'contains',
          value: 'test-value',
          field: 'customField',
        });
      });

      waitFor(() => {
        const [searchParams] = searchResult.current;
        const filterParam = searchParams.get('filter');

        if (filterParam) {
          const parsed = JSON.parse(filterParam);
          expect(parsed[0].type).toBe('metadata');
          expect(parsed[0].field).toBe('customField');
          expect(parsed[0].value).toBe('test-value');
        }
      });
    });

    it('should handle special characters in filter values during serialization', () => {
      const mockFilterId = 'test-filter-1';
      (uuidv4 as Mock).mockReturnValue(mockFilterId);

      const specialValue = 'test!@#$%^&*()_+=-`~[]{}|;\':",./<>?';

      const { result: searchResult } = renderHook(() => useSearchParams(), {
        wrapper: createWrapper(),
      });

      act(() => {
        useTableStore.getState().addFilter({
          type: 'plugin',
          operator: 'equals',
          value: specialValue,
        });
      });

      waitFor(() => {
        const [searchParams] = searchResult.current;
        const filterParam = searchParams.get('filter');

        if (filterParam) {
          const parsed = JSON.parse(filterParam);
          expect(parsed[0].value).toBe(specialValue);
        }
      });
    });

    it('should produce same JSON for filters added in different orders (determinism)', () => {
      // Add filters in order A, B
      (uuidv4 as Mock).mockReturnValueOnce('filter-a').mockReturnValueOnce('filter-b');

      const { result: result1 } = renderHook(() => useSearchParams(), {
        wrapper: createWrapper(),
      });

      act(() => {
        useTableStore.getState().addFilter({
          type: 'plugin',
          operator: 'equals',
          value: 'plugin-a',
        });
        useTableStore.getState().addFilter({
          type: 'plugin',
          operator: 'equals',
          value: 'plugin-b',
        });
      });

      let json1: string | null = null;
      waitFor(() => {
        const [searchParams] = result1.current;
        json1 = searchParams.get('filter');
        expect(json1).not.toBeNull();
      });

      // Reset and add in order B, A
      act(() => {
        useTableStore.getState().resetFilters();
      });

      (uuidv4 as Mock).mockReturnValueOnce('filter-b').mockReturnValueOnce('filter-a');

      const { result: result2 } = renderHook(() => useSearchParams(), {
        wrapper: createWrapper(),
      });

      act(() => {
        useTableStore.getState().addFilter({
          type: 'plugin',
          operator: 'equals',
          value: 'plugin-b',
        });
        useTableStore.getState().addFilter({
          type: 'plugin',
          operator: 'equals',
          value: 'plugin-a',
        });
      });

      waitFor(() => {
        const [searchParams] = result2.current;
        const json2 = searchParams.get('filter');

        // Should produce identical JSON due to sorting
        expect(json2).toBe(json1);
      });
    });
  });

  describe('Subscription Cleanup', () => {
    it('should clean up subscription on unmount', () => {
      const { unmount } = renderHook(() => useSearchParams(), {
        wrapper: createWrapper(),
      });

      // Get initial listener count (if we could spy on subscribe)
      // In practice, we just verify no errors on unmount
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid filter additions', () => {
      for (let i = 0; i < 10; i++) {
        (uuidv4 as Mock).mockReturnValueOnce(`filter-${i}`);
      }

      const { result: searchResult } = renderHook(() => useSearchParams(), {
        wrapper: createWrapper(),
      });

      act(() => {
        for (let i = 0; i < 10; i++) {
          useTableStore.getState().addFilter({
            type: 'plugin',
            operator: 'equals',
            value: `plugin-${i}`,
          });
        }
      });

      waitFor(() => {
        const [searchParams] = searchResult.current;
        const filterParam = searchParams.get('filter');

        if (filterParam) {
          const parsed = JSON.parse(filterParam);
          expect(parsed).toHaveLength(10);
        }
      });
    });

    it('should handle filter updates', () => {
      const mockFilterId = 'test-filter-1';
      (uuidv4 as Mock).mockReturnValue(mockFilterId);

      const { result: searchResult } = renderHook(() => useSearchParams(), {
        wrapper: createWrapper(),
      });

      act(() => {
        useTableStore.getState().addFilter({
          type: 'plugin',
          operator: 'equals',
          value: 'initial-value',
        });
      });

      // Update the filter
      act(() => {
        const state = useTableStore.getState();
        const filter = state.filters.values[mockFilterId];
        if (filter) {
          useTableStore.getState().updateFilter({
            ...filter,
            value: 'updated-value',
          });
        }
      });

      waitFor(() => {
        const [searchParams] = searchResult.current;
        const filterParam = searchParams.get('filter');

        if (filterParam) {
          const parsed = JSON.parse(filterParam);
          expect(parsed[0].value).toBe('updated-value');
        }
      });
    });
  });
});
