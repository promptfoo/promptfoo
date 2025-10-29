/**
 * Hooks for reading computed values from the table store.
 *
 * This is the recommended practice by Zustand's author (see https://github.com/pmndrs/zustand/issues/132#issuecomment-1688161013).
 *
 * IMPORTANT: These hooks return BOTH total and filtered metrics so components can display
 * both values (e.g., "15 passing (100 total)"). When no filters are active, filtered will be null.
 */

import { useMemo } from 'react';
import type { PromptMetrics } from '@promptfoo/types';

import { useTableStore } from './store';
import { PolicyObject } from '@promptfoo/redteam/types';
import {
  isValidPolicyObject,
  makeInlinePolicyId,
  makeDefaultPolicyName,
} from '@promptfoo/redteam/plugins/policy/utils';

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

  return table
    ? useMemo(() => {
        return table.head.prompts.map((prompt, idx) => ({
          total: prompt.metrics?.testPassCount || 0,
          filtered: filteredMetrics?.[idx]?.testPassCount ?? null,
        }));
      }, [table.head.prompts, filteredMetrics])
    : [];
}

/**
 * Returns the total number of tests for each prompt, with both total and filtered counts.
 *
 * @returns An array of MetricValue objects, one for each prompt. Returns an empty array if the table is not defined.
 */
export function useTestCounts(): MetricValue[] {
  const { table, filteredMetrics } = useTableStore();

  return table
    ? useMemo(() => {
        return table.head.prompts.map((prompt, idx) => {
          const totalCount =
            (prompt.metrics?.testPassCount ?? 0) + (prompt.metrics?.testFailCount ?? 0);
          const filteredCount = filteredMetrics?.[idx]
            ? (filteredMetrics[idx].testPassCount ?? 0) + (filteredMetrics[idx].testFailCount ?? 0)
            : null;

          return {
            total: totalCount,
            filtered: filteredCount,
          };
        });
      }, [table.head.prompts, filteredMetrics])
    : [];
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

  return useMemo(() => {
    return (promptIdx: number): MetricsData => {
      if (!table || promptIdx < 0 || promptIdx >= table.head.prompts.length) {
        return { total: null, filtered: null };
      }

      return {
        total: table.head.prompts[promptIdx].metrics ?? null,
        filtered: filteredMetrics?.[promptIdx] ?? null,
      };
    };
  }, [table, filteredMetrics]);
}

/**
 * Reads custom policies from the table store and returns a map of policy IDs to policy objects.
 *
 * @returns A map of policy IDs to policy objects.
 */
export function useCustomPoliciesMap(): Record<PolicyObject['id'], PolicyObject> {
  const { config } = useTableStore();
  const plugins = config?.redteam?.plugins ?? [];

  return useMemo(() => {
    return (
      plugins
        // Filter on the policy plugin type so that only custom policies are included in the
        // reduce, ensuring stable indices for default name generation.
        .filter((plugin) => typeof plugin !== 'string' && plugin.id === 'policy')
        .reduce((map: Record<PolicyObject['id'], PolicyObject>, plugin, index) => {
          const policy = plugin?.config?.policy;
          if (policy) {
            if (isValidPolicyObject(policy)) {
              map[policy.id] = policy;
            }
            // Backwards compatibility w/ text-only inline policies.
            else {
              const id = makeInlinePolicyId(policy);
              map[id] = {
                id,
                text: policy,
                name: makeDefaultPolicyName(index),
              };
            }
          }
          return map;
        }, {})
    );
  }, [plugins]);
}
