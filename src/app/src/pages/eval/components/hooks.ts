/**
 * Hooks for reading computed values from the table store.
 *
 * This is the recommended practice by Zustand's author (see https://github.com/pmndrs/zustand/issues/132#issuecomment-1688161013).
 */

import { useMemo } from 'react';

import invariant from '@promptfoo/util/invariant';
import { useTableStore } from './store';

/**
 * Returns the number of passing tests for each prompt.
 *
 * TODO(ian): Switch this to use prompt.metrics field once most clients have updated.
 *
 * @returns An array of numbers, one for each prompt.
 */
export function usePassingTestCounts(): number[] {
  const { table } = useTableStore();

  invariant(table, 'Table should be defined');
  const { head, body } = table;

  const value = useMemo(
    () => head.prompts.map((prompt) => prompt.metrics?.testPassCount || 0),
    [head.prompts, body],
  );

  return value;
}

/**
 * Returns the number of tests for each prompt.
 *
 * @returns An array of numbers, one for each prompt.
 */
export function useTestCounts(): number[] {
  const { table } = useTableStore();

  invariant(table, 'Table should be defined');
  const { head, body } = table;

  const value = useMemo(
    () =>
      head.prompts.map(
        (prompt) => (prompt.metrics?.testPassCount ?? 0) + (prompt.metrics?.testFailCount ?? 0),
      ),
    [head.prompts, body],
  );

  return value;
}

/**
 * Returns the pass rate for each prompt.
 *
 * @returns An array of numbers, one for each prompt.
 */
export function usePassRates(): number[] {
  const numTests = useTestCounts();
  const numPassing = usePassingTestCounts();

  return useMemo(
    () => numPassing.map((passing, idx) => (passing / numTests[idx]) * 100),
    [numPassing, numTests],
  );
}
