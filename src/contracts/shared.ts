import { z } from 'zod';

import type { GuardrailResponse } from './providers';

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

/** Target usage with independent generation, attacker, and assertion breakdowns. */
export const BaseTokenUsageSchema = TokenUsageCoreSchema.extend({
  attacker: TokenUsageCoreSchema.optional(),
  assertions: TokenUsageCoreSchema.optional(),
  generation: TokenUsageCoreSchema.optional(),
});

export type TokenUsage = z.infer<typeof BaseTokenUsageSchema>;
export type NormalizedTokenUsage = Required<Omit<TokenUsage, 'attacker' | 'generation'>> &
  Pick<TokenUsage, 'attacker' | 'generation'>;

export type RedteamHistoryDisposition = 'retained' | 'backtracked' | 'pruned' | 'error' | 'ended';
export type RedteamHistoryKind = 'conversation' | 'search';

export interface RedteamMediaData {
  data?: string;
  format: string;
}

/** One target attempt in either a legacy history or the compact versioned attempt graph. */
export interface RedteamHistoryEntry {
  prompt: string;
  output: string;
  attempt?: number;
  parentAttempt?: number;
  disposition?: RedteamHistoryDisposition;
  turn?: number;
  depth?: number;
  wasSelected?: boolean;
  score?: number;
  graderPassed?: boolean;
  graderError?: string;
  guardrails?: GuardrailResponse;
  tokenUsage?: TokenUsage;
  cached?: boolean;
  latencyMs?: number;
  sessionId?: string;
  promptAudio?: RedteamMediaData;
  promptImage?: RedteamMediaData;
  outputAudio?: RedteamMediaData;
  outputImage?: RedteamMediaData;
  inputVars?: Record<string, string>;
}

/** Accept broad persisted metadata shapes without forcing callers through casts. */
export type RedteamHistoryMetadata = Record<string, any>;

export interface NormalizedRedteamHistory {
  kind: RedteamHistoryKind;
  entries: RedteamHistoryEntry[];
  finalAttempt?: number;
  version: 1 | 2;
}

const HISTORY_DISPOSITIONS = new Set<RedteamHistoryDisposition>([
  'retained',
  'backtracked',
  'pruned',
  'error',
  'ended',
]);

/** Normalize historical conversation/tree records and the versioned attempt graph. */
export function normalizeRedteamHistory(
  metadata?: RedteamHistoryMetadata | null,
): NormalizedRedteamHistory {
  const conversationEntries = Array.isArray(metadata?.redteamHistory)
    ? metadata.redteamHistory
    : [];
  const legacyTreeEntries = Array.isArray(metadata?.redteamTreeHistory)
    ? metadata.redteamTreeHistory
    : [];
  const version = metadata?.redteamHistoryVersion === 2 ? 2 : 1;
  const isLegacyTree =
    version === 1 && conversationEntries.length === 0 && legacyTreeEntries.length > 0;
  const kind =
    version === 2 && metadata?.redteamHistoryKind === 'search'
      ? 'search'
      : isLegacyTree
        ? 'search'
        : 'conversation';
  const source = isLegacyTree ? legacyTreeEntries : conversationEntries;
  const entries: RedteamHistoryEntry[] = [];

  for (const value of source) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const entry = value as RedteamHistoryEntry;
    const attempt =
      Number.isSafeInteger(entry.attempt) && entry.attempt! > 0
        ? entry.attempt!
        : entries.length + 1;
    const disposition = HISTORY_DISPOSITIONS.has(entry.disposition!)
      ? entry.disposition!
      : 'retained';

    entries.push({
      ...entry,
      prompt: typeof entry.prompt === 'string' ? entry.prompt : '',
      output: typeof entry.output === 'string' ? entry.output : '',
      attempt,
      disposition,
      ...(version === 1 && kind === 'conversation' && entries.length > 0
        ? { parentAttempt: entries[entries.length - 1].attempt }
        : {}),
    });
  }

  const explicitFinalAttempt = metadata?.redteamFinalAttempt;
  const finalAttempt =
    Number.isSafeInteger(explicitFinalAttempt) && (explicitFinalAttempt as number) > 0
      ? (explicitFinalAttempt as number)
      : version === 1
        ? entries[entries.length - 1]?.attempt
        : undefined;

  return { kind, entries, finalAttempt, version };
}

/** Return the complete audit history, including rejected and pruned attempts. */
export function getAllRedteamHistoryEntries(
  metadata?: RedteamHistoryMetadata | null,
): RedteamHistoryEntry[] {
  return normalizeRedteamHistory(metadata).entries;
}

/** Resolve the selected terminal attempt without accidentally selecting a later backtrack. */
export function getFinalRedteamHistoryEntry(
  metadata?: RedteamHistoryMetadata | null,
): RedteamHistoryEntry | undefined {
  const history = normalizeRedteamHistory(metadata);
  if (history.finalAttempt === undefined) {
    return undefined;
  }

  const direct = history.entries[history.finalAttempt - 1];
  return direct?.attempt === history.finalAttempt
    ? direct
    : history.entries.find((entry) => entry.attempt === history.finalAttempt);
}

/** Return the selected branch in chronological order, guarding against malformed parent cycles. */
export function getSelectedRedteamHistoryPath(
  metadata?: RedteamHistoryMetadata | null,
): RedteamHistoryEntry[] {
  const history = normalizeRedteamHistory(metadata);
  if (history.finalAttempt === undefined) {
    return [];
  }

  const byAttempt = new Map(history.entries.map((entry) => [entry.attempt, entry]));
  const selected: RedteamHistoryEntry[] = [];
  const visited = new Set<number>();
  let attempt: number | undefined = history.finalAttempt;

  while (attempt !== undefined && !visited.has(attempt)) {
    const entry = byAttempt.get(attempt);
    if (!entry) {
      break;
    }
    visited.add(attempt);
    if (entry.disposition === 'retained') {
      selected.push(entry);
    }
    attempt = entry.parentAttempt;
  }

  return selected.reverse();
}

/** Preserve legacy tree visualization while excluding rejected attempts from conversations. */
export function getDisplayRedteamHistory(
  metadata?: RedteamHistoryMetadata | null,
): RedteamHistoryEntry[] {
  const history = normalizeRedteamHistory(metadata);
  if (history.kind === 'search' || history.version === 1) {
    return history.entries;
  }
  return getSelectedRedteamHistoryPath(metadata);
}

export type NunjucksFilterMap = Record<string, (...args: any[]) => string>;

// VarValue represents the type of values that can be stored in Vars
// Includes primitives (string, number, boolean), objects, and arrays
export type VarValue = string | number | boolean | object | unknown[];

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
  return typeof input === 'string' ? input : input.description;
}

export function getInputType(input: InputDefinition): InputType {
  return typeof input === 'string' ? 'text' : (input.type ?? 'text');
}

const NON_TEXT_INPUT_FORMAT_LABELS: Record<Exclude<InputType, 'text'>, string> = {
  pdf: 'PDF document',
  docx: 'DOCX document',
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
