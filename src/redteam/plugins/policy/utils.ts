import { validate as isUUID } from 'uuid';
import { sha256 } from '../../../util/createHash';
import { type Policy, PolicyObject, PolicyObjectSchema } from '../../types';
import { POLICY_METRIC_PREFIX } from './constants';

/**
 * Checks if a metric is a policy metric.
 * @param metric - The metric to check.
 * @returns True if the metric is a policy metric, false otherwise.
 */
export function isPolicyMetric(metric: string): boolean {
  return metric.startsWith(POLICY_METRIC_PREFIX);
}

/**
 * Serializes a policy as a unique metric.
 * @returns
 */
export function serializePolicyAsMetric(policyId: PolicyObject['id']): string {
  return `${POLICY_METRIC_PREFIX}:${policyId}`;
}

/**
 * Deserializes a policy metric as a PolicyObject.
 * @param metric - The metric to deserialize.
 * @returns The policy object if the metric is a policy metric, null otherwise.
 */
export function deserializePolicyMetricAsPolicyObject(metric: string): PolicyObject | null {
  if (!isPolicyMetric(metric)) {
    return null;
  }

  try {
    return JSON.parse(metric.replace(`${POLICY_METRIC_PREFIX}:`, '')) as PolicyObject;
  } catch (error) {
    console.error(`Error deserializing policy metric: ${error}`);
    return null;
  }
}

/**
 * Formats a policy identifier as a metric.
 * @param identifier Either the reusable policy's name or the inline policy's content hash.
 * @returns The formatted policy identifier.
 */
export function formatPolicyIdentifierAsMetric(identifier: string): string {
  return `Policy: ${identifier}`;
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
  return isUUID(policyId) ? 'reusable' : 'inline';
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
 * taking the first 8 characters of the hash.
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
