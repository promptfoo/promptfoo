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

// Local interface to avoid circular dependency with src/types/index.ts
interface AtomicTestCase {
  description?: string;
  vars?: Record<string, string | object>;
  providerResponse?: ProviderResponse;
  tokenUsage?: TokenUsage;
  success?: boolean;
  score?: number;
  failureReason?: string;
}

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
  // This was added so we have access to the grader inside the provider.
  // Vars and prompts should be access using the arguments above.
  test?: AtomicTestCase;
}

export interface CallApiOptionsParams {
  includeLogProbs?: boolean;
}

export interface ApiProvider {
  id: () => string;
  callApi: CallApiFunction;
  callClassificationApi?: (prompt: string) => Promise<ProviderClassificationResponse>;
  callEmbeddingApi?: (input: string) => Promise<ProviderEmbeddingResponse>;
  config?: any;
  delay?: number;
  getSessionId?: () => string;
  label?: ProviderLabel;
  transform?: string;
  toJSON?: () => any;
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

export interface GuardrailResponse {
  flaggedInput?: boolean;
  flaggedOutput?: boolean;
  flagged?: boolean;
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
  guardrails?: GuardrailResponse;
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

export interface ProviderTestResponse {
  testResult: {
    error?: string;
    changes_needed?: boolean;
    changes_needed_reason?: string;
    changes_needed_suggestions?: string[];
  };
  providerResponse: ProviderResponse;
  unalignedProviderResult?: ProviderResponse;
  redteamProviderResult?: ProviderResponse;
}
