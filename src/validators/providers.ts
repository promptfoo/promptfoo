import { z } from 'zod';
import { InputsSchema } from '../redteam/types';
import { ProviderEnvOverridesSchema } from '../types/env';
import { BaseTokenUsageSchema } from '../types/shared';

import type {
  CallApiFunction,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderId,
  ProviderLabel,
} from '../types/providers';

export const ProviderOptionsSchema = z.object({
  id: z.custom<ProviderId>().optional(),
  label: z.custom<ProviderLabel>().optional(),
  config: z.any().optional(),
  prompts: z.array(z.string()).optional(),
  transform: z.string().optional(),
  delay: z.number().optional(),
  env: ProviderEnvOverridesSchema.optional(),
  inputs: InputsSchema.optional(),
});

const CallApiFunctionSchema = z.custom<CallApiFunction & { label?: string }>(
  (v) => typeof v === 'function',
);

export const ApiProviderSchema = z.object({
  id: z.custom<() => string>((v) => typeof v === 'function'),
  callApi: z.custom<CallApiFunction>((v) => typeof v === 'function'),
  callEmbeddingApi: z
    .custom<(prompt: string) => Promise<ProviderEmbeddingResponse>>((v) => typeof v === 'function')
    .optional(),
  callClassificationApi: z
    .custom<(prompt: string) => Promise<ProviderClassificationResponse>>(
      (v) => typeof v === 'function',
    )
    .optional(),
  label: z.custom<ProviderLabel>().optional(),
  transform: z.string().optional(),
  delay: z.number().optional(),
  config: z.any().optional(),
  inputs: InputsSchema.optional(),
});

/**
 * Schema for reasoning content from various providers.
 * Discriminated union matching the ReasoningContent type.
 */
export const ReasoningContentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('thinking'),
    thinking: z.string(),
    signature: z.string().optional(),
  }),
  z.object({
    type: z.literal('redacted_thinking'),
    data: z.string(),
  }),
  z.object({
    type: z.literal('reasoning'),
    content: z.string(),
  }),
  z.object({
    type: z.literal('thought'),
    thought: z.string(),
  }),
  z.object({
    type: z.literal('think'),
    content: z.string(),
  }),
]);

export const ProviderResponseSchema = z.object({
  cached: z.boolean().optional(),
  cost: z.number().optional(),
  error: z.string().optional(),
  logProbs: z.array(z.number()).optional(),
  metadata: z
    .object({
      redteamFinalPrompt: z.string().optional(),
    })
    .catchall(z.any())
    .optional(),
  output: z.union([z.string(), z.any()]).optional(),
  reasoning: z.array(ReasoningContentSchema).optional(),
  tokenUsage: BaseTokenUsageSchema.optional(),
});

export const ProviderEmbeddingResponseSchema = z.object({
  error: z.string().optional(),
  embedding: z.array(z.number()).optional(),
  tokenUsage: BaseTokenUsageSchema.partial().optional(),
});

export const ProviderSimilarityResponseSchema = z.object({
  error: z.string().optional(),
  similarity: z.number().optional(),
  tokenUsage: BaseTokenUsageSchema.partial().optional(),
});

export const ProviderClassificationResponseSchema = z.object({
  error: z.string().optional(),
  classification: z.record(z.string(), z.number()).optional(),
});

export const ProvidersSchema = z.union([
  z.string(),
  CallApiFunctionSchema,
  z.array(
    z.union([
      z.string(),
      CallApiFunctionSchema,
      z.record(z.string(), ProviderOptionsSchema),
      ProviderOptionsSchema,
    ]),
  ),
]);

export const ProviderSchema = z.union([z.string(), ApiProviderSchema, ProviderOptionsSchema]);
