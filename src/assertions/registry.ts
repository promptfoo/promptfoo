/**
 * Assertion Registry - Aggregated Definitions
 *
 * Single source of truth for assertion type metadata and handlers.
 * This module aggregates colocated definitions from individual handler files.
 *
 * IMPORTANT: This module imports handler functions which transitively import
 * Node.js-only modules (playwright, etc.). For browser/frontend use, import
 * from './registry-browser' instead which provides metadata without handlers.
 *
 * UI-specific extensions (form field definitions) are added in the frontend at:
 * src/app/src/utils/assertionRegistry.ts
 */

import { BASE_ASSERTION_TYPES, SPECIAL_ASSERTION_TYPES } from '../types/index';

import type { BaseAssertionTypes, SpecialAssertionTypes } from '../types/index';
import { conversationRelevanceDefinitions } from '../external/assertions/deepeval';
import { answerRelevanceDefinitions } from './answerRelevance';
import type {
  AssertionCategory,
  AssertionDefinition,
  AssertionHandler,
  AssertionTag,
  AssertionValueType,
  PrimaryAssertionTag,
} from './assertionDefinition';
import { CATEGORY_META, getPrimaryTag, TAG_META } from './assertionDefinition';
import { bleuDefinitions } from './bleu';
import { classifierDefinitions } from './classifier';
import { containsDefinitions } from './contains';
import { contextFaithfulnessDefinitions } from './contextFaithfulness';
import { contextRecallDefinitions } from './contextRecall';
import { contextRelevanceDefinitions } from './contextRelevance';
import { costDefinitions } from './cost';
import { equalsDefinitions } from './equals';
import { factualityDefinitions } from './factuality';
import { finishReasonDefinitions } from './finishReason';
import { functionToolCallDefinitions } from './functionToolCall';
import { gevalDefinitions } from './geval';
import { gleuDefinitions } from './gleu';
import { guardrailsDefinitions } from './guardrails';
import { htmlDefinitions } from './html';
import { javascriptDefinitions } from './javascript';
import { jsonDefinitions } from './json';
import { latencyDefinitions } from './latency';
import { levenshteinDefinitions } from './levenshtein';
import { llmRubricDefinitions } from './llmRubric';
import { modelGradedClosedQaDefinitions } from './modelGradedClosedQa';
import { moderationDefinitions } from './moderation';
import { openaiDefinitions } from './openai';
import { perplexityDefinitions } from './perplexity';
import { piDefinitions } from './pi';
import { pythonDefinitions } from './python';
import { refusalDefinitions } from './refusal';
import { regexDefinitions } from './regex';
import { rougeDefinitions } from './rouge';
import { rubyDefinitions } from './ruby';
import { searchRubricDefinitions } from './searchRubric';
import { similarDefinitions } from './similar';
import { sqlDefinitions } from './sql';
import { startsWithDefinitions } from './startsWith';
import { toolCallF1Definitions } from './toolCallF1';
import { traceErrorSpansDefinitions } from './traceErrorSpans';
import { traceSpanCountDefinitions } from './traceSpanCount';
import { traceSpanDurationDefinitions } from './traceSpanDuration';
import { webhookDefinitions } from './webhook';
import { xmlDefinitions } from './xml';

// Re-export types from assertionDefinition
export type {
  AssertionCategory,
  AssertionDefinition,
  AssertionHandler,
  AssertionTag,
  AssertionValueType,
  PrimaryAssertionTag,
};
export { CATEGORY_META, TAG_META, getPrimaryTag };

/**
 * All assertion types (base + special)
 */
export type AllAssertionTypes = BaseAssertionTypes | SpecialAssertionTypes;

/**
 * Aggregated assertion definitions from all handler files.
 * This is the single source of truth for both metadata and handlers.
 */
export const ASSERTION_DEFINITIONS: Record<string, AssertionDefinition> = {
  // Import from handler files
  ...answerRelevanceDefinitions,
  ...bleuDefinitions,
  ...classifierDefinitions,
  ...containsDefinitions,
  ...contextFaithfulnessDefinitions,
  ...contextRecallDefinitions,
  ...contextRelevanceDefinitions,
  ...costDefinitions,
  ...equalsDefinitions,
  ...factualityDefinitions,
  ...finishReasonDefinitions,
  ...functionToolCallDefinitions,
  ...gevalDefinitions,
  ...gleuDefinitions,
  ...guardrailsDefinitions,
  ...htmlDefinitions,
  ...javascriptDefinitions,
  ...jsonDefinitions,
  ...latencyDefinitions,
  ...levenshteinDefinitions,
  ...llmRubricDefinitions,
  ...modelGradedClosedQaDefinitions,
  ...moderationDefinitions,
  ...openaiDefinitions,
  ...perplexityDefinitions,
  ...piDefinitions,
  ...pythonDefinitions,
  ...refusalDefinitions,
  ...regexDefinitions,
  ...rougeDefinitions,
  ...rubyDefinitions,
  ...searchRubricDefinitions,
  ...similarDefinitions,
  ...sqlDefinitions,
  ...startsWithDefinitions,
  ...toolCallF1Definitions,
  ...traceErrorSpansDefinitions,
  ...traceSpanCountDefinitions,
  ...traceSpanDurationDefinitions,
  ...webhookDefinitions,
  ...xmlDefinitions,
  ...conversationRelevanceDefinitions,

  // Meteor uses dynamic import due to optional 'natural' dependency
  // The handler is defined inline to handle the lazy loading
  meteor: {
    id: 'meteor',
    label: 'METEOR Score',
    description: 'METEOR score for translation/generation quality',
    tags: ['similarity'],
    valueType: 'reference',
    supportsThreshold: true,
    handler: async (params) => {
      try {
        const { handleMeteorAssertion } = await import('./meteor.js');
        return handleMeteorAssertion(params);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes('Cannot find module') ||
            error.message.includes('natural" package is required'))
        ) {
          return {
            pass: false,
            score: 0,
            reason:
              'METEOR assertion requires the natural package. Please install it using: npm install natural@^8.1.0',
            assertion: params.assertion,
          };
        }
        throw error;
      }
    },
  },

  // Special assertion types that don't have handlers (handled by special logic)
  human: {
    id: 'human',
    label: 'Human Review',
    description: 'Manual human grading (added via UI for manual review)',
    tags: ['ai-evaluation'],
    valueType: 'none',
    handler: () => {
      throw new Error('human assertion type is not meant to be executed directly');
    },
  },
  'max-score': {
    id: 'max-score',
    label: 'Max Score',
    description: 'Selects the response with the highest score across variants',
    tags: ['ai-evaluation'],
    valueType: 'text',
    requiresLlm: true,
    handler: () => {
      throw new Error('max-score assertion type is handled separately in runAssertions');
    },
  },
  'select-best': {
    id: 'select-best',
    label: 'Select Best',
    description: 'Selects the best output from multiple options',
    tags: ['ai-evaluation'],
    valueType: 'text',
    requiresLlm: true,
    handler: () => {
      throw new Error('select-best assertion type is handled separately in runAssertions');
    },
  },
};

/**
 * Core assertion type metadata WITHOUT handler (for external consumers).
 * Derived from ASSERTION_DEFINITIONS.
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
 * Exported assertion metadata record derived from ASSERTION_DEFINITIONS.
 * This strips the handler function for external consumers.
 */
export const ASSERTION_TYPE_METADATA = Object.fromEntries(
  Object.entries(ASSERTION_DEFINITIONS).map(([id, def]) => [
    id,
    {
      id: def.id,
      label: def.label,
      description: def.description,
      tags: def.tags,
      valueType: def.valueType,
      ...(def.requiresLlm !== undefined && { requiresLlm: def.requiresLlm }),
      ...(def.supportsThreshold !== undefined && { supportsThreshold: def.supportsThreshold }),
      ...(def.learnMoreUrl !== undefined && { learnMoreUrl: def.learnMoreUrl }),
    },
  ]),
) as Record<AllAssertionTypes, AssertionTypeMetadata>;

/**
 * Set of assertion types that require an LLM for grading.
 * Derived from definitions - this replaces the manually maintained set.
 */
export const MODEL_GRADED_ASSERTION_TYPES = new Set<string>(
  Object.entries(ASSERTION_DEFINITIONS)
    .filter(([, def]) => def.requiresLlm === true)
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
 * Get the handler for an assertion type
 */
export function getAssertionHandler(type: string): AssertionHandler | undefined {
  // Strip 'not-' prefix if present
  const baseType = type.startsWith('not-') ? type.slice(4) : type;
  return ASSERTION_DEFINITIONS[baseType]?.handler;
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

// ═══════════════════════════════════════════════════════════════════════════
// RUNTIME VALIDATION
// Catches configuration errors early in development/test environments
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validates that all assertion types from the canonical lists have definitions.
 * This is a runtime check that complements the compile-time checks.
 * Returns an array of error messages (empty if valid).
 */
export function validateAssertionMetadata(): string[] {
  const errors: string[] = [];
  const allTypes = [...BASE_ASSERTION_TYPES, ...SPECIAL_ASSERTION_TYPES];
  const definitionKeys = new Set(Object.keys(ASSERTION_DEFINITIONS));

  // Check for missing types
  for (const type of allTypes) {
    if (!definitionKeys.has(type)) {
      errors.push(`Missing definition for assertion type: ${type}`);
    }
  }

  // Check for extra types (shouldn't happen, but belt-and-suspenders)
  for (const key of definitionKeys) {
    if (!allTypes.includes(key as AllAssertionTypes)) {
      errors.push(`Extra definition key not in canonical type lists: ${key}`);
    }
  }

  // Validate that all definitions have at least one tag
  for (const [id, def] of Object.entries(ASSERTION_DEFINITIONS)) {
    if (!def.tags || def.tags.length === 0) {
      errors.push(`Assertion "${id}" has no tags defined`);
    }
  }

  return errors;
}

// Run validation in development/test environments
if (process.env.NODE_ENV !== 'production') {
  const validationErrors = validateAssertionMetadata();
  if (validationErrors.length > 0) {
    console.error('[assertions/registry] Validation errors:');
    for (const error of validationErrors) {
      console.error(`  - ${error}`);
    }
    // In test environment, throw to fail tests early
    if (process.env.NODE_ENV === 'test') {
      throw new Error(`Assertion registry validation failed:\n${validationErrors.join('\n')}`);
    }
  }
}
