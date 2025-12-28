/**
 * Assertion Registry - Browser-Safe Exports
 *
 * This module provides assertion metadata for browser/frontend use.
 * It does NOT include handler functions to avoid pulling in Node.js dependencies.
 *
 * For backend use with handlers, import from './registry' instead.
 */

import { BASE_ASSERTION_TYPES, SPECIAL_ASSERTION_TYPES } from '../types/index';

import type { BaseAssertionTypes, SpecialAssertionTypes } from '../types/index';
import {
  CATEGORY_META,
  getPrimaryTag,
  hasTag,
  TAG_META,
  type AssertionCategory,
  type AssertionTag,
  type AssertionValueType,
  type CrossCuttingTag,
  type PrimaryAssertionTag,
} from './assertionDefinition';

// Re-export types from assertionDefinition
export type {
  AssertionCategory,
  AssertionTag,
  AssertionValueType,
  CrossCuttingTag,
  PrimaryAssertionTag,
};
export { CATEGORY_META, TAG_META, getPrimaryTag, hasTag };

/**
 * All assertion types (base + special)
 */
export type AllAssertionTypes = BaseAssertionTypes | SpecialAssertionTypes;

/**
 * Core assertion type metadata WITHOUT handler (for browser/frontend consumers).
 */
export interface AssertionTypeMetadata<T extends AllAssertionTypes = AllAssertionTypes> {
  id: T;
  label: string;
  description: string;
  tags: AssertionTag[];
  valueType: AssertionValueType;
  requiresLlm?: boolean;
  supportsThreshold?: boolean;
  learnMoreUrl?: string;
}

/**
 * Static assertion metadata - no handlers, safe for browser.
 * This is manually maintained to match the handler definitions in registry.ts.
 *
 * When adding new assertions:
 * 1. Add the handler in the appropriate handler file (e.g., contains.ts)
 * 2. Add the metadata here
 * 3. The runtime validation in registry.ts will catch any mismatches
 */
export const ASSERTION_TYPE_METADATA: Record<AllAssertionTypes, AssertionTypeMetadata> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // AI EVALUATION
  // ═══════════════════════════════════════════════════════════════════════════
  'llm-rubric': {
    id: 'llm-rubric',
    label: 'LLM Rubric',
    description: 'Custom LLM-graded assertion using a rubric',
    tags: ['ai-evaluation'],
    valueType: 'text',
    requiresLlm: true,
  },
  factuality: {
    id: 'factuality',
    label: 'Factuality',
    description: 'Evaluates factual accuracy of output',
    tags: ['ai-evaluation'],
    valueType: 'text',
    requiresLlm: true,
    learnMoreUrl: 'https://promptfoo.dev/docs/configuration/expected-outputs/model-graded/',
  },
  'model-graded-factuality': {
    id: 'model-graded-factuality',
    label: 'Model Graded Factuality',
    description: 'Model-graded factuality check',
    tags: ['ai-evaluation'],
    valueType: 'text',
    requiresLlm: true,
    learnMoreUrl: 'https://promptfoo.dev/docs/configuration/expected-outputs/model-graded/',
  },
  'answer-relevance': {
    id: 'answer-relevance',
    label: 'Answer Relevance',
    description: 'Evaluates if the answer is relevant to the question',
    tags: ['ai-evaluation', 'rag'],
    valueType: 'none',
    requiresLlm: true,
    supportsThreshold: true,
  },
  'model-graded-closedqa': {
    id: 'model-graded-closedqa',
    label: 'Model Graded Closed QA',
    description: 'Model-graded closed-book QA evaluation',
    tags: ['ai-evaluation'],
    valueType: 'text',
    requiresLlm: true,
    learnMoreUrl: 'https://promptfoo.dev/docs/configuration/expected-outputs/model-graded/',
  },
  'search-rubric': {
    id: 'search-rubric',
    label: 'Search Rubric',
    description: 'Evaluates search result quality using a rubric',
    tags: ['ai-evaluation'],
    valueType: 'text',
    requiresLlm: true,
  },
  'context-faithfulness': {
    id: 'context-faithfulness',
    label: 'Context Faithfulness',
    description: 'Evaluates if the output is faithful to the provided context',
    tags: ['ai-evaluation', 'rag'],
    valueType: 'none',
    requiresLlm: true,
    supportsThreshold: true,
  },
  'context-recall': {
    id: 'context-recall',
    label: 'Context Recall',
    description: 'Evaluates if the output includes information from the context',
    tags: ['ai-evaluation', 'rag'],
    valueType: 'none',
    requiresLlm: true,
    supportsThreshold: true,
  },
  'context-relevance': {
    id: 'context-relevance',
    label: 'Context Relevance',
    description: 'Evaluates if the retrieved context is relevant to the query',
    tags: ['ai-evaluation', 'rag'],
    valueType: 'none',
    requiresLlm: true,
    supportsThreshold: true,
  },
  'conversation-relevance': {
    id: 'conversation-relevance',
    label: 'Conversation Relevance',
    description: 'Evaluates if the response is relevant to the conversation context',
    tags: ['ai-evaluation', 'rag'],
    valueType: 'none',
    requiresLlm: true,
    supportsThreshold: true,
  },
  'g-eval': {
    id: 'g-eval',
    label: 'G-Eval',
    description: 'G-Eval framework for evaluation with chain-of-thought',
    tags: ['ai-evaluation'],
    valueType: 'text',
    requiresLlm: true,
    learnMoreUrl: 'https://promptfoo.dev/docs/configuration/expected-outputs/model-graded/g-eval/',
  },
  human: {
    id: 'human',
    label: 'Human Review',
    description: 'Manual human grading (added via UI for manual review)',
    tags: ['ai-evaluation'],
    valueType: 'none',
  },
  'max-score': {
    id: 'max-score',
    label: 'Max Score',
    description: 'Selects the response with the highest score across variants',
    tags: ['ai-evaluation'],
    valueType: 'text',
    requiresLlm: true,
  },
  'select-best': {
    id: 'select-best',
    label: 'Select Best',
    description: 'Selects the best output from multiple options',
    tags: ['ai-evaluation'],
    valueType: 'text',
    requiresLlm: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEXT MATCHING
  // ═══════════════════════════════════════════════════════════════════════════
  contains: {
    id: 'contains',
    label: 'Contains',
    description: 'Output contains the expected text',
    tags: ['text-matching'],
    valueType: 'string',
  },
  icontains: {
    id: 'icontains',
    label: 'Contains (case-insensitive)',
    description: 'Output contains the expected text (case-insensitive)',
    tags: ['text-matching'],
    valueType: 'string',
  },
  'contains-all': {
    id: 'contains-all',
    label: 'Contains All',
    description: 'Output contains all of the expected strings',
    tags: ['text-matching'],
    valueType: 'array',
  },
  'contains-any': {
    id: 'contains-any',
    label: 'Contains Any',
    description: 'Output contains at least one of the expected strings',
    tags: ['text-matching'],
    valueType: 'array',
  },
  'icontains-all': {
    id: 'icontains-all',
    label: 'Contains All (case-insensitive)',
    description: 'Output contains all expected strings (case-insensitive)',
    tags: ['text-matching'],
    valueType: 'array',
  },
  'icontains-any': {
    id: 'icontains-any',
    label: 'Contains Any (case-insensitive)',
    description: 'Output contains at least one expected string (case-insensitive)',
    tags: ['text-matching'],
    valueType: 'array',
  },
  equals: {
    id: 'equals',
    label: 'Equals',
    description: 'Output exactly equals the expected text',
    tags: ['text-matching'],
    valueType: 'string',
  },
  'starts-with': {
    id: 'starts-with',
    label: 'Starts With',
    description: 'Output starts with the expected text',
    tags: ['text-matching'],
    valueType: 'string',
  },
  regex: {
    id: 'regex',
    label: 'Regex Match',
    description: 'Output matches the regular expression',
    tags: ['text-matching'],
    valueType: 'regex',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SIMILARITY
  // ═══════════════════════════════════════════════════════════════════════════
  similar: {
    id: 'similar',
    label: 'Similar',
    description: 'Output is semantically similar to expected (using embeddings)',
    tags: ['similarity', 'embeddings'],
    valueType: 'reference',
    requiresLlm: true,
    supportsThreshold: true,
  },
  'similar:cosine': {
    id: 'similar:cosine',
    label: 'Cosine Similarity',
    description: 'Cosine similarity between output and expected embeddings',
    tags: ['similarity', 'embeddings'],
    valueType: 'reference',
    requiresLlm: true,
    supportsThreshold: true,
  },
  'similar:dot': {
    id: 'similar:dot',
    label: 'Dot Product Similarity',
    description: 'Dot product similarity between embeddings',
    tags: ['similarity', 'embeddings'],
    valueType: 'reference',
    requiresLlm: true,
    supportsThreshold: true,
  },
  'similar:euclidean': {
    id: 'similar:euclidean',
    label: 'Euclidean Distance',
    description: 'Euclidean distance between embeddings',
    tags: ['similarity', 'embeddings'],
    valueType: 'reference',
    requiresLlm: true,
    supportsThreshold: true,
  },
  levenshtein: {
    id: 'levenshtein',
    label: 'Levenshtein Distance',
    description: 'Edit distance between output and expected',
    tags: ['similarity'],
    valueType: 'reference',
    supportsThreshold: true,
  },
  'rouge-n': {
    id: 'rouge-n',
    label: 'ROUGE-N Score',
    description: 'ROUGE-N score for summarization quality',
    tags: ['similarity'],
    valueType: 'reference',
    supportsThreshold: true,
  },
  bleu: {
    id: 'bleu',
    label: 'BLEU Score',
    description: 'BLEU score for translation/generation quality',
    tags: ['similarity'],
    valueType: 'reference',
    supportsThreshold: true,
  },
  gleu: {
    id: 'gleu',
    label: 'GLEU Score',
    description: 'GLEU score for translation quality',
    tags: ['similarity'],
    valueType: 'reference',
    supportsThreshold: true,
  },
  meteor: {
    id: 'meteor',
    label: 'METEOR Score',
    description: 'METEOR score for translation/generation quality',
    tags: ['similarity'],
    valueType: 'reference',
    supportsThreshold: true,
  },
  classifier: {
    id: 'classifier',
    label: 'Classifier',
    description: 'Classifies output using an embedding-based classifier',
    tags: ['ai-evaluation', 'embeddings'],
    valueType: 'string',
    supportsThreshold: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMAT VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════
  'is-json': {
    id: 'is-json',
    label: 'Is Valid JSON',
    description: 'Output is valid JSON (optionally matching a schema)',
    tags: ['format'],
    valueType: 'schema',
  },
  'contains-json': {
    id: 'contains-json',
    label: 'Contains JSON',
    description: 'Output contains valid JSON (optionally matching a schema)',
    tags: ['format'],
    valueType: 'schema',
  },
  'is-xml': {
    id: 'is-xml',
    label: 'Is Valid XML',
    description: 'Output is valid XML',
    tags: ['format'],
    valueType: 'none',
  },
  'contains-xml': {
    id: 'contains-xml',
    label: 'Contains XML',
    description: 'Output contains valid XML',
    tags: ['format'],
    valueType: 'none',
  },
  'is-sql': {
    id: 'is-sql',
    label: 'Is Valid SQL',
    description: 'Output is valid SQL syntax',
    tags: ['format'],
    valueType: 'none',
  },
  'contains-sql': {
    id: 'contains-sql',
    label: 'Contains SQL',
    description: 'Output contains valid SQL',
    tags: ['format'],
    valueType: 'none',
  },
  'is-html': {
    id: 'is-html',
    label: 'Is Valid HTML',
    description: 'Output is valid HTML',
    tags: ['format'],
    valueType: 'none',
  },
  'contains-html': {
    id: 'contains-html',
    label: 'Contains HTML',
    description: 'Output contains valid HTML',
    tags: ['format'],
    valueType: 'none',
  },
  'is-valid-openai-function-call': {
    id: 'is-valid-openai-function-call',
    label: 'Valid OpenAI Function Call',
    description: 'Output is a valid OpenAI function call',
    tags: ['format'],
    valueType: 'schema',
  },
  'is-valid-openai-tools-call': {
    id: 'is-valid-openai-tools-call',
    label: 'Valid OpenAI Tools Call',
    description: 'Output is a valid OpenAI tools call',
    tags: ['format'],
    valueType: 'schema',
  },
  'is-valid-function-call': {
    id: 'is-valid-function-call',
    label: 'Valid Function Call',
    description: 'Output is a valid function call (provider-agnostic)',
    tags: ['format'],
    valueType: 'schema',
  },
  'tool-call-f1': {
    id: 'tool-call-f1',
    label: 'Tool Call F1',
    description: 'F1 score for tool call accuracy',
    tags: ['format'],
    valueType: 'custom',
    supportsThreshold: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SAFETY & SECURITY
  // ═══════════════════════════════════════════════════════════════════════════
  moderation: {
    id: 'moderation',
    label: 'Moderation',
    description: 'Checks output against content moderation policies',
    tags: ['safety', 'external'],
    valueType: 'none',
    requiresLlm: true,
    learnMoreUrl: 'https://promptfoo.dev/docs/configuration/expected-outputs/moderation',
  },
  guardrails: {
    id: 'guardrails',
    label: 'Guardrails',
    description: 'Validates output against safety guardrails',
    tags: ['safety', 'external'],
    valueType: 'custom',
    requiresLlm: true,
    learnMoreUrl: 'https://promptfoo.dev/docs/configuration/expected-outputs/guardrails',
  },
  'is-refusal': {
    id: 'is-refusal',
    label: 'Is Refusal',
    description: 'Detects if the model refused to respond',
    tags: ['safety'],
    valueType: 'none',
  },
  pi: {
    id: 'pi',
    label: 'Pi Labs Scorer',
    description: 'Pi Labs preference scoring model for evaluating output quality',
    tags: ['ai-evaluation', 'external'],
    valueType: 'text',
    requiresLlm: true,
    supportsThreshold: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE
  // ═══════════════════════════════════════════════════════════════════════════
  cost: {
    id: 'cost',
    label: 'Cost',
    description: 'Checks if response cost is within threshold',
    tags: ['performance'],
    valueType: 'number',
    supportsThreshold: true,
  },
  latency: {
    id: 'latency',
    label: 'Latency',
    description: 'Checks if response latency is within threshold',
    tags: ['performance'],
    valueType: 'number',
    supportsThreshold: true,
  },
  perplexity: {
    id: 'perplexity',
    label: 'Perplexity',
    description: 'Evaluates output perplexity',
    tags: ['performance'],
    valueType: 'number',
    supportsThreshold: true,
  },
  'perplexity-score': {
    id: 'perplexity-score',
    label: 'Perplexity Score',
    description: 'Normalized perplexity score',
    tags: ['performance'],
    valueType: 'number',
    supportsThreshold: true,
  },
  'finish-reason': {
    id: 'finish-reason',
    label: 'Finish Reason',
    description: 'Checks the model finish reason',
    tags: ['performance'],
    valueType: 'string',
  },
  'trace-span-count': {
    id: 'trace-span-count',
    label: 'Trace Span Count',
    description: 'Validates number of spans in trace',
    tags: ['performance'],
    valueType: 'number',
    supportsThreshold: true,
  },
  'trace-span-duration': {
    id: 'trace-span-duration',
    label: 'Trace Span Duration',
    description: 'Validates span durations in trace',
    tags: ['performance'],
    valueType: 'number',
    supportsThreshold: true,
  },
  'trace-error-spans': {
    id: 'trace-error-spans',
    label: 'Trace Error Spans',
    description: 'Checks for error spans in trace',
    tags: ['performance'],
    valueType: 'number',
    supportsThreshold: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOM CODE
  // ═══════════════════════════════════════════════════════════════════════════
  javascript: {
    id: 'javascript',
    label: 'JavaScript',
    description: 'Custom JavaScript assertion function',
    tags: ['custom'],
    valueType: 'code',
  },
  python: {
    id: 'python',
    label: 'Python',
    description: 'Custom Python assertion function',
    tags: ['custom'],
    valueType: 'code',
  },
  ruby: {
    id: 'ruby',
    label: 'Ruby',
    description: 'Custom Ruby assertion function',
    tags: ['custom'],
    valueType: 'code',
  },
  webhook: {
    id: 'webhook',
    label: 'Webhook',
    description: 'Validates output via external webhook',
    tags: ['custom', 'external'],
    valueType: 'string',
  },
};

/**
 * Set of assertion types that require an LLM for grading.
 */
export const MODEL_GRADED_ASSERTION_TYPES = new Set<string>(
  Object.entries(ASSERTION_TYPE_METADATA)
    .filter(([, meta]) => meta.requiresLlm === true)
    .map(([id]) => id),
);

/**
 * Check if an assertion type requires an LLM for grading
 */
export function requiresLlm(type: string): boolean {
  // Strip 'not-' prefix if present
  const baseType = type.startsWith('not-') ? type.slice(4) : type;
  return MODEL_GRADED_ASSERTION_TYPES.has(baseType);
}

/**
 * Get metadata for an assertion type
 */
export function getAssertionMetadata(type: string): AssertionTypeMetadata | undefined {
  // Strip 'not-' prefix if present
  const baseType = type.startsWith('not-') ? type.slice(4) : type;
  return (ASSERTION_TYPE_METADATA as Record<string, AssertionTypeMetadata>)[baseType];
}

/**
 * Get all assertion types that have a specific tag
 */
export function getAssertionsByTag(tag: AssertionTag): AssertionTypeMetadata[] {
  return Object.values(ASSERTION_TYPE_METADATA).filter((meta) => meta.tags.includes(tag));
}

/**
 * Get all assertion types organized by their primary tag (first tag in array).
 * Use this for UI grouping.
 */
export function getAssertionsByPrimaryTag(): Map<AssertionTag, AssertionTypeMetadata[]> {
  const byTag = new Map<AssertionTag, AssertionTypeMetadata[]>();

  for (const meta of Object.values(ASSERTION_TYPE_METADATA)) {
    const primaryTag = getPrimaryTag(meta.tags);
    const list = byTag.get(primaryTag) || [];
    list.push(meta);
    byTag.set(primaryTag, list);
  }

  return byTag;
}

/**
 * Get all assertion types organized by category (primary tag).
 * @deprecated Use getAssertionsByPrimaryTag() instead. Kept for backward compatibility.
 */
export function getAssertionsByCategory(): Map<AssertionCategory, AssertionTypeMetadata[]> {
  const byCategory = new Map<AssertionCategory, AssertionTypeMetadata[]>();

  for (const meta of Object.values(ASSERTION_TYPE_METADATA)) {
    // Use first tag as category for backward compatibility
    const category = getPrimaryTag(meta.tags) as AssertionCategory;
    const list = byCategory.get(category) || [];
    list.push(meta);
    byCategory.set(category, list);
  }

  return byCategory;
}

// Re-export the canonical type lists for convenience
export { BASE_ASSERTION_TYPES, SPECIAL_ASSERTION_TYPES };
