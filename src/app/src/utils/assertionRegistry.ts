/**
 * Assertion Registry - UI Extension
 *
 * Extends the core assertion metadata from @promptfoo/assertions/registry
 * with UI-specific field definitions for form rendering.
 *
 * Architecture:
 * - Core metadata (labels, descriptions, tags, valueType, requiresLlm) lives in src/assertions/registry.ts
 * - UI-specific field definitions live here
 * - This ensures the backend and frontend stay in sync
 */

import {
  ASSERTION_TYPE_METADATA,
  BASE_ASSERTION_TYPES,
  getPrimaryTag,
  type AllAssertionTypes,
  type AssertionCategory,
  type AssertionTag,
  type AssertionTypeMetadata,
  type AssertionValueType,
} from '@promptfoo/assertions/registry-browser';
import type { AssertionType } from '@promptfoo/types';

// Re-export core types and utilities
export {
  requiresLlm,
  getAssertionsByCategory,
  getAssertionsByTag,
  getAssertionsByPrimaryTag,
  getPrimaryTag,
} from '@promptfoo/assertions/registry-browser';
export type {
  AssertionCategory,
  AssertionTag,
  AllAssertionTypes,
  AssertionValueType,
} from '@promptfoo/assertions/registry-browser';
export { CATEGORY_META, TAG_META } from '@promptfoo/assertions/registry-browser';

/**
 * Field type for assertion configuration forms
 */
export type AssertionFieldType =
  | 'text' // Single-line input
  | 'textarea' // Multi-line textarea
  | 'number' // Numeric input
  | 'select' // Dropdown selection
  | 'code' // Code editor (monospace)
  | 'provider' // Provider selector
  | 'array'; // Array of strings

/**
 * Field definition for assertion configuration
 */
export interface AssertionFieldDefinition {
  name: string;
  type: AssertionFieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  helpText?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  options?: Array<{ value: string; label: string }>;
}

/**
 * Complete assertion type definition (core metadata + UI fields)
 */
export interface AssertionTypeDefinition extends AssertionTypeMetadata {
  id: AssertionType;
  fields: AssertionFieldDefinition[];
  experimental?: boolean;
}

/**
 * Type-safe record for field definitions ensuring all types are covered.
 */
type CompleteFieldDefinitions = {
  [K in AllAssertionTypes]: AssertionFieldDefinition[];
};

/**
 * UI-specific field definitions for each assertion type.
 * Core metadata (label, description, category, requiresLlm) comes from ASSERTION_TYPE_METADATA.
 *
 * The `satisfies` clause ensures compile-time errors if any assertion type is missing.
 */
const _ASSERTION_FIELD_DEFINITIONS = {
  // ═══════════════════════════════════════════════════════════════════════════
  // AI EVALUATION
  // ═══════════════════════════════════════════════════════════════════════════
  'llm-rubric': [
    {
      name: 'value',
      type: 'textarea',
      label: 'Grading Criteria',
      required: true,
      placeholder: 'The response should be helpful, accurate, and well-structured...',
      helpText: 'Describe what makes a good response. Be specific about what to evaluate.',
    },
    {
      name: 'provider',
      type: 'provider',
      label: 'Judge Model',
      required: false,
      helpText: 'Optional: specify a model to use as the grader',
    },
  ],
  factuality: [],
  'answer-relevance': [
    {
      name: 'threshold',
      type: 'number',
      label: 'Minimum Score',
      required: false,
      defaultValue: 0.7,
      placeholder: '0.7',
      helpText: 'Relevance score threshold (0-1)',
      validation: { min: 0, max: 1 },
    },
  ],
  'model-graded-closedqa': [],
  'model-graded-factuality': [],
  'search-rubric': [
    {
      name: 'value',
      type: 'textarea',
      label: 'Search Quality Criteria',
      required: true,
      placeholder: 'Define what makes a good search result...',
    },
  ],
  human: [],
  'context-faithfulness': [
    {
      name: 'threshold',
      type: 'number',
      label: 'Minimum Score',
      required: false,
      defaultValue: 0.7,
      placeholder: '0.7',
      validation: { min: 0, max: 1 },
    },
  ],
  'context-recall': [
    {
      name: 'threshold',
      type: 'number',
      label: 'Minimum Score',
      required: false,
      defaultValue: 0.7,
      placeholder: '0.7',
      validation: { min: 0, max: 1 },
    },
  ],
  'context-relevance': [
    {
      name: 'threshold',
      type: 'number',
      label: 'Minimum Score',
      required: false,
      defaultValue: 0.7,
      placeholder: '0.7',
      validation: { min: 0, max: 1 },
    },
  ],
  'conversation-relevance': [
    {
      name: 'threshold',
      type: 'number',
      label: 'Minimum Score',
      required: false,
      defaultValue: 0.7,
      placeholder: '0.7',
      validation: { min: 0, max: 1 },
    },
  ],
  'g-eval': [
    {
      name: 'value',
      type: 'textarea',
      label: 'Evaluation Criteria',
      required: true,
      placeholder: 'Evaluate the response on coherence, fluency, and helpfulness...',
    },
  ],
  moderation: [],
  'max-score': [],
  'select-best': [
    {
      name: 'value',
      type: 'textarea',
      label: 'Selection Criteria',
      required: true,
      placeholder: 'Select the response that is most helpful and accurate...',
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // TEXT MATCHING
  // ═══════════════════════════════════════════════════════════════════════════
  contains: [
    {
      name: 'value',
      type: 'text',
      label: 'Expected Text',
      required: true,
      placeholder: 'Enter text to find in output...',
    },
  ],
  icontains: [
    {
      name: 'value',
      type: 'text',
      label: 'Expected Text',
      required: true,
      placeholder: 'Enter text to find in output...',
    },
  ],
  equals: [
    {
      name: 'value',
      type: 'textarea',
      label: 'Expected Output',
      required: true,
      placeholder: 'Enter exact expected output...',
    },
  ],
  'starts-with': [
    {
      name: 'value',
      type: 'text',
      label: 'Expected Prefix',
      required: true,
      placeholder: 'Enter expected starting text...',
    },
  ],
  regex: [
    {
      name: 'value',
      type: 'code',
      label: 'Regex Pattern',
      required: true,
      placeholder: '/pattern/flags',
      helpText: 'JavaScript regex syntax, e.g., /[a-z]+@example\\.com/i',
    },
  ],
  'contains-all': [
    {
      name: 'value',
      type: 'array',
      label: 'Required Strings',
      required: true,
      placeholder: 'Enter strings separated by newlines...',
      helpText: 'All of these strings must be present in the output',
    },
  ],
  'contains-any': [
    {
      name: 'value',
      type: 'array',
      label: 'Possible Strings',
      required: true,
      placeholder: 'Enter strings separated by newlines...',
      helpText: 'At least one of these strings must be present',
    },
  ],
  'icontains-all': [
    {
      name: 'value',
      type: 'array',
      label: 'Required Strings',
      required: true,
      placeholder: 'Enter strings separated by newlines...',
      helpText: 'All of these strings must be present (case-insensitive)',
    },
  ],
  'icontains-any': [
    {
      name: 'value',
      type: 'array',
      label: 'Possible Strings',
      required: true,
      placeholder: 'Enter strings separated by newlines...',
      helpText: 'At least one must be present (case-insensitive)',
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SIMILARITY
  // ═══════════════════════════════════════════════════════════════════════════
  similar: [
    {
      name: 'value',
      type: 'textarea',
      label: 'Expected Meaning',
      required: true,
      placeholder: 'Describe the expected meaning or provide example text...',
    },
    {
      name: 'threshold',
      type: 'number',
      label: 'Similarity Threshold',
      required: false,
      defaultValue: 0.8,
      placeholder: '0.8',
      helpText: 'Minimum cosine similarity (0-1)',
      validation: { min: 0, max: 1 },
    },
  ],
  levenshtein: [
    {
      name: 'value',
      type: 'textarea',
      label: 'Expected Text',
      required: true,
      placeholder: 'Enter expected text...',
    },
    {
      name: 'threshold',
      type: 'number',
      label: 'Maximum Distance',
      required: true,
      placeholder: '10',
      helpText: 'Maximum allowed edit distance (lower is stricter)',
    },
  ],
  'rouge-n': [
    {
      name: 'value',
      type: 'textarea',
      label: 'Reference Text',
      required: true,
      placeholder: 'Enter reference text for comparison...',
    },
    {
      name: 'threshold',
      type: 'number',
      label: 'Minimum Score',
      required: false,
      defaultValue: 0.5,
      placeholder: '0.5',
      validation: { min: 0, max: 1 },
    },
  ],
  bleu: [
    {
      name: 'value',
      type: 'textarea',
      label: 'Reference Text',
      required: true,
      placeholder: 'Enter reference text for comparison...',
    },
    {
      name: 'threshold',
      type: 'number',
      label: 'Minimum Score',
      required: false,
      defaultValue: 0.5,
      placeholder: '0.5',
      validation: { min: 0, max: 1 },
    },
  ],
  classifier: [
    {
      name: 'value',
      type: 'text',
      label: 'Expected Classification',
      required: true,
      placeholder: 'positive, negative, neutral...',
    },
  ],
  gleu: [
    {
      name: 'value',
      type: 'textarea',
      label: 'Reference Text',
      required: true,
      placeholder: 'Enter reference text for comparison...',
    },
    {
      name: 'threshold',
      type: 'number',
      label: 'Minimum Score',
      required: false,
      defaultValue: 0.5,
      placeholder: '0.5',
      validation: { min: 0, max: 1 },
    },
  ],
  meteor: [
    {
      name: 'value',
      type: 'textarea',
      label: 'Reference Text',
      required: true,
      placeholder: 'Enter reference text for comparison...',
    },
    {
      name: 'threshold',
      type: 'number',
      label: 'Minimum Score',
      required: false,
      defaultValue: 0.5,
      placeholder: '0.5',
      validation: { min: 0, max: 1 },
    },
  ],
  'similar:cosine': [
    {
      name: 'value',
      type: 'textarea',
      label: 'Reference Text',
      required: true,
      placeholder: 'Enter text to compare against...',
    },
    {
      name: 'threshold',
      type: 'number',
      label: 'Minimum Similarity',
      required: false,
      defaultValue: 0.8,
      placeholder: '0.8',
      helpText: 'Minimum cosine similarity score (0-1)',
      validation: { min: 0, max: 1 },
    },
  ],
  'similar:dot': [
    {
      name: 'value',
      type: 'textarea',
      label: 'Reference Text',
      required: true,
      placeholder: 'Enter text to compare against...',
    },
    {
      name: 'threshold',
      type: 'number',
      label: 'Minimum Similarity',
      required: false,
      defaultValue: 0.8,
      placeholder: '0.8',
      helpText: 'Minimum dot product similarity score',
    },
  ],
  'similar:euclidean': [
    {
      name: 'value',
      type: 'textarea',
      label: 'Reference Text',
      required: true,
      placeholder: 'Enter text to compare against...',
    },
    {
      name: 'threshold',
      type: 'number',
      label: 'Maximum Distance',
      required: false,
      placeholder: '1.0',
      helpText: 'Maximum euclidean distance (lower is more similar)',
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMAT VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════
  'is-json': [],
  'contains-json': [],
  'is-xml': [],
  'contains-xml': [],
  'is-sql': [],
  'contains-sql': [],
  'is-valid-function-call': [],
  'is-valid-openai-function-call': [],
  'is-valid-openai-tools-call': [],
  'is-html': [],
  'contains-html': [],
  'tool-call-f1': [
    {
      name: 'threshold',
      type: 'number',
      label: 'Minimum F1 Score',
      required: false,
      defaultValue: 0.8,
      placeholder: '0.8',
      helpText: 'Minimum F1 score for tool call matching (0-1)',
      validation: { min: 0, max: 1 },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SAFETY & SECURITY
  // ═══════════════════════════════════════════════════════════════════════════
  pi: [],
  guardrails: [],
  'is-refusal': [],

  // ═══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE
  // ═══════════════════════════════════════════════════════════════════════════
  cost: [
    {
      name: 'threshold',
      type: 'number',
      label: 'Maximum Cost ($)',
      required: true,
      placeholder: '0.01',
      helpText: 'Maximum cost in USD',
    },
  ],
  latency: [
    {
      name: 'threshold',
      type: 'number',
      label: 'Maximum Latency (ms)',
      required: true,
      placeholder: '1000',
      helpText: 'Maximum response time in milliseconds',
    },
  ],
  perplexity: [
    {
      name: 'threshold',
      type: 'number',
      label: 'Maximum Perplexity',
      required: true,
      placeholder: '20',
    },
  ],
  'perplexity-score': [
    {
      name: 'threshold',
      type: 'number',
      label: 'Maximum Score',
      required: true,
      placeholder: '0.5',
      validation: { min: 0, max: 1 },
    },
  ],
  'finish-reason': [
    {
      name: 'value',
      type: 'select',
      label: 'Expected Finish Reason',
      required: true,
      options: [
        { value: 'stop', label: 'Stop' },
        { value: 'length', label: 'Length' },
        { value: 'content_filter', label: 'Content Filter' },
        { value: 'tool_calls', label: 'Tool Calls' },
        { value: 'function_call', label: 'Function Call' },
      ],
    },
  ],
  'trace-span-count': [
    {
      name: 'threshold',
      type: 'number',
      label: 'Expected Count',
      required: true,
      placeholder: '5',
      helpText: 'Expected number of spans in the trace',
    },
  ],
  'trace-span-duration': [
    {
      name: 'threshold',
      type: 'number',
      label: 'Maximum Duration (ms)',
      required: true,
      placeholder: '1000',
      helpText: 'Maximum allowed duration for spans in milliseconds',
    },
  ],
  'trace-error-spans': [
    {
      name: 'threshold',
      type: 'number',
      label: 'Maximum Errors',
      required: false,
      defaultValue: 0,
      placeholder: '0',
      helpText: 'Maximum allowed number of error spans',
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOM CODE
  // ═══════════════════════════════════════════════════════════════════════════
  javascript: [
    {
      name: 'value',
      type: 'code',
      label: 'JavaScript Code',
      required: true,
      placeholder: '(output, context) => {\n  return output.includes("hello");\n}',
      helpText: 'Function receives (output, context) and returns boolean or GradingResult',
    },
  ],
  python: [
    {
      name: 'value',
      type: 'code',
      label: 'Python Code',
      required: true,
      placeholder: 'def get_assert_value(output, context):\n    return len(output) > 10',
      helpText: 'Define get_assert_value(output, context) that returns True/False or dict',
    },
  ],
  ruby: [
    {
      name: 'value',
      type: 'code',
      label: 'Ruby Code',
      required: true,
      placeholder: 'def get_assert_value(output, context)\n  output.length > 10\nend',
      helpText: 'Define get_assert_value(output, context) that returns true/false or hash',
    },
  ],
  webhook: [
    {
      name: 'value',
      type: 'text',
      label: 'Webhook URL',
      required: true,
      placeholder: 'https://api.example.com/validate',
      helpText: 'URL that receives POST with output and returns pass/fail',
    },
  ],
} satisfies CompleteFieldDefinitions;

/**
 * Export with simpler type for consumption.
 */
const ASSERTION_FIELD_DEFINITIONS: Record<AllAssertionTypes, AssertionFieldDefinition[]> =
  _ASSERTION_FIELD_DEFINITIONS;

/**
 * Build negation field definitions from base types.
 * Negations use the same fields as their base type.
 */
function buildNegationFields(): Record<string, AssertionFieldDefinition[]> {
  const negations: Record<string, AssertionFieldDefinition[]> = {};

  for (const baseType of BASE_ASSERTION_TYPES) {
    const baseFields = (ASSERTION_FIELD_DEFINITIONS as Record<string, AssertionFieldDefinition[]>)[
      baseType
    ];
    if (baseFields) {
      negations[`not-${baseType}`] = baseFields.map((field) => ({
        ...field,
        // Update labels for negation context where appropriate
        label: field.label.replace('Expected', 'Forbidden').replace('Required', 'Forbidden'),
      }));
    }
  }

  return negations;
}

/**
 * Build the complete assertion registry by combining core metadata with field definitions.
 */
function buildAssertionRegistry(): Record<string, AssertionTypeDefinition> {
  const registry: Record<string, AssertionTypeDefinition> = {};

  // Add base types with their field definitions
  for (const [id, metadata] of Object.entries(ASSERTION_TYPE_METADATA)) {
    registry[id] = {
      ...metadata,
      id: metadata.id as AssertionType,
      fields:
        (ASSERTION_FIELD_DEFINITIONS as Record<string, AssertionFieldDefinition[]>)[id] || [],
    };
  }

  // Add negation types
  const negationFields = buildNegationFields();
  for (const baseType of BASE_ASSERTION_TYPES) {
    const negationType = `not-${baseType}` as AssertionType;
    const baseMetadata = ASSERTION_TYPE_METADATA[baseType];

    if (baseMetadata) {
      registry[negationType] = {
        id: negationType,
        label: `Not ${baseMetadata.label}`,
        description: baseMetadata.description.replace('Output', 'Output does NOT'),
        tags: ['negation', ...baseMetadata.tags.filter((t) => t !== 'negation')] as AssertionTag[],
        valueType: baseMetadata.valueType,
        fields: negationFields[negationType] || [],
        requiresLlm: baseMetadata.requiresLlm,
      };
    }
  }

  return registry;
}

/**
 * Complete assertion registry with field definitions.
 * This combines core metadata from @promptfoo/assertions/registry with UI-specific fields.
 */
export const ASSERTION_REGISTRY = buildAssertionRegistry();

/**
 * Get assertion type definition by ID
 */
export function getAssertionType(id: string): AssertionTypeDefinition | undefined {
  return ASSERTION_REGISTRY[id];
}

/**
 * Check if a type is in the registry
 */
export function isKnownAssertionType(type: string): boolean {
  return type in ASSERTION_REGISTRY;
}

/**
 * Validate assertion configuration against field definitions
 */
export function validateAssertionConfig(
  type: string,
  config: Record<string, unknown>,
): string[] {
  const def = ASSERTION_REGISTRY[type];
  if (!def) {
    // Unknown type - allow it (could be custom provider assertion)
    return [];
  }

  const errors: string[] = [];

  for (const field of def.fields) {
    const value = config[field.name];

    if (field.required && (value === undefined || value === null || value === '')) {
      errors.push(`Missing required field: ${field.label}`);
      continue;
    }

    if (value !== undefined && field.validation) {
      if (field.type === 'number') {
        const numValue = Number(value);
        if (field.validation.min !== undefined && numValue < field.validation.min) {
          errors.push(`${field.label} must be at least ${field.validation.min}`);
        }
        if (field.validation.max !== undefined && numValue > field.validation.max) {
          errors.push(`${field.label} must be at most ${field.validation.max}`);
        }
      }
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// Ensures the registry stays in sync with @promptfoo/assertions/registry
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the list of assertion types that are defined in core but missing field definitions.
 * Useful for development to identify gaps.
 */
export function getMissingFieldDefinitions(): string[] {
  return Object.keys(ASSERTION_TYPE_METADATA).filter(
    (type) => !(type in ASSERTION_FIELD_DEFINITIONS),
  );
}

// Development-time validation
if (import.meta.env.DEV) {
  const missing = getMissingFieldDefinitions();
  if (missing.length > 0) {
    console.warn(
      '[assertionRegistry] Missing field definitions for:',
      missing,
      '\nThese types have core metadata but no UI field definitions.',
    );
  }
}

export default ASSERTION_REGISTRY;
