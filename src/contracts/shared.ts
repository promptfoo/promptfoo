import { z } from 'zod';

// for reasoning models
export const CompletionTokenDetailsSchema = z.object({
  reasoning: z.number().optional(),
  acceptedPrediction: z.number().optional(),
  rejectedPrediction: z.number().optional(),
  cacheReadInputTokens: z.number().optional(),
  cacheCreationInputTokens: z.number().optional(),
});

export type CompletionTokenDetails = z.infer<typeof CompletionTokenDetailsSchema>;

const TokenUsageCoreSchema = z.object({
  prompt: z.number().optional(),
  completion: z.number().optional(),
  cached: z.number().optional(),
  total: z.number().optional(),
  numRequests: z.number().optional(),
  completionDetails: CompletionTokenDetailsSchema.optional(),
});

/** Token usage statistics. The optional `assertions` mirrors the top-level fields for model-graded assertion accounting. */
export const BaseTokenUsageSchema = TokenUsageCoreSchema.extend({
  assertions: TokenUsageCoreSchema.optional(),
});

export type TokenUsage = z.infer<typeof BaseTokenUsageSchema>;

export type NunjucksFilterMap = Record<string, (...args: any[]) => string>;

// VarValue represents the type of values that can be stored in Vars
// Includes primitives (string, number, boolean), objects, and arrays
export type VarValue = string | number | boolean | object | unknown[];

export const InputTypeValues = ['text', 'pdf', 'docx', 'xlsx', 'image'] as const;
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

export const XlsxInjectionPlacementValues = [
  'cell',
  'formula',
  'hyperlink',
  'comment',
  'hidden-sheet',
] as const;
export const XlsxInjectionPlacementSchema = z.enum(XlsxInjectionPlacementValues);
export type XlsxInjectionPlacement = z.infer<typeof XlsxInjectionPlacementSchema>;

export const DocumentMediaInjectionPlacementValues = ['body', 'header', 'footer'] as const;
export const DocumentMediaInjectionPlacementSchema = z.enum(DocumentMediaInjectionPlacementValues);

const XlsxCellReferenceSchema = z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,6}$/i, {
  error: 'XLSX cell references must be single A1-style cells such as B4',
});

const XlsxSheetNameSchema = z
  .string()
  .min(1, {
    error: 'XLSX sheet names must be non-empty strings',
  })
  .max(31, {
    error: 'XLSX sheet names must be 31 characters or fewer',
  })
  .refine((value) => !/[:\\/?*[\]]/.test(value), {
    error: 'XLSX sheet names cannot contain : \\ / ? * [ or ]',
  })
  .refine((value) => value.trim() === value && !value.startsWith("'") && !value.endsWith("'"), {
    error: 'XLSX sheet names cannot start or end with spaces or apostrophes',
  });

export const XlsxInputConfigSchema = z.object({
  cells: z
    .object({
      cell: XlsxCellReferenceSchema.optional(),
      comment: XlsxCellReferenceSchema.optional(),
      formula: XlsxCellReferenceSchema.optional(),
      hyperlink: XlsxCellReferenceSchema.optional(),
      'hidden-sheet': XlsxCellReferenceSchema.optional(),
    })
    .strict()
    .optional(),
  hiddenSheetName: XlsxSheetNameSchema.optional(),
  sheetName: XlsxSheetNameSchema.optional(),
});
export type XlsxInputConfig = z.infer<typeof XlsxInputConfigSchema>;

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
  xlsx: XlsxInputConfigSchema.optional(),
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

    if (inputType !== 'xlsx' && input.config?.xlsx) {
      ctx.addIssue({
        code: 'custom',
        path: ['config', 'xlsx'],
        message: 'XLSX config is only supported for XLSX inputs',
      });
    }

    if (inputType === 'text' || injectionPlacements.length === 0) {
      return;
    }

    const placementSchema =
      inputType === 'docx'
        ? DocxInjectionPlacementSchema
        : inputType === 'xlsx'
          ? XlsxInjectionPlacementSchema
          : DocumentMediaInjectionPlacementSchema;
    const placementValues =
      inputType === 'docx'
        ? DocxInjectionPlacementValues
        : inputType === 'xlsx'
          ? XlsxInjectionPlacementValues
          : DocumentMediaInjectionPlacementValues;
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
  return typeof input === 'string' ? input : input.description;
}

export function getInputType(input: InputDefinition): InputType {
  return typeof input === 'string' ? 'text' : (input.type ?? 'text');
}

const NON_TEXT_INPUT_FORMAT_LABELS: Record<Exclude<InputType, 'text'>, string> = {
  pdf: 'PDF document',
  docx: 'DOCX document',
  xlsx: 'XLSX spreadsheet',
  image: 'image',
};

export function buildInputPromptDescription(input: InputDefinition): string {
  const normalized = normalizeInputDefinition(input);
  const benignGuidance = normalized.config?.benign
    ? ' Generate benign, natural, non-adversarial content for this input. Do not place attack instructions or policy-violating content here.'
    : '';

  if (normalized.type === 'text') {
    return `${normalized.description}${benignGuidance}`;
  }

  const formatLabel = NON_TEXT_INPUT_FORMAT_LABELS[normalized.type];
  return `${normalized.description} (format: ${formatLabel}; provide the text or instructions that should be embedded in the file)${benignGuidance}`;
}

const InputVariableNameSchema = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
  error: 'Input variable names must be valid identifiers (start with letter or underscore)',
});

// Inputs schema for multi-variable test case generation.
// Keys are variable names, values are descriptions or typed definitions for what the variable should contain.
export const InputsSchema = z.record(InputVariableNameSchema, InputDefinitionSchema);
export type Inputs = z.infer<typeof InputsSchema>;
