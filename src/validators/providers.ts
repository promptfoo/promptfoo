import { z } from 'zod';
import { ProviderEnvOverridesSchema } from '../contracts/env';
import { InputsSchema } from '../contracts/shared';
import { StringOrFunctionSchema } from '../contracts/validators/shared';

import type {
  CallApiFunction,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderId,
  ProviderLabel,
  ProviderModerationResponse,
  ProviderSimilarityResponse,
} from '../types/providers';

export const ProviderOptionsSchema = z.object({
  id: z.custom<ProviderId>().optional(),
  label: z.custom<ProviderLabel>().optional(),
  config: z.any().optional(),
  prompts: z.array(z.string()).optional(),
  transform: StringOrFunctionSchema.optional(),
  delay: z.number().optional(),
  env: ProviderEnvOverridesSchema.optional(),
  inputs: InputsSchema.optional(),
});

const CallApiFunctionSchema = z.custom<CallApiFunction & { label?: string }>(
  (v) => typeof v === 'function',
);

export const ApiProviderObjectSchema = z.object({
  id: z.custom<() => string>((v) => typeof v === 'function'),
  callApi: z.custom<CallApiFunction>((v) => typeof v === 'function'),
  callEmbeddingApi: z
    .custom<(prompt: string) => Promise<ProviderEmbeddingResponse>>((v) => typeof v === 'function')
    .optional(),
  supportsEmbeddingCancellation: z.boolean().optional(),
  callClassificationApi: z
    .custom<(prompt: string) => Promise<ProviderClassificationResponse>>(
      (v) => typeof v === 'function',
    )
    .optional(),
  callSimilarityApi: z
    .custom<(expected: string, output: string) => Promise<ProviderSimilarityResponse>>(
      (v) => typeof v === 'function',
    )
    .optional(),
  callModerationApi: z
    .custom<(prompt: string, response: string) => Promise<ProviderModerationResponse>>(
      (v) => typeof v === 'function',
    )
    .optional(),
  promptfooCapabilities: z
    .array(
      z.enum([
        'callApi',
        'callEmbeddingApi',
        'callClassificationApi',
        'callSimilarityApi',
        'callModerationApi',
      ]),
    )
    .readonly()
    .optional(),
  label: z.custom<ProviderLabel>().optional(),
  prompts: z.array(z.string()).optional(),
  transform: StringOrFunctionSchema.optional(),
  delay: z.number().optional(),
  config: z.any().optional(),
  inputs: InputsSchema.optional(),
});

export const ApiProviderSchema = z.unknown().transform((input, ctx) => {
  const result = ApiProviderObjectSchema.safeParse(input);
  if (!result.success) {
    ctx.addIssue({ code: 'custom', message: result.error.message });
    return z.NEVER;
  }
  // Keep the live instance, including private state, prototype hooks and scheduler symbols.
  return input as typeof result.data;
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

export const ProviderSchema = z.union([
  z.string(),
  ApiProviderSchema,
  ProviderOptionsSchema.extend({ callApi: z.never().optional() }),
]);
