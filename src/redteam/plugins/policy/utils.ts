/**
 * Environment-agnostic (client and server) utility functions for working with policy plugins.
 */

/**
 * Given the ID of a reusable custom policy, constructs a unique identifier for use in metrics,
 * which essentially truncates the ID to the last 8 characters.
 * @param policyId
 */
export function constructMetricId(policyId: string) {
  return policyId.split('-').pop();
}
