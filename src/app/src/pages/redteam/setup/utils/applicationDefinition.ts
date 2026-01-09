/**
 * Utilities for working with ApplicationDefinition fields.
 *
 * These helpers provide consistent logic for:
 * - Identifying derived/computed fields that shouldn't be counted
 * - Checking if a field has meaningful content
 * - Counting populated fields for the recon context
 */

import type { ApplicationDefinition } from '../types';

/**
 * Fields that are derived from other fields and should not be counted
 * as "populated" in the recon context.
 *
 * These are UI-specific mappings:
 * - accessToData → derived from hasAccessTo
 * - forbiddenData → derived from doesNotHaveAccessTo
 * - accessToActions → set by UI form
 * - forbiddenActions → set by UI form
 */
export const DERIVED_APPLICATION_FIELDS = [
  'accessToData',
  'forbiddenData',
  'accessToActions',
  'forbiddenActions',
] as const;

/**
 * Checks if an application definition field has meaningful content.
 *
 * @param value - The field value to check
 * @returns true if the value is a non-empty string
 */
export function isFieldPopulated(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Checks if a field should be counted as "populated" in the recon context.
 * Excludes derived fields that are computed from other fields.
 *
 * @param key - The field name
 * @param value - The field value
 * @returns true if the field should be counted as populated
 */
export function isCountableField(key: string, value: unknown): boolean {
  if ((DERIVED_APPLICATION_FIELDS as readonly string[]).includes(key)) {
    return false;
  }
  return isFieldPopulated(value);
}

/**
 * Counts the number of meaningfully populated fields in an ApplicationDefinition.
 * Excludes derived fields (accessToData, forbiddenData, accessToActions, forbiddenActions).
 *
 * @param applicationDefinition - The application definition to count fields from
 * @returns The number of populated fields
 */
export function countPopulatedFields(
  applicationDefinition: Partial<ApplicationDefinition>,
): number {
  return Object.entries(applicationDefinition).filter(([key, value]) =>
    isCountableField(key, value),
  ).length;
}
