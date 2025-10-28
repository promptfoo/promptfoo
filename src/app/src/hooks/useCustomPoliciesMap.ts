/**
 * @fileoverview Hooks for working w/ custom policies. Sharable between Promptfoo OSS and Promptfoo Cloud.
 */

import { type PolicyObject } from '@promptfoo/redteam/types';
import {
  isValidPolicyObject,
  makeInlinePolicyId,
  makeDefaultPolicyName,
} from '@promptfoo/redteam/plugins/policy/utils';
import { type RedteamPluginObject } from '@promptfoo/redteam/types';
import { useMemo } from 'react';

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
