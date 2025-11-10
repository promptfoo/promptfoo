/**
 * Hooks for reading computed values from the table store.
 *
 * This is the recommended practice by Zustand's author (see https://github.com/pmndrs/zustand/issues/132#issuecomment-1688161013).
 */

import { useMemo, useCallback } from 'react';

import { useTableStore } from './store';
import {
  deserializePolicyIdFromMetric,
  isPolicyMetric,
} from '@promptfoo/redteam/plugins/policy/utils';

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

/**
 * Returns a callback providing a consistent interface for applying metric filters.
 * @returns A callback that applies a given metric as a filter.
 */
export function useApplyFilterFromMetric() {
  const { filters, addFilter } = useTableStore();

  /**
   * Applies a given metric as a filter.
   *
   * TODO:
   * The current filtering mechanism leaves at least the following edge cases unaddressed:
   * - Custom Policies w/ Strategies
   * Moreover, the row-level filter pills are not great (e.g. filtering on a Plugin will only display that Plugin's Metric).
   *
   * Ideally, metrics are applied as >=1 more filters i.e.:
   * - Non-redteam: Apply a metric filter
   * - Plugin/Strategy: Apply a plugin filter and a strategy filter
   * - Policy/Strategy: Apply a policy filter and a strategy filter
   *
   * This requires mapping metrics to plugins and strategies, which is presently non-trivial.
   */
  return useCallback(
    (value: string) => {
      const asPolicy = isPolicyMetric(value);
      const filter = asPolicy
        ? {
            type: 'policy' as const,
            operator: 'equals' as const,
            value: deserializePolicyIdFromMetric(value),
            field: undefined,
            logicOperator: 'or' as const,
          }
        : {
            type: 'metric' as const,
            operator: 'is_defined' as const,
            value: '',
            field: value,
            logicOperator: 'or' as const,
          };

      // If this filter is already applied, do not re-apply it.
      if (
        filters?.values &&
        Object.values(filters.values).find(
          (f) =>
            f.type === filter.type &&
            f.value === filter.value &&
            f.operator === filter.operator &&
            f.logicOperator === filter.logicOperator &&
            f.field === filter.field,
        )
      ) {
        return;
      }

      addFilter(filter);
    },
    [addFilter, filters?.values],
  );
}
