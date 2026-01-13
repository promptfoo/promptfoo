import { z } from 'zod';
import { GradingConfigSchema } from './grading';

import type { RedteamAssertionTypes } from '../redteam/types';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../types/providers';
import type { TokenUsage, VarValue } from '../types/shared';
import type { TraceData } from '../types/tracing';
import type { AtomicTestCase } from './test_cases';

export interface ResultSuggestion {
  type: string;
  action: 'replace-prompt' | 'pre-filter' | 'post-filter' | 'note';
  value: string;
}

export interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
  namedScores?: Record<string, number>;
  tokensUsed?: TokenUsage;
  componentResults?: GradingResult[];
  assertion?: Assertion;
  comment?: string;
  suggestions?: ResultSuggestion[];
  metadata?: {
    pluginId?: string;
    strategyId?: string;
    context?: string | string[];
    contextUnits?: string[];
    renderedAssertionValue?: string;
    renderedGradingPrompt?: string;
    [key: string]: any;
  };
}

export function isGradingResult(result: any): result is GradingResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    typeof result.pass === 'boolean' &&
    typeof result.score === 'number' &&
    typeof result.reason === 'string' &&
    (typeof result.namedScores === 'undefined' || typeof result.namedScores === 'object') &&
    (typeof result.tokensUsed === 'undefined' || typeof result.tokensUsed === 'object') &&
    (typeof result.componentResults === 'undefined' || Array.isArray(result.componentResults)) &&
    (typeof result.assertion === 'undefined' ||
      result.assertion === null ||
      typeof result.assertion === 'object') &&
    (typeof result.comment === 'undefined' || typeof result.comment === 'string')
  );
}

export const BaseAssertionTypesSchema = z.enum([
  'answer-relevance',
  'bleu',
  'classifier',
  'contains',
  'contains-all',
  'contains-any',
  'contains-html',
  'contains-json',
  'contains-sql',
  'contains-xml',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'conversation-relevance',
  'cost',
  'equals',
  'factuality',
  'finish-reason',
  'g-eval',
  'gleu',
  'guardrails',
  'icontains',
  'icontains-all',
  'icontains-any',
  'is-html',
  'is-json',
  'is-refusal',
  'is-sql',
  'is-valid-function-call',
  'is-valid-openai-function-call',
  'is-valid-openai-tools-call',
  'is-xml',
  'javascript',
  'latency',
  'levenshtein',
  'llm-rubric',
  'pi',
  'meteor',
  'model-graded-closedqa',
  'model-graded-factuality',
  'moderation',
  'perplexity',
  'perplexity-score',
  'python',
  'regex',
  'rouge-n',
  'ruby',
  'similar',
  'similar:cosine',
  'similar:dot',
  'similar:euclidean',
  'starts-with',
  'tool-call-f1',
  'trace-error-spans',
  'trace-span-count',
  'trace-span-duration',
  'search-rubric',
  'webhook',
  'word-count',
]);

export type BaseAssertionTypes = z.infer<typeof BaseAssertionTypesSchema>;

export type SpecialAssertionTypes = 'select-best' | 'human' | 'max-score';

export const SpecialAssertionTypesSchema = z.enum(['select-best', 'human', 'max-score']);

const baseAssertionTypeSet = new Set(BaseAssertionTypesSchema.options);

const isRedteamAssertionType = (value: string): value is RedteamAssertionTypes => {
  return value.startsWith('promptfoo:redteam:');
};

type NotPrefixedAssertionType = `not-${BaseAssertionTypes}` | `not-${RedteamAssertionTypes}`;

const RedteamAssertionTypeSchema = z.custom<RedteamAssertionTypes>(
  (value) => typeof value === 'string' && isRedteamAssertionType(value),
  { message: 'Redteam assertion types must start with "promptfoo:redteam:".' },
);

export const NotPrefixedAssertionTypesSchema = z.custom<NotPrefixedAssertionType>(
  (value) => {
    if (typeof value !== 'string' || !value.startsWith('not-')) {
      return false;
    }
    const baseType = value.slice(4);
    return (
      baseAssertionTypeSet.has(baseType as BaseAssertionTypes) || isRedteamAssertionType(baseType)
    );
  },
  {
    message:
      'Inverse assertion types must be "not-" prefixed base types (e.g. "not-contains") or "not-promptfoo:redteam:*".',
  },
);

/**
 * Schema for assertion types. Accepts:
 * - Base assertion types (contains, equals, etc.)
 * - "not-" prefixed inverse types (not-contains, etc.)
 * - Special types (select-best, human, max-score)
 * - Redteam types (promptfoo:redteam:*)
 * - Any other string (for custom/extension assertion types)
 *
 * Note: The catch-all string allows custom assertion types that may be
 * implemented via extensions or handled at runtime. Invalid types will
 * fail at runtime with "Unknown assertion type" error.
 */
export const AssertionTypeSchema = z.union([
  BaseAssertionTypesSchema,
  NotPrefixedAssertionTypesSchema,
  SpecialAssertionTypesSchema,
  RedteamAssertionTypeSchema,
  // Catch-all for custom assertion types (extensions, etc.)
  // This maintains backward compatibility with configs using custom types
  z.string(),
]);

export type AssertionType = z.infer<typeof AssertionTypeSchema>;

const AssertionValueSchema = z.custom<AssertionValue>(
  (value) => {
    if (value === undefined) {
      return false;
    }
    if (value === null) {
      return true;
    }
    const valueType = typeof value;
    return (
      valueType === 'string' ||
      valueType === 'number' ||
      valueType === 'boolean' ||
      valueType === 'function' ||
      valueType === 'object'
    );
  },
  {
    message: 'Assertion value must be a string, number, boolean, object, or function.',
  },
);

// TODO(ian): maybe Assertion should support {type: config} to make the yaml cleaner
export const AssertionSchema = z.object({
  // Type of assertion
  type: AssertionTypeSchema,

  // The expected value, if applicable
  value: AssertionValueSchema.optional(),

  // An external mapping of arbitrary strings to values that is passed
  // to the assertion for custom asserts
  config: z.record(z.string(), z.any()).optional(),

  // The threshold value, only applicable for similarity (cosine distance)
  threshold: z.number().optional(),

  // The weight of this assertion compared to other assertions in the test case. Defaults to 1.
  weight: z.number().optional(),

  // Some assertions (similarity, llm-rubric) require an LLM provider
  provider: GradingConfigSchema.shape.provider,

  // Override the grading rubric
  rubricPrompt: GradingConfigSchema.shape.rubricPrompt,

  // Tag this assertion result as a named metric
  metric: z.string().optional(),

  // Process the output before running the assertion
  transform: z.string().optional(),

  // Extract context from the output using a transform
  contextTransform: z.string().optional(),
});

export type Assertion = z.infer<typeof AssertionSchema>;

/**
 * Zod schema for GradingResult - used for API request validation.
 * Uses z.lazy() for recursive componentResults field.
 */
export const GradingResultSchema: z.ZodType<GradingResult> = z.lazy(() =>
  z.object({
    pass: z.boolean(),
    score: z.number(),
    reason: z.string(),
    namedScores: z.record(z.string(), z.number()).optional(),
    tokensUsed: z
      .object({
        total: z.number().optional(),
        prompt: z.number().optional(),
        completion: z.number().optional(),
        cached: z.number().optional(),
        numRequests: z.number().optional(),
      })
      .passthrough()
      .optional(),
    componentResults: z.array(GradingResultSchema).optional(),
    assertion: AssertionSchema.optional(),
    comment: z.string().optional(),
    suggestions: z
      .array(
        z.object({
          type: z.string(),
          action: z.enum(['replace-prompt', 'pre-filter', 'post-filter', 'note']),
          value: z.string(),
        }),
      )
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
);

export const AssertionSetSchema = z.object({
  type: z.literal('assert-set'),
  // Sub assertions to be run for this assertion set
  assert: z.array(z.lazy(() => AssertionSchema)),
  // The weight of this assertion compared to other assertions in the test case. Defaults to 1.
  weight: z.number().optional(),
  // Tag this assertion result as a named metric
  metric: z.string().optional(),
  // The required score for this assert set. If not provided, the test case is graded pass/fail.
  threshold: z.number().optional(),

  // An external mapping of arbitrary strings to values that is defined
  // for every assertion in the set and passed into each assert
  config: z.record(z.string(), z.any()).optional(),
});

export type AssertionSet = z.infer<typeof AssertionSetSchema>;

/**
 * Schema for JSON Reference assertions ($ref).
 * These reference reusable assertion templates defined elsewhere in the config.
 * Example: { $ref: '#/assertionTemplates/containsPirateNoise' }
 */
export const AssertionRefSchema = z.object({
  $ref: z.string(),
});
export type AssertionRef = z.infer<typeof AssertionRefSchema>;

/**
 * Schema for validating individual assertions (regular or assert-set).
 * This is the type used at runtime after $ref assertions have been resolved.
 */
export const AssertionOrSetSchema = z.union([AssertionSetSchema, AssertionSchema]);
export type AssertionOrSet = z.infer<typeof AssertionOrSetSchema>;

/**
 * Schema for config validation that includes $ref assertions.
 * $ref assertions are resolved during config loading and converted to regular assertions.
 */
export const AssertionOrSetOrRefSchema = z.union([
  AssertionSetSchema,
  AssertionSchema,
  AssertionRefSchema,
]);
export type AssertionOrSetOrRef = z.infer<typeof AssertionOrSetOrRefSchema>;

/**
 * Type guard to check if an assertion is an AssertionSet.
 * Useful for narrowing the union type AssertionOrSet.
 */
export function isAssertionSet(assertion: AssertionOrSet): assertion is AssertionSet {
  return assertion.type === 'assert-set';
}

/**
 * Type guard to check if an assertion is a regular Assertion (not an AssertionSet).
 * Useful for narrowing the union type AssertionOrSet.
 */
export function isAssertion(assertion: AssertionOrSet): assertion is Assertion {
  return assertion.type !== 'assert-set';
}

export interface AssertionValueFunctionContext {
  prompt: string | undefined;
  vars: Record<string, VarValue>;
  test: AtomicTestCase;
  logProbs: number[] | undefined;
  config?: Record<string, any>;
  provider: ApiProvider | undefined;
  providerResponse: ProviderResponse | undefined;
  trace?: TraceData;
}

export type AssertionValueFunction = (
  output: string,
  context: AssertionValueFunctionContext,
) => AssertionValueFunctionResult | Promise<AssertionValueFunctionResult>;

export type AssertionValue =
  | string
  | string[]
  | number
  | boolean
  | null
  | object
  | AssertionValueFunction;

export type AssertionValueFunctionResult = boolean | number | GradingResult;

export interface AssertionParams {
  assertion: Assertion;
  baseType: AssertionType;
  /** Context passed to provider.callApi() for model-graded assertions */
  providerCallContext?: CallApiContextParams;
  /** Context passed to assertion value functions */
  assertionValueContext: AssertionValueFunctionContext;
  cost?: number;
  inverse: boolean;
  logProbs?: number[];
  latencyMs?: number;
  output: string | object;
  outputString: string;
  prompt?: string;
  provider?: ApiProvider;
  providerResponse: ProviderResponse;
  renderedValue?: AssertionValue;
  test: AtomicTestCase;
  valueFromScript?: string | boolean | number | GradingResult | object;
}
