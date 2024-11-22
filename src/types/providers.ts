import type winston from 'winston';
import type { EnvOverrides } from './env';
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
  debug?: boolean;
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
  getSessionId?: () => string;
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
  raw?: string | any;
  output?: string | any;
  tokenUsage?: TokenUsage;
  isRefusal?: boolean;
  sessionId?: string;
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
