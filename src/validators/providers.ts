import { z } from 'zod';
import type {
  ApiProvider,
  CallApiFunction,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderId,
  ProviderLabel,
  ProviderOptions,
  ProviderResponse,
  ProviderSimilarityResponse,
} from '../types/providers';
import { PromptSchema } from './prompts';
import { NunjucksFilterMapSchema, TokenUsageSchema } from './shared';

// Note: sync with types/providers.ts
export const ProviderEnvOverridesSchema = z.object({
  AI21_API_BASE_URL: z.string().optional(),
  AI21_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AWS_BEDROCK_REGION: z.string().optional(),
  AZURE_OPENAI_API_BASE_URL: z.string().optional(),
  AZURE_OPENAI_API_HOST: z.string().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_API_BASE_URL: z.string().optional(),
  AZURE_API_HOST: z.string().optional(),
  AZURE_API_KEY: z.string().optional(),
  AZURE_DEPLOYMENT_NAME: z.string().optional(),
  AZURE_EMBEDDING_DEPLOYMENT_NAME: z.string().optional(),
  AZURE_OPENAI_BASE_URL: z.string().optional(),
  AZURE_OPENAI_DEPLOYMENT_NAME: z.string().optional(),
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME: z.string().optional(),
  AZURE_CLIENT_SECRET: z.string().optional(),
  AZURE_CLIENT_ID: z.string().optional(),
  AZURE_TENANT_ID: z.string().optional(),
  AZURE_AUTHORITY_HOST: z.string().optional(),
  AZURE_TOKEN_SCOPE: z.string().optional(),
  BAM_API_HOST: z.string().optional(),
  BAM_API_KEY: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_KEY: z.string().optional(),
  PROMPTFOO_REMOTE_GENERATION_URL: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  FAL_KEY: z.string().optional(),
  GOOGLE_API_HOST: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  LOCALAI_BASE_URL: z.string().optional(),
  MISTRAL_API_BASE_URL: z.string().optional(),
  MISTRAL_API_HOST: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  OPENAI_API_BASE_URL: z.string().optional(),
  OPENAI_API_HOST: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_ORGANIZATION: z.string().optional(),
  PALM_API_HOST: z.string().optional(),
  PALM_API_KEY: z.string().optional(),
  REPLICATE_API_KEY: z.string().optional(),
  REPLICATE_API_TOKEN: z.string().optional(),
  VERTEX_API_HOST: z.string().optional(),
  VERTEX_API_KEY: z.string().optional(),
  VERTEX_PROJECT_ID: z.string().optional(),
  VERTEX_PUBLISHER: z.string().optional(),
  VERTEX_REGION: z.string().optional(),
  WATSONX_AI_APIKEY: z.string().optional(),
  WATSONX_AI_PROJECT_ID: z.string().optional(),
  WATSONX_AI_BEARER_TOKEN: z.string().optional(),
  WATSONX_AI_AUTH_TYPE: z.string().optional(),
  PROMPTFOO_CA_CERT_PATH: z.string().optional(),
  PROMPTFOO_INSECURE_SSL: z.string().optional(),
});

export const ProviderOptionsSchema = z
  .object({
    id: z.custom<ProviderId>().optional(),
    label: z.custom<ProviderLabel>().optional(),
    config: z.any().optional(),
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
  originalProvider: z.optional(z.any()),
  prompt: PromptSchema,
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
  config: z.any().optional(),
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
  tokenUsage: TokenUsageSchema.optional(),
});

export const ProviderEmbeddingResponseSchema = z.object({
  error: z.string().optional(),
  embedding: z.array(z.number()).optional(),
  tokenUsage: TokenUsageSchema.partial().optional(),
});

export const ProviderSimilarityResponseSchema = z.object({
  error: z.string().optional(),
  similarity: z.number().optional(),
  tokenUsage: TokenUsageSchema.partial().optional(),
});

export const ProviderClassificationResponseSchema = z.object({
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

export const ProviderSchema = z.union([z.string(), ProviderOptionsSchema, ApiProviderSchema]);

// Ensure that schemas match their corresponding types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function assert<T extends never>() {}
type TypeEqualityGuard<A, B> = Exclude<A, B> | Exclude<B, A>;

assert<TypeEqualityGuard<CallApiFunction, z.infer<typeof CallApiFunctionSchema>>>();
assert<TypeEqualityGuard<ProviderOptions, z.infer<typeof ProviderOptionsSchema>>>();
assert<TypeEqualityGuard<ProviderResponse, z.infer<typeof ProviderResponseSchema>>>();
assert<
  TypeEqualityGuard<ProviderEmbeddingResponse, z.infer<typeof ProviderEmbeddingResponseSchema>>
>();
assert<
  TypeEqualityGuard<ProviderSimilarityResponse, z.infer<typeof ProviderSimilarityResponseSchema>>
>();
assert<
  TypeEqualityGuard<
    ProviderClassificationResponse,
    z.infer<typeof ProviderClassificationResponseSchema>
  >
>();
assert<TypeEqualityGuard<ApiProvider, z.infer<typeof ApiProviderSchema>>>();
