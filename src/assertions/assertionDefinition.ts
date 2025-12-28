/**
 * Assertion Definition Types
 *
 * This module provides the type infrastructure for colocated assertion definitions.
 * Each handler file exports both the handler function AND its metadata.
 */

import type { AssertionParams, BaseAssertionTypes, GradingResult } from '../types/index';

/**
 * Primary tags for assertions - used for UI grouping.
 * The first tag in an assertion's tags array should be one of these.
 */
export type PrimaryAssertionTag =
  | 'ai-evaluation'
  | 'text-matching'
  | 'similarity'
  | 'format'
  | 'safety'
  | 'performance'
  | 'custom';

/**
 * Cross-cutting tags that can be applied in addition to primary tags.
 * These enable filtering assertions by capability or use case.
 */
export type CrossCuttingTag =
  | 'rag' // RAG-specific assertions (context-*, answer-relevance)
  | 'embeddings' // Uses embedding models
  | 'external' // Calls external service/API
  | 'negation'; // For not-* variants (auto-generated)

/**
 * All assertion tags - primary and cross-cutting.
 *
 * Primary tags (first in the array) determine UI grouping:
 * - 'ai-evaluation': LLM-powered evaluation
 * - 'text-matching': String comparison
 * - 'similarity': Semantic/text similarity metrics
 * - 'format': Structure validation (JSON, XML, SQL)
 * - 'safety': Content safety and moderation
 * - 'performance': Cost, latency, metrics
 * - 'custom': User-defined assertions
 *
 * Cross-cutting tags enable filtering:
 * - 'rag': Useful for RAG pipelines
 * - 'embeddings': Uses embedding models
 * - 'external': Calls external service/API
 * - 'negation': Inverse assertion variants
 */
export type AssertionTag = PrimaryAssertionTag | CrossCuttingTag;

/**
 * @deprecated Use AssertionTag instead. Kept for backward compatibility.
 */
export type AssertionCategory = PrimaryAssertionTag | 'negation';

/**
 * Value type for assertions - describes what kind of value the assertion expects.
 *
 * - `none`: No value required (e.g., is-json, is-xml)
 * - `string`: Single string value (e.g., contains, equals)
 * - `text`: Multi-line text (e.g., rubrics, expected output)
 * - `regex`: Regular expression pattern
 * - `code`: Executable code (javascript, python, ruby)
 * - `array`: Array of strings (e.g., contains-all, contains-any)
 * - `number`: Numeric value/threshold (e.g., cost, latency)
 * - `reference`: Text for comparison with optional threshold (e.g., similar, levenshtein)
 * - `schema`: JSON Schema object (e.g., is-json with schema validation)
 * - `custom`: Complex or assertion-specific value type
 */
export type AssertionValueType =
  | 'none'
  | 'string'
  | 'text'
  | 'regex'
  | 'code'
  | 'array'
  | 'number'
  | 'reference'
  | 'schema'
  | 'custom';

/**
 * Handler function signature for assertions
 */
export type AssertionHandler = (params: AssertionParams) => GradingResult | Promise<GradingResult>;

/**
 * Complete definition for an assertion type.
 * Includes both metadata AND the handler function.
 */
export interface AssertionDefinition<T extends string = string> {
  /** Unique identifier matching the assertion type */
  id: T;
  /** Human-readable label */
  label: string;
  /** Description of what the assertion does */
  description: string;
  /**
   * Tags for organization and filtering.
   * The first tag is the primary tag used for UI grouping.
   * Additional tags enable cross-cutting filtering (e.g., 'rag', 'embeddings').
   */
  tags: AssertionTag[];
  /** What kind of value this assertion expects */
  valueType: AssertionValueType;
  /** The handler function that executes the assertion */
  handler: AssertionHandler;
  /** Whether this assertion requires an LLM for grading */
  requiresLlm?: boolean;
  /** Whether this assertion supports a threshold parameter */
  supportsThreshold?: boolean;
  /**
   * Whether a value is required for this assertion.
   * Defaults based on valueType:
   * - 'none': false (no value needed)
   * - 'schema': false (optional schema validation)
   * - All others: true (value required)
   */
  valueRequired?: boolean;
  /** URL to documentation */
  learnMoreUrl?: string;
}

/**
 * Type for a group of assertion definitions (used when one file defines multiple assertions)
 */
export type AssertionDefinitions<T extends string = string> = {
  [K in T]: AssertionDefinition<K>;
};

/**
 * Helper to create type-safe assertion definitions.
 * Ensures the id matches the key and provides good type inference.
 */
export function defineAssertions<T extends BaseAssertionTypes>(
  definitions: { [K in T]: Omit<AssertionDefinition<K>, 'id'> },
): AssertionDefinitions<T> {
  const result = {} as AssertionDefinitions<T>;
  for (const [id, def] of Object.entries(definitions) as [T, Omit<AssertionDefinition<T>, 'id'>][]) {
    (result as Record<T, AssertionDefinition<T>>)[id] = { id, ...def };
  }
  return result;
}

/**
 * Tag display metadata for UI rendering.
 */
export const TAG_META: Record<AssertionTag, { label: string; description: string }> = {
  // Primary tags
  'ai-evaluation': {
    label: 'AI Evaluation',
    description: 'LLM-powered evaluation of output quality',
  },
  'text-matching': {
    label: 'Text Matching',
    description: 'Exact or partial text matching',
  },
  similarity: {
    label: 'Similarity',
    description: 'Semantic and text similarity measures',
  },
  format: {
    label: 'Format Validation',
    description: 'Validate output structure (JSON, XML, SQL, etc.)',
  },
  safety: {
    label: 'Safety & Security',
    description: 'Security and content safety checks',
  },
  performance: {
    label: 'Performance',
    description: 'Cost, latency, and other metrics',
  },
  custom: {
    label: 'Custom',
    description: 'Custom code and webhook assertions',
  },
  // Cross-cutting tags
  rag: {
    label: 'RAG',
    description: 'Assertions for Retrieval-Augmented Generation pipelines',
  },
  embeddings: {
    label: 'Embeddings',
    description: 'Uses embedding models for semantic comparison',
  },
  external: {
    label: 'External Service',
    description: 'Calls an external API or service',
  },
  negation: {
    label: 'Negations',
    description: 'Inverse assertions (NOT variants)',
  },
};

/**
 * @deprecated Use TAG_META instead. Kept for backward compatibility.
 */
export const CATEGORY_META: Record<AssertionCategory, { label: string; description: string }> = {
  'ai-evaluation': TAG_META['ai-evaluation'],
  'text-matching': TAG_META['text-matching'],
  similarity: TAG_META.similarity,
  format: TAG_META.format,
  safety: TAG_META.safety,
  performance: TAG_META.performance,
  custom: TAG_META.custom,
  negation: TAG_META.negation,
};

/**
 * Get the primary tag (first tag) from a tags array.
 * Returns 'custom' as fallback if array is empty.
 */
export function getPrimaryTag(tags: AssertionTag[]): AssertionTag {
  return tags[0] ?? 'custom';
}

/**
 * Check if an assertion has a specific tag.
 */
export function hasTag(tags: AssertionTag[], tag: AssertionTag): boolean {
  return tags.includes(tag);
}
