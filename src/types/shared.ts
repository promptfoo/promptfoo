import { z } from 'zod';

/**
 * Detailed completion-token breakdown reported by reasoning-capable models.
 *
 * @example
 * ```ts
 * const details: CompletionTokenDetails = {
 *   reasoning: 32,
 *   cacheReadInputTokens: 128,
 * };
 * ```
 *
 * @public
 */
export const CompletionTokenDetailsSchema = z.object({
  /** Tokens spent on hidden model reasoning when the provider reports them. */
  reasoning: z.number().optional(),
  /** Prediction tokens accepted by speculative decoding, when reported. */
  acceptedPrediction: z.number().optional(),
  /** Prediction tokens rejected by speculative decoding, when reported. */
  rejectedPrediction: z.number().optional(),
  /** Input tokens read from a provider cache. */
  cacheReadInputTokens: z.number().optional(),
  /** Input tokens written into a provider cache. */
  cacheCreationInputTokens: z.number().optional(),
});

/**
 * Detailed completion-token breakdown reported by reasoning-capable models.
 *
 * @example
 * ```ts
 * const details: CompletionTokenDetails = {
 *   reasoning: 32,
 *   cacheReadInputTokens: 128,
 * };
 * ```
 *
 * @public
 */
export interface CompletionTokenDetails {
  /** Tokens spent on hidden model reasoning when the provider reports them. */
  reasoning?: number;
  /** Prediction tokens accepted by speculative decoding, when reported. */
  acceptedPrediction?: number;
  /** Prediction tokens rejected by speculative decoding, when reported. */
  rejectedPrediction?: number;
  /** Input tokens read from a provider cache. */
  cacheReadInputTokens?: number;
  /** Input tokens written into a provider cache. */
  cacheCreationInputTokens?: number;
}

/**
 * Token accounting reported by providers and graders.
 *
 * @example
 * ```ts
 * const usage: TokenUsage = {
 *   prompt: 12,
 *   completion: 8,
 *   total: 20,
 * };
 * ```
 *
 * @public
 */
export const BaseTokenUsageSchema = z.object({
  /** Prompt/input tokens consumed by the provider call. */
  prompt: z.number().optional(),
  /** Completion/output tokens produced by the provider call. */
  completion: z.number().optional(),
  /** Tokens served from a provider cache, when reported. */
  cached: z.number().optional(),
  /** Total tokens reported for the provider call. */
  total: z.number().optional(),

  /** Number of underlying requests represented by this usage object. */
  numRequests: z.number().optional(),

  /** Provider-specific completion-token breakdown. */
  completionDetails: CompletionTokenDetailsSchema.optional(),

  /** Token usage accumulated by model-graded assertions. */
  assertions: z
    .object({
      /** Total assertion tokens. */
      total: z.number().optional(),
      /** Assertion prompt/input tokens. */
      prompt: z.number().optional(),
      /** Assertion completion/output tokens. */
      completion: z.number().optional(),
      /** Assertion tokens served from cache. */
      cached: z.number().optional(),
      /** Number of assertion model requests represented here. */
      numRequests: z.number().optional(),
      /** Detailed completion-token breakdown for assertion grading. */
      completionDetails: CompletionTokenDetailsSchema.optional(),
    })
    .optional(),
});

/**
 * Token accounting attributed to model-graded assertions.
 *
 * @example
 * ```ts
 * const usage: AssertionTokenUsage = {
 *   prompt: 14,
 *   completion: 6,
 *   total: 20,
 * };
 * ```
 *
 * @public
 */
export interface AssertionTokenUsage {
  /** Total assertion tokens. */
  total?: number;
  /** Assertion prompt/input tokens. */
  prompt?: number;
  /** Assertion completion/output tokens. */
  completion?: number;
  /** Assertion tokens served from cache. */
  cached?: number;
  /** Number of assertion model requests represented here. */
  numRequests?: number;
  /** Detailed completion-token breakdown for assertion grading. */
  completionDetails?: CompletionTokenDetails;
}

/**
 * Token accounting reported by providers and graders.
 *
 * @example
 * ```ts
 * const usage: TokenUsage = {
 *   prompt: 12,
 *   completion: 8,
 *   total: 20,
 * };
 * ```
 *
 * @public
 */
export interface TokenUsage {
  /** Prompt/input tokens consumed by the provider call. */
  prompt?: number;
  /** Completion/output tokens produced by the provider call. */
  completion?: number;
  /** Tokens served from a provider cache, when reported. */
  cached?: number;
  /** Total tokens reported for the provider call. */
  total?: number;
  /** Number of underlying requests represented by this usage object. */
  numRequests?: number;
  /** Provider-specific completion-token breakdown. */
  completionDetails?: CompletionTokenDetails;
  /** Token usage accumulated by model-graded assertions. */
  assertions?: AssertionTokenUsage;
}

export type BaseTokenUsage = TokenUsage;

type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;
function assert<_T extends true>() {}

assert<AssertEqual<CompletionTokenDetails, z.infer<typeof CompletionTokenDetailsSchema>>>();
assert<AssertEqual<TokenUsage, z.infer<typeof BaseTokenUsageSchema>>>();

export type NunjucksFilterMap = Record<string, (...args: any[]) => string>;

// VarValue represents the type of values that can be stored in Vars
// Includes primitives (string, number, boolean), objects, and arrays
export type VarValue = string | number | boolean | object | unknown[];

const InputVariableNameSchema = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
  error: 'Input variable names must be valid identifiers (start with letter or underscore)',
});

export const InputTypeValues = ['text', 'pdf', 'docx', 'image'] as const;
export const InputTypeSchema = z.enum(InputTypeValues);
export type InputType = z.infer<typeof InputTypeSchema>;

export const DocxInjectionPlacementValues = [
  'body',
  'comment',
  'footnote',
  'header',
  'footer',
] as const;
export const DocxInjectionPlacementSchema = z.enum(DocxInjectionPlacementValues);
export type DocxInjectionPlacement = z.infer<typeof DocxInjectionPlacementSchema>;

export const DocumentMediaInjectionPlacementValues = ['body', 'header', 'footer'] as const;
export const DocumentMediaInjectionPlacementSchema = z.enum(DocumentMediaInjectionPlacementValues);

export const InputConfigSchema = z.object({
  benign: z.boolean().optional(),
  inputPurpose: z
    .string()
    .min(1, {
      error: 'Input purpose must be a non-empty string',
    })
    .optional(),
  injectionPlacements: z
    .array(z.string().min(1, { error: 'Injection placement must be a non-empty string' }))
    .min(1, { error: 'Injection placements must contain at least one placement' })
    .optional(),
});
export type InputConfig = z.infer<typeof InputConfigSchema>;

export const InputDefinitionObjectSchema = z
  .object({
    config: InputConfigSchema.optional(),
    description: z.string().min(1, {
      error: 'Input descriptions must be non-empty strings',
    }),
    type: InputTypeSchema.optional(),
  })
  .superRefine((input, ctx) => {
    const inputType = input.type ?? 'text';
    const injectionPlacements = input.config?.injectionPlacements ?? [];

    if (inputType === 'text' || injectionPlacements.length === 0) {
      return;
    }

    const placementSchema =
      inputType === 'docx' ? DocxInjectionPlacementSchema : DocumentMediaInjectionPlacementSchema;
    const placementValues =
      inputType === 'docx' ? DocxInjectionPlacementValues : DocumentMediaInjectionPlacementValues;
    const invalidPlacements = injectionPlacements.filter(
      (placement) => !placementSchema.safeParse(placement).success,
    );

    if (invalidPlacements.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['config', 'injectionPlacements'],
        message: `Invalid ${inputType.toUpperCase()} injection placements: ${invalidPlacements.join(', ')}. Expected one of: ${placementValues.join(', ')}`,
      });
    }
  });

export const InputDefinitionSchema = z.union([
  z.string().min(1, {
    error: 'Input descriptions must be non-empty strings',
  }),
  InputDefinitionObjectSchema,
]);

export type InputDefinition = z.infer<typeof InputDefinitionSchema>;
export type NormalizedInputDefinition = {
  config?: InputConfig;
  description: string;
  type: InputType;
};

export function normalizeInputDefinition(input: InputDefinition): NormalizedInputDefinition {
  if (typeof input === 'string') {
    return {
      description: input,
      type: 'text',
    };
  }

  return {
    config: input.config,
    description: input.description,
    type: input.type ?? 'text',
  };
}

export function normalizeInputs(
  inputs?: Inputs,
): Record<string, NormalizedInputDefinition> | undefined {
  if (!inputs) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(inputs).map(([key, input]) => [key, normalizeInputDefinition(input)]),
  );
}

export function getInputDescription(input: InputDefinition): string {
  return normalizeInputDefinition(input).description;
}

export function getInputType(input: InputDefinition): InputType {
  return normalizeInputDefinition(input).type;
}

export function buildInputPromptDescription(input: InputDefinition): string {
  const normalized = normalizeInputDefinition(input);
  const benignGuidance = normalized.config?.benign
    ? ' Generate benign, natural, non-adversarial content for this input. Do not place attack instructions or policy-violating content here.'
    : '';

  if (normalized.type === 'text') {
    return `${normalized.description}${benignGuidance}`;
  }

  const formatLabel =
    normalized.type === 'pdf'
      ? 'PDF document'
      : normalized.type === 'docx'
        ? 'DOCX document'
        : 'image';

  return `${normalized.description} (format: ${formatLabel}; provide the text or instructions that should be embedded in the file)${benignGuidance}`;
}

// Inputs schema for multi-variable test case generation.
// Keys are variable names, values are descriptions or typed definitions for what the variable should contain.
export const InputsSchema = z.record(InputVariableNameSchema, InputDefinitionSchema);
export type Inputs = z.infer<typeof InputsSchema>;
