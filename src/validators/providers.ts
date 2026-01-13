import { z } from 'zod';
import { InputsSchema } from '../redteam/types';
import { ProviderEnvOverridesSchema } from '../types/env';
import { BaseTokenUsageSchema } from '../types/shared';

import type {
  CallApiFunction,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderOptions,
} from '../types/providers';

// Type synchronization helper
type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;
function assert<_T extends true>() {}

export const ProviderOptionsSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  config: z.any().optional(),
  prompts: z.array(z.string()).optional(),
  transform: z.string().optional(),
  delay: z.number().int().nonnegative().optional(),
  env: ProviderEnvOverridesSchema.optional(),
  inputs: InputsSchema.optional(),
});

assert<AssertEqual<ProviderOptions, z.infer<typeof ProviderOptionsSchema>>>();

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
  label: z.string().optional(),
  transform: z.string().optional(),
  delay: z.number().int().nonnegative().optional(),
  config: z.any().optional(),
  inputs: InputsSchema.optional(),
});

const ProviderHttpMetadataSchema = z.object({
  status: z.number(),
  statusText: z.string(),
  headers: z.record(z.string(), z.string()),
  requestHeaders: z.record(z.string(), z.string()).optional(),
});

const ProviderMetadataSchema = z
  .object({
    redteamFinalPrompt: z.string().optional(),
    http: ProviderHttpMetadataSchema.optional(),
  })
  .catchall(z.unknown());

const GuardrailResponseSchema = z.object({
  flaggedInput: z.boolean().optional(),
  flaggedOutput: z.boolean().optional(),
  flagged: z.boolean().optional(),
  reason: z.string().optional(),
});

const ProviderAudioSchema = z
  .object({
    id: z.string().optional(),
    expiresAt: z.number().optional(),
    data: z.string().optional(),
    blobRef: z.unknown().optional(),
    transcript: z.string().optional(),
    format: z.string().optional(),
    sampleRate: z.number().optional(),
    channels: z.number().optional(),
    duration: z.number().optional(),
  })
  .passthrough();

const ProviderVideoSchema = z
  .object({
    id: z.string().optional(),
    blobRef: z.unknown().optional(),
    storageRef: z
      .object({
        key: z.string().optional(),
      })
      .optional(),
    url: z.string().optional(),
    format: z.string().optional(),
    size: z.string().optional(),
    duration: z.number().optional(),
    thumbnail: z.string().optional(),
    spritesheet: z.string().optional(),
    model: z.string().optional(),
    aspectRatio: z.string().optional(),
    resolution: z.string().optional(),
  })
  .passthrough();

export const ProviderResponseSchema = z
  .object({
    cached: z.boolean().optional(),
    cost: z.number().optional(),
    error: z.string().optional(),
    isBase64: z.boolean().optional(),
    format: z.string().optional(),
    logProbs: z.array(z.number()).optional(),
    latencyMs: z.number().optional(),
    metadata: ProviderMetadataSchema.optional(),
    output: z.unknown().optional(),
    raw: z.unknown().optional(),
    providerTransformedOutput: z.unknown().optional(),
    tokenUsage: BaseTokenUsageSchema.optional(),
    isRefusal: z.boolean().optional(),
    sessionId: z.string().optional(),
    guardrails: GuardrailResponseSchema.optional(),
    finishReason: z.string().optional(),
    audio: ProviderAudioSchema.optional(),
    video: ProviderVideoSchema.optional(),
  })
  .passthrough();

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
