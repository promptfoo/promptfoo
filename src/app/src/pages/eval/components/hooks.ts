/**
 * Hooks for reading computed values from the table store.
 *
 * This is the recommended practice by Zustand's author (see https://github.com/pmndrs/zustand/issues/132#issuecomment-1688161013).
 */

import { useMemo } from 'react';

import { useTableStore } from './store';
import { PolicyObject } from '@promptfoo/redteam/types';
import {
  isValidPolicyObject,
  makeInlinePolicyId,
  makeDefaultPolicyName,
} from '@promptfoo/redteam/plugins/policy/utils';
import { type RedteamPluginObject } from '@promptfoo/types';

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
 * Reads custom policies from the table store and returns a map of policy IDs to policy objects.
 * For text-only "inline" policies, ensures a consistent name is used for the policy.
 *
 * @param plugins - The plugins to read custom policies from.
 * @returns A map of policy IDs to policy objects.
 */
export function useCustomPoliciesMap(
  plugins: RedteamPluginObject[],
): Record<PolicyObject['id'], PolicyObject> {
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
