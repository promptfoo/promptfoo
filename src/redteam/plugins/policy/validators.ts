/**
 * @fileoverview This module contains pure validation functions – those without external dependencies
 * e.g. `PolicyObjectSchema` (which would otherwise introduce circular dependencies).
 *
 * TODO:
 *
 * - PolicyObjectSchema could be moved into this module along w/ `isPolicyMetric` and `isValidPolicyObject`,
 * to co-locate all of the policy validation logic.
 */
import { isUuid } from '../../../util/uuid';

/**
 * Checks whether a policy ID is a valid reusable policy ID.
 * @param id - The policy ID to check.
 * @returns True if the policy ID is a valid reusable policy ID, false otherwise.
 */
export function isValidReusablePolicyId(id: string): boolean {
  return isUuid(id);
}

/**
 * Checks whether a policy ID is a valid inline policy ID.
 * @param id - The policy ID to check.
 * @returns True if the policy ID is a valid inline policy ID, false otherwise.
 */
export function isValidInlinePolicyId(id: string): boolean {
  return /^[0-9a-f]{12}$/i.test(id);
}

/**
 * Checks whether a policy ID is a valid policy ID.
 * @param id - The policy ID to check.
 * @returns True if the policy ID is a valid policy ID, false otherwise.
 */
export function isValidPolicyId(id: string): boolean {
  return isValidReusablePolicyId(id) || isValidInlinePolicyId(id);
}
