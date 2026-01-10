/**
 * @fileoverview Hooks for working w/ custom policies. Sharable between Promptfoo OSS and Promptfoo Cloud.
 */

import { useEffect, useMemo, useState } from 'react';

import {
  isValidPolicyObject,
  makeDefaultPolicyName,
  makeInlinePolicyId,
} from '@promptfoo/redteam/plugins/policy/utils';
import { type PolicyObject, type RedteamPluginObject } from '@promptfoo/redteam/types';

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
  const [policiesMap, setPoliciesMap] = useState<Record<PolicyObject['id'], PolicyObject>>({});

  // Stringify plugins for deep comparison to prevent infinite loops when plugins array reference changes
  const pluginsKey = useMemo(() => JSON.stringify(plugins), [plugins]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: using pluginsKey for deep comparison to prevent infinite loops
  useEffect(() => {
    async function buildPoliciesMap() {
      const policyPlugins = plugins.filter(
        (plugin) => typeof plugin !== 'string' && plugin.id === 'policy',
      );

      const map: Record<PolicyObject['id'], PolicyObject> = {};

      for (let index = 0; index < policyPlugins.length; index++) {
        const plugin = policyPlugins[index];
        const policy = plugin?.config?.policy;
        if (policy) {
          if (isValidPolicyObject(policy)) {
            map[policy.id] = policy;
          }
          // Backwards compatibility w/ text-only inline policies.
          else {
            const id = await makeInlinePolicyId(policy);
            map[id] = {
              id,
              text: policy,
              name: makeDefaultPolicyName(index),
            };
          }
        }
      }

      setPoliciesMap(map);
    }

    buildPoliciesMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginsKey]);

  return policiesMap;
}
