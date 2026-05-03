import type winston from 'winston';

import type { BlobRef } from '../blobs/types';
import type { EnvOverrides } from './env';
import type { Prompt } from './prompts';
import type { Inputs, NunjucksFilterMap, TokenUsage, VarValue } from './shared';
import type { TransformFunction } from './transform';

export type { TokenUsage } from './shared';
export type ProviderId = string;
export type ProviderLabel = string;
/**
 * Function form accepted anywhere the Node.js API accepts a provider.
 *
 * @public
 */
export type ProviderFunction = CallApiFunction;
export type ProviderOptionsMap = Record<ProviderId, ProviderOptions>;
export type ProviderConfig =
  | ProviderId
  | ProviderFunction
  | ApiProvider
  | ProviderOptions
  | ProviderOptionsMap;
/**
 * Provider input accepted by `evaluate()` and `loadApiProviders()`.
 *
 * Pass one provider id, provider function, provider object, or an array that
 * mixes the supported provider config forms.
 *
 * @public
 */
export type ProvidersConfig = ProviderId | ProviderFunction | ApiProvider | ProviderConfig[];

export type ProviderType = 'embedding' | 'classification' | 'text' | 'moderation';

/**
 * Chat message type for provider-reported prompts and other multi-turn interactions.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'function';
  content: string;
}

export interface SkillCallEntry {
  name: string;
  input?: unknown;
  path?: string;
  source?: 'heuristic' | 'tool';
  is_error?: boolean;
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

/**
 * Declarative provider configuration accepted by provider-loading APIs.
 *
 * @public
 */
export interface ProviderOptions {
  /** Provider id to instantiate, such as `openai:chat:gpt-5.5`. */
  id?: ProviderId;
  /** Human-readable label used in reports and provider maps. */
  label?: ProviderLabel;
  /** Provider-specific configuration passed to the provider factory. */
  config?: any;
  /** Restrict this provider to named prompts. */
  prompts?: string[];
  /** Transform provider output before assertions run. */
  transform?: string | TransformFunction;
  /** Delay in milliseconds before provider calls. */
  delay?: number;
  /** Environment overrides available while loading and calling the provider. */
  env?: EnvOverrides;
  /** Declared named inputs accepted by the provider. */
  inputs?: Inputs;
}

/**
 * Runtime context passed to custom provider functions.
 *
 * @public
 */
export interface CallApiContextParams {
  /** Nunjucks filters available while rendering related prompt content. */
  filters?: NunjucksFilterMap;
  /** Accessor for the active cache instance. */
  getCache?: any;
  /** Logger configured for the current eval. */
  logger?: winston.Logger;
  /** Original provider when this call is being graded or wrapped. */
  originalProvider?: ApiProvider;
  /** Prompt object for the current provider call. */
  prompt: Prompt;
  /** Rendered variables for the current test case. */
  vars: Record<string, VarValue>;
  /** Whether the caller requested debug behavior. */
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
}

/**
 * Per-request options passed to custom providers.
 *
 * @public
 */
export interface CallApiOptionsParams {
  /** Whether the caller requested token log probabilities when supported. */
  includeLogProbs?: boolean;
  /**
   * Signal that can be used to abort the request
   */
  abortSignal?: AbortSignal;
}

/**
 * Provider object shape accepted by the Node.js API.
 *
 * @public
 */
export interface ApiProvider {
  /** Stable id used in result tables, cache keys, and provider lookups. */
  id: () => string;
  /** Execute one provider request. */
  callApi: CallApiFunction;
  /** Optional classification-specific entrypoint for compatible providers. */
  callClassificationApi?: (prompt: string) => Promise<ProviderClassificationResponse>;
  /** Optional embedding-specific entrypoint for compatible providers. */
  callEmbeddingApi?: (input: string) => Promise<ProviderEmbeddingResponse>;
  /** Provider-specific configuration retained for later calls and serialization. */
  config?: any;
  /** Delay in milliseconds before provider calls. */
  delay?: number;
  /** Optional stable session id for conversational providers. */
  getSessionId?: () => string;
  /** Named provider inputs used by multi-input targets. */
  inputs?: Inputs;
  /** Human-readable label shown in reports. */
  label?: ProviderLabel;
  /** Transform provider output before assertions run. */
  transform?: string | TransformFunction;
  /** Custom JSON serialization hook for persisted eval records. */
  toJSON?: () => any;
  /**
   * Provider-wide cleanup hook for releasing long-lived resources such as worker
   * processes, browser sessions, or pooled connections at eval shutdown.
   * Request-scoped cancellation should be implemented with `abortSignal`.
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

/**
 * Response shape returned by custom providers.
 *
 * @public
 */
export interface ProviderResponse {
  /** Whether the response came from cache. */
  cached?: boolean;
  /** Estimated request cost when the provider can report it. */
  cost?: number;
  /** Error message when the provider call failed without throwing. */
  error?: string;
  /**
   * Indicates that a remote Promptfoo server already materialized multi-input vars
   * for this response. When true, callers must not re-materialize locally.
   */
  materializationHandled?: boolean;
  /**
   * Materialized per-input vars returned by a remote Promptfoo server.
   */
  materializedVars?: Record<string, string>;
  /**
   * Indicates that `output` contains base64-encoded binary data (often as JSON like OpenAI `b64_json`).
   * Used to enable blob externalization and avoid token bloat in downstream grading/agentic strategies.
   */
  isBase64?: boolean;
  /**
   * Optional format hint for `output` (e.g. `'json'` when `output` is a JSON string).
   */
  format?: string;
  /** Token-level log probabilities when exposed by the provider. */
  logProbs?: number[];
  /** End-to-end provider latency in milliseconds. */
  latencyMs?: number;
  /** Additional provider-specific metadata preserved on the result row. */
  metadata?: {
    redteamFinalPrompt?: string;
    http?: {
      status: number;
      statusText: string;
      headers?: Record<string, string>;
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
  /** Raw provider payload retained for advanced consumers. */
  raw?: string | any;
  /** Main provider output consumed by assertions and result rendering. */
  output?: string | any;
  /**
   * Input materialization metadata returned by a remote Promptfoo server.
   */
  inputMaterialization?: Record<string, unknown>;
  /**
   * Output after provider-level transform. Used by contextTransform to ensure
   * it operates on provider-normalized output, independent of test transforms.
   */
  providerTransformedOutput?: string | any;
  /** Provider-reported token usage. */
  tokenUsage?: TokenUsage;
  /** Whether the provider identified the output as a refusal. */
  isRefusal?: boolean;
  /**
   * Indicates the target intentionally ended the active conversation/session.
   * Multi-turn redteam strategies can use this to stop probing gracefully.
   */
  conversationEnded?: boolean;
  /**
   * Optional machine-readable reason explaining why the conversation ended.
   * Example: `thread_closed`.
   */
  conversationEndReason?: string;
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
    size?: string; // '1280x720', '720x1280', '1792x1024', or '1024x1792'
    duration?: number; // Seconds
    thumbnail?: string; // Storage ref URL for thumbnail (Sora)
    spritesheet?: string; // Storage ref URL for spritesheet (Sora)
    model?: string; // Model used (e.g., 'sora-2', 'veo-3.1-generate-preview')
    aspectRatio?: string; // '16:9' or '9:16' (Veo)
    resolution?: string; // '720p' or '1080p' (Veo)
  };
  images?: ImageOutput[];
}

export interface ImageOutput {
  data?: string; // data URI or base64
  blobRef?: BlobRef;
  mimeType?: string;
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

/**
 * Function signature used by custom providers.
 *
 * Return a `ProviderResponse` with at least `output` or `error`. The optional
 * `context` argument exposes the rendered prompt, variables, logger, and eval
 * metadata for the current call. Use `options.abortSignal` for request-scoped
 * cancellation when your provider supports it.
 *
 * @example
 * ```ts
 * const echoProvider: CallApiFunction = async (prompt, context) => ({
 *   output: `Echo: ${prompt}`,
 *   metadata: { user: context?.vars.user },
 * });
 * ```
 *
 * @public
 */
export interface CallApiFunction {
  (
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse>;
  label?: string;
}

export function isApiProvider(provider: any): provider is ApiProvider {
  return (
    typeof provider === 'object' &&
    provider != null &&
    'id' in provider &&
    typeof provider.id === 'function' &&
    'callApi' in provider &&
    typeof provider.callApi === 'function'
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
