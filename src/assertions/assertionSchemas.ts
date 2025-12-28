/**
 * Assertion Schema Validation
 *
 * This module provides Zod schemas for validating assertion configurations.
 * It uses the centralized assertion registry to provide type-specific validation.
 */

import { z } from 'zod';
import type { Assertion, AssertionType } from '../types/index';
import type { AssertionValueType } from './assertionDefinition';
import { ASSERTION_TYPE_METADATA } from './registry';

/**
 * Schema for file references (file://path or file://path:functionName)
 */
const FileReferenceSchema = z.string().refine(
  (val) => val.startsWith('file://'),
  { message: 'File reference must start with file://' }
);

/**
 * Schema for package references (package:name or package:@scope/name)
 */
const PackageReferenceSchema = z.string().refine(
  (val) => val.startsWith('package:'),
  { message: 'Package reference must start with package:' }
);

/**
 * Base value schemas for each valueType.
 * These define what types of values are valid for each assertion category.
 */
export const VALUE_TYPE_SCHEMAS: Record<AssertionValueType, z.ZodType> = {
  // No value required - value should be undefined or omitted
  none: z.undefined().optional(),

  // Single string value (e.g., contains, equals)
  string: z.union([
    z.string(),
    z.number(), // Allow numbers which will be coerced to strings
    z.null(), // Allow null (e.g., asserting output equals null)
    FileReferenceSchema,
    PackageReferenceSchema,
  ]),

  // Multi-line text value (e.g., rubrics, expected output)
  text: z.union([
    z.string(),
    z.null(), // Allow null (e.g., asserting output equals null)
    FileReferenceSchema,
    PackageReferenceSchema,
  ]),

  // Regular expression pattern
  regex: z.union([
    z.string(),
    FileReferenceSchema,
  ]),

  // Executable code (javascript, python, ruby)
  code: z.union([
    z.string(),
    FileReferenceSchema,
    PackageReferenceSchema,
  ]),

  // Array of strings (e.g., contains-all, contains-any)
  // Also accepts comma-separated string which gets parsed at runtime
  array: z.union([
    z.array(z.union([z.string(), z.number()])),
    z.string(), // Comma-separated values
    FileReferenceSchema,
  ]),

  // Numeric value/threshold (e.g., cost, latency)
  number: z.union([
    z.number(),
    z.string().regex(/^[\d.]+$/, 'Must be a valid number'),
    FileReferenceSchema,
  ]),

  // Text for comparison with optional threshold (e.g., similar, levenshtein)
  reference: z.union([
    z.string(),
    z.array(z.string()),
    FileReferenceSchema,
  ]),

  // JSON Schema object or string (e.g., is-json with schema validation)
  schema: z.union([
    z.record(z.any()), // JSON Schema object
    z.string(), // YAML string or file reference
    FileReferenceSchema,
  ]).optional(),

  // Complex or assertion-specific value type - minimal validation
  custom: z.any(),
};

/**
 * Threshold schema - validates threshold values
 */
const ThresholdSchema = z.number().min(0).max(1).optional();

/**
 * Get the appropriate value schema for an assertion type.
 * Returns undefined if the assertion type is not found.
 */
export function getValueSchemaForType(assertionType: string): z.ZodType | undefined {
  // Handle 'not-' prefix
  const baseType = assertionType.startsWith('not-')
    ? assertionType.slice(4)
    : assertionType;

  const metadata = ASSERTION_TYPE_METADATA[baseType as keyof typeof ASSERTION_TYPE_METADATA];
  if (!metadata) {
    return undefined;
  }

  return VALUE_TYPE_SCHEMAS[metadata.valueType];
}

/**
 * Check if an assertion type supports threshold.
 */
export function supportsThreshold(assertionType: string): boolean {
  const baseType = assertionType.startsWith('not-')
    ? assertionType.slice(4)
    : assertionType;

  const metadata = ASSERTION_TYPE_METADATA[baseType as keyof typeof ASSERTION_TYPE_METADATA];
  return metadata?.supportsThreshold ?? false;
}

/**
 * Check if an assertion type requires a value.
 */
export function requiresValue(assertionType: string): boolean {
  const baseType = assertionType.startsWith('not-')
    ? assertionType.slice(4)
    : assertionType;

  const metadata = ASSERTION_TYPE_METADATA[baseType as keyof typeof ASSERTION_TYPE_METADATA];
  if (!metadata) {
    return false;
  }

  // 'none' valueType means no value is required
  // 'schema' is optional (e.g., is-json works with or without a schema)
  return metadata.valueType !== 'none' && metadata.valueType !== 'schema';
}

/**
 * Validation result for an assertion
 */
export interface AssertionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate an assertion configuration against its type-specific schema.
 *
 * @param assertion - The assertion to validate
 * @param context - Context string for error messages (e.g., "tests[0].assert[1]")
 * @returns Validation result with errors and warnings
 */
export function validateAssertionValue(
  assertion: Assertion,
  context: string = 'assertion'
): AssertionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const assertionType = assertion.type as string;

  // Skip validation for redteam assertions (they have their own validation)
  if (assertionType.startsWith('promptfoo:redteam:')) {
    return { valid: true, errors: [], warnings: [] };
  }

  // Skip validation for special assertion types that are handled separately
  // These depend on multiple outputs or have interactive handling
  if (assertionType.startsWith('select-') || assertionType === 'max-score' || assertionType === 'human') {
    return { valid: true, errors: [], warnings: [] };
  }

  // Get metadata for the assertion type
  const baseType = assertionType.startsWith('not-')
    ? assertionType.slice(4)
    : assertionType;

  const metadata = ASSERTION_TYPE_METADATA[baseType as keyof typeof ASSERTION_TYPE_METADATA];

  // Unknown assertion type - allow it but warn
  if (!metadata) {
    warnings.push(
      `Unknown assertion type "${assertionType}" at ${context}. ` +
      `This may be a custom assertion or a typo.`
    );
    return { valid: true, errors, warnings };
  }

  // Validate value against expected type
  const valueSchema = VALUE_TYPE_SCHEMAS[metadata.valueType];
  // Note: null is a valid value (e.g., asserting output equals null)
  // Only undefined means "no value provided"
  const hasValue = assertion.value !== undefined;

  // Check if value is required but missing
  if (requiresValue(assertionType) && !hasValue) {
    // Allow file:// or package: references in the type for backwards compatibility
    if (typeof assertionType === 'string' &&
        (assertionType.includes('file://') || assertionType.includes('package:'))) {
      // This is a file/package reference encoded in the type - valid
    } else {
      errors.push(
        `${context}: Assertion type "${assertionType}" requires a value. ` +
        `Expected ${metadata.valueType} value.`
      );
    }
  }

  // Handle 'none' valueType specially - warn but don't error if value is provided
  if (metadata.valueType === 'none' && hasValue) {
    warnings.push(
      `${context}: Assertion type "${assertionType}" does not use a value, ` +
      `but a value was provided. The value will be ignored.`
    );
  } else if (hasValue && valueSchema) {
    // Validate value type if present (for non-none types)
    const result = valueSchema.safeParse(assertion.value);
    if (!result.success) {
      const issues = result.error.issues.map(i => i.message).join(', ');
      errors.push(
        `${context}: Invalid value for "${assertionType}". ` +
        `Expected ${metadata.valueType}, got ${typeof assertion.value}. ${issues}`
      );
    }
  }

  // Validate threshold usage
  if (assertion.threshold !== undefined) {
    // Validate threshold is a valid number
    const thresholdResult = ThresholdSchema.safeParse(assertion.threshold);
    if (!thresholdResult.success) {
      errors.push(
        `${context}: Invalid threshold value "${assertion.threshold}". ` +
        `Threshold must be a number between 0 and 1.`
      );
    }

    // Warn if threshold is used with assertion that doesn't support it
    if (!supportsThreshold(assertionType)) {
      warnings.push(
        `${context}: Assertion type "${assertionType}" does not support threshold. ` +
        `The threshold value will be ignored.`
      );
    }
  }

  // Validate provider usage
  if (assertion.provider !== undefined && !metadata.requiresLlm) {
    warnings.push(
      `${context}: Assertion type "${assertionType}" does not require an LLM provider. ` +
      `The provider setting may be ignored.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate multiple assertions and aggregate results.
 *
 * @param assertions - Array of assertions to validate
 * @param contextPrefix - Prefix for context strings (e.g., "tests[0].assert")
 * @returns Aggregated validation result
 */
export function validateAssertionValues(
  assertions: Assertion[],
  contextPrefix: string = 'assert'
): AssertionValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  for (let i = 0; i < assertions.length; i++) {
    const result = validateAssertionValue(assertions[i], `${contextPrefix}[${i}]`);
    allErrors.push(...result.errors);
    allWarnings.push(...result.warnings);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Create a Zod schema for a specific assertion type.
 * This can be used for more detailed validation or IDE integration.
 */
export function createAssertionSchema(assertionType: AssertionType): z.ZodObject<any> {
  const baseType = (assertionType as string).startsWith('not-')
    ? (assertionType as string).slice(4)
    : assertionType;

  const metadata = ASSERTION_TYPE_METADATA[baseType as keyof typeof ASSERTION_TYPE_METADATA];

  const valueSchema = metadata
    ? VALUE_TYPE_SCHEMAS[metadata.valueType]
    : z.any();

  const thresholdSchema = metadata?.supportsThreshold
    ? ThresholdSchema
    : z.undefined().optional();

  return z.object({
    type: z.literal(assertionType),
    value: valueSchema.optional(),
    threshold: thresholdSchema,
    weight: z.number().optional(),
    provider: z.any().optional(),
    rubricPrompt: z.any().optional(),
    metric: z.string().optional(),
    transform: z.string().optional(),
    contextTransform: z.string().optional(),
    config: z.record(z.any()).optional(),
  });
}
