import { PolicyObject } from '../../types';
import { POLICY_METRIC_PREFIX } from './constants';

/**
 * Serializes a policy object as a metric. This allows the policy object to be persisted through
 * the system and then deserialized back into a policy object.
 * @param policyObject
 * @returns
 */
export function serializePolicyObjectAsMetric(policyObject: PolicyObject): string {
  return `${POLICY_METRIC_PREFIX}:${JSON.stringify(policyObject)}`;
}

/**
 * Deserializes a policy metric as a PolicyObject.
 * @param metric
 * @returns
 */
export function deserializePolicyMetricsAsPolicyObject(metric: string): PolicyObject {
  if (!metric.startsWith(POLICY_METRIC_PREFIX)) {
    throw new Error(`Metric ${metric} is not a policy metric`);
  }

  const [_, data] = metric.split(':');

  if (!data) {
    throw new Error(`Metric ${metric} is not a valid policy metric`);
  }

  return JSON.parse(data) as PolicyObject;
}
