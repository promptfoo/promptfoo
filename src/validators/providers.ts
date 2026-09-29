import { z } from 'zod';
import { InputsSchema } from '../redteam/types';
import { ProviderEnvOverridesSchema } from '../types/env';
import { StringOrFunctionSchema } from './shared';

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
  transform: StringOrFunctionSchema.optional(),
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
  transform: StringOrFunctionSchema.optional(),
  delay: z.number().optional(),
  config: z.any().optional(),
  inputs: InputsSchema.optional(),
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
