import type winston from 'winston';
import type { Prompt } from './prompts';
import type { NunjucksFilterMap, TokenUsage } from './shared';

export type ProviderId = string;
export type ProviderLabel = string;
export type ProviderFunction = ApiProvider['callApi'];
export type ProviderOptionsMap = Record<ProviderId, ProviderOptions>;

export type ProviderType = 'embedding' | 'classification' | 'text' | 'moderation';

export type ProviderTypeMap = Partial<Record<ProviderType, string | ProviderOptions | ApiProvider>>;

export interface ProviderModerationResponse {
  error?: string;
  flags?: ModerationFlag[];
}

export interface ModerationFlag {
  code: string;
  description: string;
  confidence: number;
}

export interface ProviderOptions {
  id?: ProviderId;
  label?: ProviderLabel;
  config?: any;
  prompts?: string[];
  transform?: string;
  delay?: number;
  env?: EnvOverrides;
}

export interface CallApiContextParams {
  fetchWithCache?: any;
  filters?: NunjucksFilterMap;
  getCache?: any;
  logger?: winston.Logger;
  originalProvider?: ApiProvider;
  prompt: Prompt;
  vars: Record<string, string | object>;
}

export interface CallApiOptionsParams {
  includeLogProbs?: boolean;
}

export interface ApiProvider {
  id: () => string;
  callApi: CallApiFunction;
  callEmbeddingApi?: (input: string) => Promise<ProviderEmbeddingResponse>;
  callClassificationApi?: (prompt: string) => Promise<ProviderClassificationResponse>;
  label?: ProviderLabel;
  transform?: string;
  delay?: number;
  config?: any;
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

export interface ProviderResponse {
  cached?: boolean;
  cost?: number;
  error?: string;
  logProbs?: number[];
  metadata?: {
    redteamFinalPrompt?: string;
    [key: string]: any;
  };
  output?: string | any;
  tokenUsage?: TokenUsage;
}

export interface ProviderEmbeddingResponse {
  cost?: number;
  error?: string;
  embedding?: number[];
  tokenUsage?: Partial<TokenUsage>;
}

export interface ProviderSimilarityResponse {
  error?: string;
  similarity?: number;
  tokenUsage?: Partial<TokenUsage>;
}

export interface ProviderClassificationResponse {
  error?: string;
  classification?: Record<string, number>;
}

export type EnvOverrides = {
  AI21_API_BASE_URL?: string;
  AI21_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  AWS_BEDROCK_REGION?: string;
  AZURE_OPENAI_API_BASE_URL?: string;
  AZURE_OPENAI_API_HOST?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_BASE_URL?: string;
  BAM_API_HOST?: string;
  BAM_API_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_KEY?: string;
  COHERE_API_KEY?: string;
  FAL_KEY?: string;
  GOOGLE_API_HOST?: string;
  GOOGLE_API_KEY?: string;
  GROQ_API_KEY?: string;
  LOCALAI_BASE_URL?: string;
  MISTRAL_API_BASE_URL?: string;
  MISTRAL_API_HOST?: string;
  MISTRAL_API_KEY?: string;
  OPENAI_API_BASE_URL?: string;
  OPENAI_API_HOST?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_ORGANIZATION?: string;
  PALM_API_HOST?: string;
  PALM_API_KEY?: string;
  REPLICATE_API_KEY?: string;
  REPLICATE_API_TOKEN?: string;
  VERTEX_API_HOST?: string;
  VERTEX_API_KEY?: string;
  VERTEX_PROJECT_ID?: string;
  VERTEX_PUBLISHER?: string;
  VERTEX_REGION?: string;
};

export type FilePath = string;

export type CallApiFunction = {
  (
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse>;
  label?: string;
};

export function isApiProvider(provider: any): provider is ApiProvider {
  return (
    typeof provider === 'object' &&
    provider != null &&
    'id' in provider &&
    typeof provider.id === 'function'
  );
}

export function isProviderOptions(provider: any): provider is ProviderOptions {
  return (
    typeof provider === 'object' &&
    provider != null &&
    'id' in provider &&
    typeof provider.id === 'string'
  );
}
