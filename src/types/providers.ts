import { z } from 'zod';
import { NunjucksFilterMap, NunjucksFilterMapSchema, Prompt } from './prompts';

export type ProviderId = string;

export type ProviderLabel = string;

export type ProviderFunction = ApiProvider['callApi'];

export type ProviderOptionsMap = Record<ProviderId, ProviderOptions>;

export const ProviderEnvOverridesSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  BAM_API_KEY: z.string().optional(),
  BAM_API_HOST: z.string().optional(),
  AZURE_OPENAI_API_HOST: z.string().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_API_BASE_URL: z.string().optional(),
  AZURE_OPENAI_BASE_URL: z.string().optional(),
  AWS_BEDROCK_REGION: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_API_HOST: z.string().optional(),
  OPENAI_API_BASE_URL: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_ORGANIZATION: z.string().optional(),
  REPLICATE_API_KEY: z.string().optional(),
  REPLICATE_API_TOKEN: z.string().optional(),
  LOCALAI_BASE_URL: z.string().optional(),
  MISTRAL_API_HOST: z.string().optional(),
  MISTRAL_API_BASE_URL: z.string().optional(),
  PALM_API_KEY: z.string().optional(),
  PALM_API_HOST: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_API_HOST: z.string().optional(),
  VERTEX_API_KEY: z.string().optional(),
  VERTEX_API_HOST: z.string().optional(),
  VERTEX_PROJECT_ID: z.string().optional(),
  VERTEX_REGION: z.string().optional(),
  VERTEX_PUBLISHER: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  CLOUDFLARE_API_KEY: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
});

export interface ProviderModerationResponse {
  error?: string;
  flags?: ModerationFlag[];
}

export interface ModerationFlag {
  code: string;
  description: string;
  confidence: number;
}

export const ProviderOptionsSchema = z
  .object({
    id: z.custom<ProviderId>().optional(),
    label: z.custom<ProviderLabel>().optional(),
    config: z.any().optional(),
    // List of prompt display strings
    prompts: z.array(z.string()).optional(),
    transform: z.string().optional(),
    delay: z.number().optional(),
    env: ProviderEnvOverridesSchema.optional(),
  })
  .strict();

export const CallApiContextParamsSchema = z.object({
  fetchWithCache: z.optional(z.any()),
  filters: NunjucksFilterMapSchema.optional(),
  getCache: z.optional(z.any()),
  logger: z.optional(z.any()),
  originalProvider: z.optional(z.any()), // Assuming ApiProvider is not a zod schema, using z.any()
  prompt: z.custom<Prompt>(),
  vars: z.record(z.union([z.string(), z.object({})])),
});

export const CallApiOptionsParamsSchema = z.object({
  includeLogProbs: z.optional(z.boolean()),
});

const CallApiFunctionSchema = z
  .function()
  .args(
    z.string().describe('prompt'),
    CallApiContextParamsSchema.optional(),
    CallApiOptionsParamsSchema.optional(),
  )
  .returns(z.promise(z.custom<ProviderResponse>()))
  .and(z.object({ label: z.string().optional() }));
export const ApiProviderSchema = z.object({
  id: z.function().returns(z.string()),

  callApi: z.custom<CallApiFunction>(),

  callEmbeddingApi: z
    .function()
    .args(z.string())
    .returns(z.promise(z.custom<ProviderEmbeddingResponse>()))
    .optional(),

  callClassificationApi: z
    .function()
    .args(z.string())
    .returns(z.promise(z.custom<ProviderClassificationResponse>()))
    .optional(),

  label: z.custom<ProviderLabel>().optional(),

  transform: z.string().optional(),

  delay: z.number().optional(),
});

export function isApiProvider(provider: any): provider is ApiProvider {
  return typeof provider === 'object' && 'id' in provider && typeof provider.id === 'function';
}

export function isProviderOptions(provider: any): provider is ProviderOptions {
  return !isApiProvider(provider) && typeof provider === 'object';
}

export interface ApiEmbeddingProvider extends ApiProvider {
  callEmbeddingApi: (input: string) => Promise<ProviderEmbeddingResponse>;
}

export interface ApiSimilarityProvider extends ApiProvider {
  callSimilarityApi: (reference: string, input: string) => Promise<ProviderSimilarityResponse>;
}

export interface ApiClassificationProvider extends ApiProvider {
  callClassificationApi: (prompt: string) => Promise<ProviderClassificationResponse>;
}

export interface ApiModerationProvider extends ApiProvider {
  callModerationApi: (prompt: string, response: string) => Promise<ProviderModerationResponse>;
}

const ProviderResponseSchema = z.object({
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
  tokenUsage: TokenUsageSchema.optional(),
});

const ProviderEmbeddingResponseSchema = z.object({
  error: z.string().optional(),
  embedding: z.array(z.number()).optional(),
  tokenUsage: TokenUsageSchema.partial().optional(),
});

const ProviderSimilarityResponseSchema = z.object({
  error: z.string().optional(),
  similarity: z.number().optional(),
  tokenUsage: TokenUsageSchema.partial().optional(),
});

const ProviderClassificationResponseSchema = z.object({
  error: z.string().optional(),
  classification: z.record(z.number()).optional(),
});

export const ProvidersSchema = z.union([
  z.string(),
  CallApiFunctionSchema,
  z.array(
    z.union([
      z.string(),
      z.record(z.string(), ProviderOptionsSchema),
      ProviderOptionsSchema,
      CallApiFunctionSchema,
    ]),
  ),
]);

export type ApiProvider = z.infer<typeof ApiProviderSchema>;
export type CallApiContextParams = z.infer<typeof CallApiContextParamsSchema>;
export type CallApiOptionsParams = z.infer<typeof CallApiOptionsParamsSchema>;
export type EnvOverrides = z.infer<typeof ProviderEnvOverridesSchema>;
export type FilePath = string;
export type ProviderClassificationResponse = z.infer<typeof ProviderClassificationResponseSchema>;
export type ProviderEmbeddingResponse = z.infer<typeof ProviderEmbeddingResponseSchema>;
export type ProviderOptions = z.infer<typeof ProviderOptionsSchema>;
export type ProviderResponse = z.infer<typeof ProviderResponseSchema>;
export type ProviderSimilarityResponse = z.infer<typeof ProviderSimilarityResponseSchema>;

// The z.infer type is not as good as a manually created type
type CallApiFunction = {
  (
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse>;
  label?: string;
};
// Confirm that manually created type is equivalent to z.infer type
function assert<T extends never>() {}
type TypeEqualityGuard<A, B> = Exclude<A, B> | Exclude<B, A>;
assert<TypeEqualityGuard<CallApiFunction, z.infer<typeof CallApiFunctionSchema>>>();
