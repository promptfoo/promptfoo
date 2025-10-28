import { sha256 } from '../../../util/createHash';
import { type Policy, PolicyObject, PolicyObjectSchema } from '../../types';
import { POLICY_METRIC_PREFIX } from './constants';
import { isValidReusablePolicyId } from './validators';
import invariant from '../../../util/invariant';

/**
 * Checks if a metric is a policy metric.
 * @param metric - The metric to check.
 * @returns True if the metric is a policy metric, false otherwise.
 */
export function isPolicyMetric(metric: string): boolean {
  return metric.startsWith(POLICY_METRIC_PREFIX);
}

/**
 * Deserializes a policy ID from a metric.
 * @param metric - The metric to deserialize.
 * @returns The policy ID.
 */
export function deserializePolicyIdFromMetric(metric: string): PolicyObject['id'] {
  return (
    metric
      // Remove the metric prefix
      .replace(`${POLICY_METRIC_PREFIX}:`, '')
      // If the metric contains a strategy suffix, remove it
      .split('/')[0]
  );
}

/**
 * Formats a policy identifier as a metric.
 * @param identifier Either the reusable policy's name or the inline policy's content hash.
 * @param originalMetric - An optional original metric string to extract the strategy suffix from.
 * @returns The formatted policy identifier.
 */
export function formatPolicyIdentifierAsMetric(
  identifier: string,
  originalMetric?: string,
): string {
  // If the original metric contains a strategy suffix, persist it in the formatted metric
  let suffix: string | undefined;
  if (originalMetric) {
    invariant(originalMetric.startsWith(`${POLICY_METRIC_PREFIX}:`), 'Invalid original metric');
    if (originalMetric?.includes('/')) {
      suffix = originalMetric?.split('/')[1];
    }
  }
  // Use the plugin/strategy format found elsewhere in the codebase
  return `Policy${suffix ? `/${suffix}` : ''}: ${identifier}`;
}

/**
 * Makes a URL to a custom policy in the cloud.
 * @param cloudAppUrl - The URL of the cloud app.
 * @param policyId - The ID of the policy.
 * @returns The URL to the custom policy in the cloud.
 */
export function makeCustomPolicyCloudUrl(cloudAppUrl: string, policyId: string): string {
  return `${cloudAppUrl}/redteam/plugins/policies/${policyId}`;
}

/**
 * Parses the policy id to determine if it's a reusable or inline policy. Reusable policies use
 * v4 UUIDs whereas inline policies use a hash of the policy text.
 * @param policyId – A PolicyObject.id value.
 * @returns 'reusable' if the policy is a reusable policy, 'inline' if the policy is an inline policy.
 */
export function determinePolicyTypeFromId(policyId: string): 'reusable' | 'inline' {
  return isValidReusablePolicyId(policyId) ? 'reusable' : 'inline';
}

/**
 * Checks whether a given Policy is a valid PolicyObject.
 * @param policy - The policy to check.
 * @returns True if the policy is a valid PolicyObject, false otherwise.
 */
export function isValidPolicyObject(policy: Policy): policy is PolicyObject {
  return PolicyObjectSchema.safeParse(policy).success;
}

/**
 * Constructs a unique ID for the inline policy by hashing the policy text and
 * taking the first 12 characters of the hash.
 * @param policyText - The text of the policy.
 * @returns The ID for the inline policy.
 */
export function makeInlinePolicyId(policyText: string): string {
  return sha256(policyText).slice(
    0,
    // 0.18% chance of collision w/ 1M policies i.e. extremely unlikely
    12,
  );
}

/**
 * Creates a default name for a (legacy) text-only inline custom policy.
 */
export function makeDefaultPolicyName(index: number): string {
  return `Custom Policy ${index + 1}`;
}
