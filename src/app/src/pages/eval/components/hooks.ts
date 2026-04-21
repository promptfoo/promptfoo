/**
 * Hooks for reading computed values from the table store.
 *
 * This is the recommended practice by Zustand's author (see https://github.com/pmndrs/zustand/issues/132#issuecomment-1688161013).
 *
 * IMPORTANT: These hooks return BOTH total and filtered metrics so components can display
 * both values (e.g., "15 passing (100 total)"). When no filters are active, filtered will be null.
 */

import { useCallback, useMemo } from 'react';

import {
  deserializePolicyIdFromMetric,
  isPolicyMetric,
} from '@promptfoo/redteam/plugins/policy/utils';
import { useTableStore } from './store';
import type { PromptMetrics } from '@promptfoo/types';

export interface MetricValue {
  total: number;
  filtered: number | null;
}

export interface MetricsData {
  total: PromptMetrics | null;
  filtered: PromptMetrics | null;
}

/**
 * Returns the number of passing tests for each prompt, with both total and filtered counts.
 *
 * @returns An array of MetricValue objects, one for each prompt. Returns an empty array if the table is not defined.
 */
export function usePassingTestCounts(): MetricValue[] {
  const { table, filteredMetrics } = useTableStore();

  return useMemo(() => {
    return table
      ? table.head.prompts.map((prompt, idx) => ({
          total: prompt.metrics?.testPassCount || 0,
          filtered: filteredMetrics?.[idx]?.testPassCount ?? null,
        }))
      : [];
  }, [table, filteredMetrics]);
}

/**
 * Returns the total number of tests for each prompt, with both total and filtered counts.
 *
 * @returns An array of MetricValue objects, one for each prompt. Returns an empty array if the table is not defined.
 */
export function useTestCounts(): MetricValue[] {
  const { table, filteredMetrics } = useTableStore();

  return useMemo(() => {
    return table
      ? table.head.prompts.map((prompt, idx) => {
          const totalCount =
            (prompt.metrics?.testPassCount ?? 0) + (prompt.metrics?.testFailCount ?? 0);
          const filteredCount = filteredMetrics?.[idx]
            ? (filteredMetrics[idx].testPassCount ?? 0) + (filteredMetrics[idx].testFailCount ?? 0)
            : null;

          return {
            total: totalCount,
            filtered: filteredCount,
          };
        })
      : [];
  }, [table, filteredMetrics]);
}

/**
 * Returns the pass rate for each prompt, with both total and filtered rates.
 *
 * @returns An array of MetricValue objects (percentages), one for each prompt. Returns an empty array if the table is not defined.
 */
export function usePassRates(): MetricValue[] {
  const numTests = useTestCounts();
  const numPassing = usePassingTestCounts();

  return useMemo(
    () =>
      numTests.map((testCount, idx) => {
        const passingCount = numPassing[idx];
        return {
          total: testCount.total === 0 ? 0 : (passingCount.total / testCount.total) * 100,
          filtered:
            testCount.filtered !== null && passingCount.filtered !== null
              ? testCount.filtered === 0
                ? 0
                : (passingCount.filtered / testCount.filtered) * 100
              : null,
        };
      }),
    [numPassing, numTests],
  );
}

/**
 * Returns a function that gets the metrics for a specific prompt index, with both total and filtered metrics.
 *
 * This is useful for components that need to access metrics fields like cost, latency, namedScores, etc.
 *
 * @example
 * ```tsx
 * const getMetrics = useMetricsGetter();
 * const { total, filtered } = getMetrics(promptIdx);
 * console.log('Total cost:', total?.cost);
 * console.log('Filtered cost:', filtered?.cost);
 * ```
 */
export function useMetricsGetter() {
  const { table, filteredMetrics } = useTableStore();

  return useCallback(
    (promptIdx: number): MetricsData => {
      if (!table || promptIdx < 0 || promptIdx >= table.head.prompts.length) {
        return { total: null, filtered: null };
      }

      return {
        total: table.head.prompts[promptIdx].metrics ?? null,
        filtered: filteredMetrics?.[promptIdx] ?? null,
      };
    },
    [table, filteredMetrics],
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
