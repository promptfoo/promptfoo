/**
 * Hooks for reading computed values from the table store.
 *
 * This is the recommended practice by Zustand's author (see https://github.com/pmndrs/zustand/issues/132#issuecomment-1688161013).
 */

import { useMemo } from 'react';

import { useTableStore } from './store';
import {
  calculateFilteredPassRates,
  calculateFilteredTestCounts,
  calculateFilteredPassingTestCounts,
  applyClientSideFiltering,
} from './calculations';

/**
 * Returns the number of passing tests for each prompt.
 *
 * @returns An array of numbers, one for each prompt. Returns an empty array if the table is not defined.
 */
export function usePassingTestCounts(): number[] {
  const { table } = useTableStore();

  return table
    ? useMemo(
        () => table.head.prompts.map((prompt) => prompt.metrics?.testPassCount || 0),
        [table.head.prompts],
      )
    : [];
}

/**
 * Returns the number of tests for each prompt.
 *
 * @returns An array of numbers, one for each prompt. Returns an empty array if the table is not defined.
 */
export function useTestCounts(): number[] {
  const { table } = useTableStore();

  return table
    ? useMemo(
        () =>
          table.head.prompts.map(
            (prompt) => (prompt.metrics?.testPassCount ?? 0) + (prompt.metrics?.testFailCount ?? 0),
          ),
        [table.head.prompts],
      )
    : [];
}

/**
 * Returns the pass rate for each prompt.
 *
 * @returns An array of numbers, one for each prompt. Returns an empty array if the table is not defined.
 */
export function usePassRates(): number[] {
  const numTests = useTestCounts();
  const numPassing = usePassingTestCounts();

  return useMemo(
    () =>
      numPassing.map((passing, idx) => (numTests[idx] === 0 ? 0 : (passing / numTests[idx]) * 100)),
    [numPassing, numTests],
  );
}

// ===== FILTERED METRICS HOOKS =====
// These hooks provide real-time metrics that update based on applied filters

/**
 * SHARED COMPUTATION HOOK: Computes all filtered metrics in one pass.
 * This prevents redundant filtering computations across multiple hooks.
 */
export function useFilteredMetrics(searchText: string = '') {
  const { table, filterMode, filters } = useTableStore();

  // Compute applied filters and stable dependency string in one pass
  const { appliedFilters, appliedFiltersString } = useMemo(() => {
    const appliedFilters = Object.values(filters.values).filter((filter) =>
      filter.type === 'metadata' ? Boolean(filter.value && filter.field) : Boolean(filter.value),
    );

    const appliedFiltersString = JSON.stringify(
      appliedFilters
        .sort((a, b) => a.sortIndex - b.sortIndex)
        .map(f => ({ type: f.type, operator: f.operator, value: f.value, field: f.field, logicOperator: f.logicOperator }))
    );

    return { appliedFilters, appliedFiltersString };
  }, [filters.values]);

  return useMemo(() => {
    if (!table?.body || !table?.head.prompts) {
      return {
        filteredRows: [],
        testCounts: [],
        passingTestCounts: [],
        passRates: [],
      };
    }

    const filteredRows = applyClientSideFiltering(table.body, filterMode, searchText, appliedFilters);
    const numPrompts = table.head.prompts.length;

    // Calculate ALL metrics in one pass for efficiency
    const testCounts = calculateFilteredTestCounts(filteredRows, numPrompts);
    const passingTestCounts = calculateFilteredPassingTestCounts(filteredRows, numPrompts);
    const passRates = calculateFilteredPassRates(filteredRows, numPrompts);

    return {
      filteredRows,
      testCounts,
      passingTestCounts,
      passRates,
    };
  }, [table?.body, table?.head.prompts, filterMode, appliedFiltersString, searchText]);
}

/**
 * Returns filtered rows based on current filter state.
 */
export function useFilteredTableRows(searchText: string = '') {
  const { filteredRows } = useFilteredMetrics(searchText);
  return filteredRows;
}

/**
 * Returns the number of passing tests for each prompt from filtered data.
 */
export function useFilteredPassingTestCounts(searchText: string = ''): number[] {
  const { passingTestCounts } = useFilteredMetrics(searchText);
  return passingTestCounts;
}

/**
 * Returns the total number of tests for each prompt from filtered data.
 */
export function useFilteredTestCounts(searchText: string = ''): number[] {
  const { testCounts } = useFilteredMetrics(searchText);
  return testCounts;
}

/**
 * Returns the pass rate for each prompt from filtered data.
 */
export function useFilteredPassRates(searchText: string = ''): number[] {
  const { passRates } = useFilteredMetrics(searchText);
  return passRates;
}
