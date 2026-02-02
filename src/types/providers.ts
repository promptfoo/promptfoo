import type winston from 'winston';

import type { BlobRef } from '../blobs/types';
import type { EnvOverrides } from './env';
import type { Prompt } from './prompts';
import type { Inputs, NunjucksFilterMap, TokenUsage, VarValue } from './shared';

export type { TokenUsage } from './shared';
export type ProviderId = string;
export type ProviderLabel = string;
export type ProviderFunction = ApiProvider['callApi'];
export type ProviderOptionsMap = Record<ProviderId, ProviderOptions>;

export type ProviderType = 'embedding' | 'classification' | 'text' | 'moderation';

/**
 * Chat message type for provider-reported prompts and other multi-turn interactions.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'function';
  content: string;
}

export type ProviderTypeMap = Partial<Record<ProviderType, string | ProviderOptions | ApiProvider>>;

// Local interface to avoid circular dependency with src/types/index.ts
interface AtomicTestCase {
  description?: string;
  vars?: Record<string, VarValue>;
  providerResponse?: ProviderResponse;
  tokenUsage?: TokenUsage;
  success?: boolean;
  score?: number;
  failureReason?: string;
  metadata?: Record<string, any>;
  options?: Record<string, any>;
}
export interface ProviderModerationResponse {
  cached?: boolean;
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
  inputs?: Inputs;
}

export interface CallApiContextParams {
  filters?: NunjucksFilterMap;
  getCache?: any;
  logger?: winston.Logger;
  originalProvider?: ApiProvider;
  prompt: Prompt;
  vars: Record<string, VarValue>;
  debug?: boolean;
  // This was added so we have access to the grader inside the provider.
  // Vars and prompts should be access using the arguments above.
  test?: AtomicTestCase;
  bustCache?: boolean;

  // W3C Trace Context headers
  traceparent?: string; // Format: version-trace-id-parent-id-trace-flags
  tracestate?: string; // Optional vendor-specific trace state

  // Evaluation metadata (for manual correlation if needed)
  evaluationId?: string;
  testCaseId?: string;
  /**
   * Index of the test case within the current evaluation (row in results table).
   * Used for correlating blob references and other per-result metadata.
   */
  testIdx?: number;
  /**
   * Index of the prompt within the current evaluation (column in results table).
   * Used for correlating blob references and other per-result metadata.
   */
  promptIdx?: number;
  repeatIndex?: number;
  /**
   * Iteration/turn number (1-indexed) for multi-turn evaluations.
   * Used in red-team strategies to track conversation turns.
   */
  iteration?: number;
}

export interface CallApiOptionsParams {
  includeLogProbs?: boolean;
  /**
   * Signal that can be used to abort the request
   */
  abortSignal?: AbortSignal;
}

export interface ApiProvider {
  id: () => string;
  callApi: CallApiFunction;
  callClassificationApi?: (prompt: string) => Promise<ProviderClassificationResponse>;
  callEmbeddingApi?: (input: string) => Promise<ProviderEmbeddingResponse>;
  config?: any;
  delay?: number;
  getSessionId?: () => string;
  inputs?: Inputs;
  label?: ProviderLabel;
  transform?: string;
  toJSON?: () => any;
  /**
   * Cleanup method called when a provider call is aborted (e.g., due to timeout)
   * Providers should implement this to clean up any resources they might have
   * allocated, such as file handles, network connections, etc.
   */
  cleanup?: () => void | Promise<void>;
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
  reason?: string;
}

export interface ProviderResponse {
  cached?: boolean;
  cost?: number;
  error?: string;
  /**
   * Indicates that `output` contains base64-encoded binary data (often as JSON like OpenAI `b64_json`).
   * Used to enable blob externalization and avoid token bloat in downstream grading/agentic strategies.
   */
  isBase64?: boolean;
  /**
   * Optional format hint for `output` (e.g. `'json'` when `output` is a JSON string).
   */
  format?: string;
  logProbs?: number[];
  latencyMs?: number;
  metadata?: {
    redteamFinalPrompt?: string;
    http?: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      requestHeaders?: Record<string, string>;
    };
    [key: string]: any;
  };
  /**
   * The actual prompt sent to the LLM. If set by a provider, this overrides
   * the rendered prompt for display and assertions.
   *
   * Useful for providers that dynamically generate or modify prompts
   * (e.g., GenAIScript, multi-turn strategies, agent frameworks).
   *
   * Can be a simple string or an array of chat messages.
   */
  prompt?: string | ChatMessage[];
  raw?: string | any;
  output?: string | any;
  /**
   * Output after provider-level transform. Used by contextTransform to ensure
   * it operates on provider-normalized output, independent of test transforms.
   */
  providerTransformedOutput?: string | any;
  tokenUsage?: TokenUsage;
  isRefusal?: boolean;
  sessionId?: string;
  guardrails?: GuardrailResponse;
  finishReason?: string;
  audio?: {
    id?: string;
    expiresAt?: number;
    data?: string; // base64 encoded audio data
    blobRef?: BlobRef;
    transcript?: string;
    format?: string;
    sampleRate?: number;
    channels?: number;
    duration?: number;
  };
  video?: {
    id?: string; // Provider video ID (e.g., Sora job ID, Veo operation name)
    blobRef?: BlobRef; // Blob storage reference for video data (Veo)
    storageRef?: { key?: string }; // Storage reference for video file (Sora)
    url?: string; // Storage ref URL (e.g., storageRef:video/abc123.mp4) or blob URI
    format?: string; // 'mp4'
    size?: string; // '1280x720' or '720x1280'
    duration?: number; // Seconds
    thumbnail?: string; // Storage ref URL for thumbnail (Sora)
    spritesheet?: string; // Storage ref URL for spritesheet (Sora)
    model?: string; // Model used (e.g., 'sora-2', 'veo-3.1-generate-preview')
    aspectRatio?: string; // '16:9' or '9:16' (Veo)
    resolution?: string; // '720p' or '1080p' (Veo)
  };
}

export interface ProviderEmbeddingResponse {
  cached?: boolean;
  cost?: number;
  error?: string;
  embedding?: number[];
  latencyMs?: number;
  tokenUsage?: Partial<TokenUsage>;
  metadata?: {
    transformed?: boolean;
    originalText?: string;
    [key: string]: any;
  };
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
    message?: string;
    error?: string;
    changes_needed?: boolean;
    changes_needed_reason?: string;
    changes_needed_suggestions?: string[];
  };
  providerResponse: ProviderResponse;
  unalignedProviderResult?: ProviderResponse;
  redteamProviderResult?: ProviderResponse;
  transformedRequest?: any;
}

/**
 * Interface defining the default providers used by the application
 */
export interface DefaultProviders {
  embeddingProvider: ApiProvider;
  gradingJsonProvider: ApiProvider;
  gradingProvider: ApiProvider;
  llmRubricProvider?: ApiProvider;
  moderationProvider: ApiProvider;
  suggestionsProvider: ApiProvider;
  synthesizeProvider: ApiProvider;
  webSearchProvider?: ApiProvider;
}
