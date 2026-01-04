/**
 * Shared constants for recon functionality used by both CLI and frontend.
 *
 * This file provides a single source of truth for:
 * - Section header strings (for purpose string format)
 * - ApplicationDefinition field names
 * - Placeholder/meaningful value detection
 *
 * @module validators/recon-constants
 */

import type { ApplicationDefinition } from './recon';

/**
 * Mapping from ApplicationDefinition field names to their display headers.
 * Used when generating the formatted purpose string from structured data.
 *
 * Format: `Header Title:\n\`\`\`\ncontent\n\`\`\``
 */
export const SECTION_HEADERS: Record<keyof ApplicationDefinition, string> = {
  purpose: 'Application Purpose',
  features: 'Key Features and Capabilities',
  industry: 'Industry/Domain',
  systemPrompt: 'System Prompt',
  hasAccessTo: 'Systems and Data the Application Has Access To',
  doesNotHaveAccessTo: 'Systems and Data the Application Should NOT Have Access To',
  userTypes: 'Types of Users Who Interact with the Application',
  securityRequirements: 'Security and Compliance Requirements',
  sensitiveDataTypes: 'Types of Sensitive Data Handled',
  exampleIdentifiers: 'Example Data Identifiers and Formats',
  criticalActions: 'Critical or Dangerous Actions the Application Can Perform',
  forbiddenTopics: 'Content and Topics the Application Should Never Discuss',
  attackConstraints: 'System Rules and Constraints for Attackers',
  competitors: 'Competitors That Should Not Be Endorsed',
  connectedSystems: 'Connected Systems the LLM Agent Has Access To',
  redteamUser: 'Red Team User Persona',
  // UI-specific aliases
  accessToData: 'Data You Have Access To',
  forbiddenData: 'Data You Do Not Have Access To',
  accessToActions: 'Actions You Can Take',
  forbiddenActions: 'Actions You Should Not Take',
};

/**
 * Inverse mapping from section header strings to field names.
 * Used when parsing the formatted purpose string back to structured data.
 */
export const SECTION_HEADER_TO_FIELD: Record<string, keyof ApplicationDefinition> = Object.entries(
  SECTION_HEADERS,
).reduce(
  (acc, [field, header]) => {
    acc[header] = field as keyof ApplicationDefinition;
    return acc;
  },
  {} as Record<string, keyof ApplicationDefinition>,
);

/**
 * List of all ApplicationDefinition field names.
 * Useful for iteration and validation.
 */
export const APPLICATION_DEFINITION_FIELDS: (keyof ApplicationDefinition)[] = Object.keys(
  SECTION_HEADERS,
) as (keyof ApplicationDefinition)[];

/**
 * Default empty ApplicationDefinition for fallback cases.
 * All fields are initialized to empty strings.
 */
export const DEFAULT_APPLICATION_DEFINITION: ApplicationDefinition = APPLICATION_DEFINITION_FIELDS.reduce(
  (acc, field) => {
    acc[field] = '';
    return acc;
  },
  {} as ApplicationDefinition,
);

/**
 * Checks if a field value is meaningful (not empty or a placeholder).
 *
 * This function detects common placeholder patterns that indicate
 * the field was not actually populated with real data:
 * - Empty strings
 * - "none", "n/a", "na"
 * - Phrases starting with "not " (e.g., "not specified", "not provided")
 * - Phrases starting with "none " (e.g., "none mentioned")
 * - Phrases like "no formal", "no built-in" (but NOT "nosql database")
 *
 * @param value - The field value to check
 * @returns true if the value contains meaningful content
 */
export function isValueMeaningful(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const lower = value.toLowerCase().trim();
  // Skip empty or placeholder values
  // Note: We use word boundary checks to avoid false positives like "nosql" or "notify"
  if (
    lower === '' ||
    lower === 'none' ||
    lower === 'n/a' ||
    lower === 'na' ||
    lower.startsWith('not ') || // "not specified", "not mentioned", "not provided", "not applicable", "not found"
    lower.startsWith('none ') || // "none mentioned", "none specified"
    /^no\s+(formal|built-in|additional|specific|explicit|dedicated|documented|known|particular|special)\b/.test(
      lower,
    ) // "no formal", "no built-in", etc. but NOT "nosql database"
  ) {
    return false;
  }
  return true;
}
