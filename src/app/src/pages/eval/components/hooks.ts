/**
 * Hooks for reading computed values from the table store.
 *
 * This is the recommended practice by Zustand's author (see https://github.com/pmndrs/zustand/issues/132#issuecomment-1688161013).
 */

import { useMemo } from 'react';

import { useTableStore } from './store';

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
