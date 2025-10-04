import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import type { EvalResultsFilterMode } from '@promptfoo/types';
import type { ResultsFilter, ResultsFilterType } from '../types';
import { isFilterApplied } from '../utils/tableUtils';

/**
 * Client-side UI state for the eval results view.
 *
 * This store contains ONLY client state (no server data):
 * - Filter selections
 * - Filter mode
 * - UI flags
 * - Current eval ID being viewed
 *
 * Server data (table, config, etc.) is managed by React Query hooks.
 */
interface EvalUIState {
  // Current eval being viewed
  evalId: string | null;
  setEvalId: (evalId: string) => void;

  // Filter state
  filters: {
    /**
     * The filters that are currently defined. Note that a filter is only applied once it has
     * a non-empty string value defined.
     */
    values: Record<ResultsFilter['id'], ResultsFilter>;
    /**
     * The number of filters that have a value i.e. they're applied.
     */
    appliedCount: number;
  };

  /**
   * Adds a new filter to the filters array.
   */
  addFilter: (filter: {
    type: ResultsFilterType;
    operator: ResultsFilter['operator'];
    value: string;
    logicOperator?: ResultsFilter['logicOperator'];
    field?: string;
  }) => void;

  /**
   * Removes a filter from the filters array.
   */
  removeFilter: (id: ResultsFilter['id']) => void;

  /**
   * Removes all filters from the filters array.
   */
  removeAllFilters: () => void;

  /**
   * Resets all filters to their initial state.
   */
  resetFilters: () => void;

  /**
   * Updates a filter in the filters array.
   */
  updateFilter: (filter: ResultsFilter) => void;

  /**
   * Updates the logic operator for all filters.
   */
  updateAllFilterLogicOperators: (logicOperator: ResultsFilter['logicOperator']) => void;

  // Filter mode
  filterMode: EvalResultsFilterMode;
  setFilterMode: (filterMode: EvalResultsFilterMode) => void;
  resetFilterMode: () => void;

  // UI flags
  isStreaming: boolean;
  setIsStreaming: (isStreaming: boolean) => void;
  shouldHighlightSearchText: boolean;
  setShouldHighlightSearchText: (shouldHighlight: boolean) => void;
}

export const useEvalUIStore = create<EvalUIState>((set, get) => ({
  evalId: null,
  setEvalId: (evalId: string) => set(() => ({ evalId })),

  filters: {
    values: {},
    appliedCount: 0,
  },

  addFilter: (filter) => {
    const filterId = uuidv4();

    set((prevState) => {
      const isApplied = isFilterApplied(filter);
      const appliedCount = prevState.filters.appliedCount + (isApplied ? 1 : 0);

      // Calculate the next sortIndex
      const existingFilters = Object.values(prevState.filters.values);
      const maxSortIndex =
        existingFilters.length > 0 ? Math.max(...existingFilters.map((f) => f.sortIndex)) : -1;
      const nextSortIndex = maxSortIndex + 1;

      return {
        filters: {
          ...prevState.filters,
          values: {
            ...prevState.filters.values,
            [filterId]: {
              ...filter,
              id: filterId,
              // Default to 'and' logic operator if not provided.
              logicOperator: filter.logicOperator ?? 'and',
              // Include field for metadata filters
              field: filter.field,
              sortIndex: nextSortIndex,
            },
          },
          appliedCount,
        },
      };
    });
  },

  removeFilter: (id: ResultsFilter['id']) => {
    set((prevState) => {
      const target = prevState.filters.values[id];
      const wasApplied = isFilterApplied(target);
      const appliedCount = prevState.filters.appliedCount - (wasApplied ? 1 : 0);
      const values = { ...prevState.filters.values };
      delete values[id];

      // Always reassign sortIndex values to ensure consecutive ordering (0, 1, 2, ...)
      // This ensures that when any filter is removed, the remaining filters maintain proper ordering
      const remainingFilters = Object.values(values).sort((a, b) => a.sortIndex - b.sortIndex);
      remainingFilters.forEach((filter, index) => {
        values[filter.id] = {
          ...filter,
          sortIndex: index,
        };
      });

      return {
        filters: {
          ...prevState.filters,
          values,
          appliedCount,
        },
      };
    });
  },

  removeAllFilters: () => {
    set((prevState) => ({
      filters: {
        ...prevState.filters,
        values: {},
        appliedCount: 0,
      },
    }));
  },

  resetFilters: () => {
    set((prevState) => ({
      filters: {
        ...prevState.filters,
        values: {},
        appliedCount: 0,
      },
    }));
  },

  updateFilter: (filter: ResultsFilter) => {
    set((prevState) => {
      const target = prevState.filters.values[filter.id];
      const targetWasApplied = isFilterApplied(target);
      const filterIsApplied = isFilterApplied(filter);
      const appliedCount =
        prevState.filters.appliedCount - (targetWasApplied ? 1 : 0) + (filterIsApplied ? 1 : 0);

      return {
        filters: {
          ...prevState.filters,
          values: {
            ...prevState.filters.values,
            [filter.id]: filter,
          },
          appliedCount,
        },
      };
    });
  },

  updateAllFilterLogicOperators: (logicOperator: ResultsFilter['logicOperator']) => {
    set((prevState) => {
      const updatedValues: Record<string, ResultsFilter> = {};
      Object.entries(prevState.filters.values).forEach(([id, filter]) => {
        updatedValues[id] = { ...filter, logicOperator };
      });
      return {
        filters: {
          ...prevState.filters,
          values: updatedValues,
        },
      };
    });
  },

  filterMode: 'all',
  setFilterMode: (filterMode: EvalResultsFilterMode) => set(() => ({ filterMode })),
  resetFilterMode: () => set(() => ({ filterMode: 'all' })),

  isStreaming: false,
  setIsStreaming: (isStreaming: boolean) => set(() => ({ isStreaming })),

  shouldHighlightSearchText: false,
  setShouldHighlightSearchText: (shouldHighlight: boolean) =>
    set(() => ({ shouldHighlightSearchText: shouldHighlight })),
}));
