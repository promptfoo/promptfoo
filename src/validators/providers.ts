import { z } from 'zod';
import { InputsSchema } from '../redteam/types';
import { ProviderEnvOverridesSchema } from '../types/env';
import { BaseTokenUsageSchema } from '../types/shared';
import { PromptSchema } from './prompts';
import { NunjucksFilterMapSchema } from './shared';

import type {
  CallApiFunction,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderId,
  ProviderLabel,
  ProviderResponse,
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

const CallApiContextParamsSchema = z.object({
  fetchWithCache: z.optional(z.any()),
  filters: NunjucksFilterMapSchema.optional(),
  getCache: z.optional(z.any()),
  logger: z.optional(z.any()),
  originalProvider: z.optional(z.any()),
  prompt: PromptSchema,
  vars: z.record(z.string(), z.union([z.string(), z.custom<object>()])),
});

const CallApiOptionsParamsSchema = z.object({
  includeLogProbs: z.optional(z.boolean()),
});

const CallApiFunctionSchema = z.custom<CallApiFunction & { label?: string }>();

export const ApiProviderSchema = z.object({
  id: z.custom<() => string>(),
  callApi: z.custom<CallApiFunction>(),
  callEmbeddingApi: z.custom<(prompt: string) => Promise<ProviderEmbeddingResponse>>().optional(),
  callClassificationApi: z
    .custom<(prompt: string) => Promise<ProviderClassificationResponse>>()
    .optional(),
  label: z.custom<ProviderLabel>().optional(),
  transform: z.string().optional(),
  delay: z.number().optional(),
  config: z.any().optional(),
  inputs: InputsSchema.optional(),
});

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
