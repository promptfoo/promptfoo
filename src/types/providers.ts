import type winston from 'winston';

import type { BlobRef } from '../blobs/types';
import type { MinimalApiProvider } from '../contracts/prompts';
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
 * Use a function when the provider is easiest to express inline. Use an
 * `ApiProvider` object instead when you need additional capabilities such as
 * embeddings, similarity, or classification methods.
 *
 * @example
 * ```ts
 * const provider: ProviderFunction = async (prompt) => ({
 *   output: `Echo: ${prompt}`,
 * });
 * ```
 *
 * @public
 */
export type ProviderFunction = CallApiFunction;
export type ProviderOptionsMap = Record<ProviderId, ProviderOptions>;
/**
 * Provider override accepted anywhere a single provider configuration is allowed.
 *
 * Use a string for a built-in provider id, a function for a small custom
 * provider, or an object when you need labels, env overrides, transforms, or
 * other provider options.
 *
 * @example
 * ```ts
 * const provider: ProviderConfig = {
 *   id: 'openai:chat:gpt-5.5',
 *   label: 'primary',
 * };
 * ```
 *
 * @public
 */
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
 * @example
 * ```ts
 * const providers: ProvidersConfig = [
 *   'openai:chat:gpt-5.5',
 *   async (prompt) => ({ output: `Echo: ${prompt}` }),
 * ];
 * ```
 *
 * @public
 */
export type ProvidersConfig = ProviderId | ProviderFunction | ApiProvider | ProviderConfig[];

export type ProviderType = 'embedding' | 'classification' | 'text' | 'moderation';

/**
 * Chat message reported by providers for multi-turn prompts and transcripts.
 *
 * Providers use this lightweight shape when they need to preserve the exact
 * conversation that was sent to or returned from a chat-capable model.
 *
 * @example
 * ```ts
 * const message: ChatMessage = {
 *   role: 'user',
 *   content: 'Summarize this article.',
 * };
 * ```
 *
 * @public
 */
export interface ChatMessage {
  /** Speaker role for the message. */
  role: 'system' | 'user' | 'assistant' | 'tool' | 'function';
  /** Text content sent or received for the turn. */
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

// Local interface to avoid circular dependency with src/types/index.ts.
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
 * @example
 * ```ts
 * const provider: ProviderOptions = {
 *   id: 'openai:chat:gpt-5.5',
 *   label: 'candidate',
 *   config: { temperature: 0.2 },
 *   inputs: {
 *     resume: {
 *       description: 'Resume PDF to summarize',
 *       type: 'pdf',
 *     },
 *   },
 * };
 * ```
 *
 * @public
 */
export interface ProviderOptions {
  /** Provider id to instantiate, such as `openai:chat:gpt-5.5`. */
  id?: ProviderId;
  /** Human-readable label used in reports and provider maps. */
  label?: ProviderLabel;
  /**
   * Provider-specific configuration passed to the provider factory. Each
   * built-in provider documents its own config shape; for custom providers
   * this is whatever the provider implementation expects. Typed as `any`
   * because the resolved shape is provider-specific and is narrowed inside
   * the provider implementation.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: any;
  /** Restrict this provider to named prompts. */
  prompts?: string[];
  /** Transform provider output before assertions run. */
  transform?: string | TransformFunction;
  /** Delay in milliseconds before provider calls. */
  delay?: number;
  /** Environment overrides available while loading and calling the provider. */
  env?: EnvOverrides;
  /**
   * Declared named inputs accepted by the provider.
   *
   * Each key is the variable name. Use a short description string for simple
   * text inputs, or an object when the input needs a declared media type or
   * generation guidance.
   */
  inputs?: Inputs;
}

/**
 * Runtime context passed to custom provider functions.
 *
 * @example
 * ```ts
 * const provider: ProviderFunction = async (prompt, context) => ({
 *   output: `${context?.vars.user}: ${prompt}`,
 *   metadata: { evaluationId: context?.evaluationId },
 * });
 * ```
 *
 * @public
 */
export interface CallApiContextParams {
  /** Nunjucks filters available while rendering related prompt content. */
  filters?: NunjucksFilterMap;
  /**
   * Accessor for the active cache instance. Treat the return value as opaque
   * and prefer the documented `cache.*` helpers from the package over calling
   * it directly.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getCache?: () => any;
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
  /** Test case currently being executed, when available to the caller. */
  test?: AtomicTestCase;
  /** Whether this call should bypass reusable response cache entries. */
  bustCache?: boolean;

  /** W3C Trace Context `traceparent` header for downstream propagation. */
  traceparent?: string;
  /** W3C Trace Context `tracestate` header for downstream propagation. */
  tracestate?: string;

  /** Eval identifier for manual correlation across provider calls. */
  evaluationId?: string;
  /** Stable id for the current test case when one has been assigned. */
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
  /** Zero-based repeat index when the same test case is executed repeatedly. */
  repeatIndex?: number;
}

/**
 * Per-request options passed to custom providers.
 *
 * These are execution controls for one call, not provider configuration. Read
 * them inside `callApi()` when the transport can honor cancellation or optional
 * log-prob requests.
 *
 * @example
 * ```ts
 * const provider: ProviderFunction = async (prompt, _context, options) => {
 *   const response = await fetch('https://example.com/llm', {
 *     method: 'POST',
 *     body: prompt,
 *     signal: options?.abortSignal,
 *   });
 *   return { output: await response.text() };
 * };
 * ```
 *
 * @public
 */
export interface CallApiOptionsParams {
  /** Whether the caller requested token log probabilities when supported. */
  includeLogProbs?: boolean;
  /** Signal that can be used to abort the request. */
  abortSignal?: AbortSignal;
}

/**
 * Provider object shape accepted by the Node.js API.
 *
 * Start with `ProviderFunction` for a simple text-only integration. Implement
 * `ApiProvider` when the provider needs a stable id, lifecycle hooks, or extra
 * methods for embeddings, similarity, classification, or moderation.
 *
 * @example
 * ```ts
 * const provider: ApiProvider = {
 *   id: () => 'custom:echo',
 *   label: 'echo',
 *   callApi: async (prompt) => ({ output: `Echo: ${prompt}` }),
 * };
 * ```
 *
 * @public
 */
export interface ApiProvider extends MinimalApiProvider {
  /** Execute one provider request. */
  callApi: CallApiFunction;
  /**
   * Optional classification-specific entrypoint for compatible providers.
   *
   * @param prompt - Text to classify.
   * @returns Class labels mapped to provider-reported scores.
   */
  callClassificationApi?(prompt: string): Promise<ProviderClassificationResponse>;
  /**
   * Optional embedding-specific entrypoint for compatible providers.
   *
   * @param input - Text to embed.
   * @returns Embedding vector plus any provider-reported metadata.
   */
  callEmbeddingApi?(input: string): Promise<ProviderEmbeddingResponse>;
  /**
   * Provider-specific configuration retained for later calls and serialization.
   * The shape mirrors {@link ProviderOptions.config}; consult the documentation
   * for the specific provider for the supported keys.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: any;
  /** Delay in milliseconds before provider calls. */
  delay?: number;
  /** Optional stable session id for conversational providers. */
  getSessionId?: () => string;
  /**
   * Named provider inputs used by multi-input targets.
   *
   * Each key is the variable name. Use a short description string for simple
   * text inputs, or an object when the input needs a declared media type or
   * generation guidance.
   */
  inputs?: Inputs;
  /** Human-readable label shown in reports. */
  label?: ProviderLabel;
  /** Transform provider output before assertions run. */
  transform?: string | TransformFunction;
  /**
   * Custom JSON serialization hook used when persisting the provider on an eval
   * record. Implementations should return a value that is structurally
   * serializable (no functions or circular references).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/**
 * Guardrail outcome metadata returned by moderation-aware providers.
 *
 * @example
 * ```ts
 * const guardrails: GuardrailResponse = {
 *   flaggedInput: false,
 *   flaggedOutput: true,
 *   reason: 'Detected disallowed content',
 * };
 * ```
 *
 * @public
 */
export interface GuardrailResponse {
  /** Whether the input prompt tripped a guardrail. */
  flaggedInput?: boolean;
  /** Whether the provider output tripped a guardrail. */
  flaggedOutput?: boolean;
  /** Aggregate flag when the provider does not distinguish input from output. */
  flagged?: boolean;
  /** Provider-supplied reason for the guardrail outcome. */
  reason?: string;
}

/**
 * Audio attachment returned by providers that produce or transform sound.
 *
 * Populate `data` for inline payloads or `blobRef` when the audio has already
 * been externalized out of the result row.
 *
 * @example
 * ```ts
 * const audio: AudioOutput = {
 *   data: 'UklGR...',
 *   format: 'wav',
 *   sampleRate: 24000,
 *   channels: 1,
 * };
 * ```
 *
 * @public
 */
export interface AudioOutput {
  /** Provider-defined audio identifier. */
  id?: string;
  /** Expiration time for provider-hosted audio, as a Unix timestamp. */
  expiresAt?: number;
  /** Base64-encoded audio payload when data is embedded inline. */
  data?: string;
  /** External blob reference when audio is stored outside the result row. */
  blobRef?: BlobRef;
  /** Transcript associated with the audio payload, when available. */
  transcript?: string;
  /** Container or codec name such as `wav` or `mp3`. */
  format?: string;
  /** Audio sample rate in hertz. */
  sampleRate?: number;
  /** Number of audio channels. */
  channels?: number;
  /** Audio duration in seconds. */
  duration?: number;
}

/**
 * Video attachment returned by providers that produce video.
 *
 * Providers usually return a retrievable `url`, `storageRef`, or `blobRef`;
 * the remaining fields describe playback and generated-media metadata.
 *
 * @example
 * ```ts
 * const video: VideoOutput = {
 *   url: 'https://cdn.example.com/video.mp4',
 *   format: 'mp4',
 *   duration: 6,
 *   aspectRatio: '16:9',
 * };
 * ```
 *
 * @public
 */
export interface VideoOutput {
  /** Provider video id, such as a job or operation identifier. */
  id?: string;
  /** External blob reference for video data. */
  blobRef?: BlobRef;
  /** Storage reference used by providers that persist generated media. */
  storageRef?: {
    /** Provider-defined storage key for the generated video. */
    key?: string;
  };
  /** URL or storage URI for the generated video. */
  url?: string;
  /** Container or codec name such as `mp4`. */
  format?: string;
  /** Provider-reported output dimensions, for example `1280x720`. */
  size?: string;
  /** Video duration in seconds. */
  duration?: number;
  /** URL or storage URI for a representative thumbnail. */
  thumbnail?: string;
  /** URL or storage URI for a provider-generated spritesheet. */
  spritesheet?: string;
  /** Model that produced the video. */
  model?: string;
  /** Aspect ratio such as `16:9`. */
  aspectRatio?: string;
  /** Resolution tier such as `720p` or `1080p`. */
  resolution?: string;
}

/**
 * Image attachment returned by providers that produce images.
 *
 * Populate either `data` for inline payloads or `blobRef` when the image has
 * already been externalized out of the result row.
 *
 * @example
 * ```ts
 * const image: ImageOutput = {
 *   data: 'data:image/png;base64,...',
 *   mimeType: 'image/png',
 * };
 * ```
 *
 * @public
 */
export interface ImageOutput {
  /** Inline data URI or base64 payload. */
  data?: string;
  /** External blob reference when image data is stored outside the result row. */
  blobRef?: BlobRef;
  /** MIME type such as `image/png`. */
  mimeType?: string;
}

/**
 * Response shape returned by custom providers.
 *
 * Return `output` for a successful call or `error` when the provider handled a
 * failure without throwing. Use attachments and metadata only when the provider
 * can supply them; most text providers only need `output`.
 *
 * @example
 * ```ts
 * const response: ProviderResponse = {
 *   output: 'Hello Ada',
 *   tokenUsage: { total: 3, prompt: 1, completion: 2 },
 *   metadata: { model: 'custom-echo-v1' },
 * };
 * ```
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
  /**
   * Additional provider-specific metadata preserved on the result row. The
   * named keys below are recognized by built-in features; providers can add
   * arbitrary additional keys.
   */
  metadata?: {
    /** Final prompt sent by some red team flows after mutation or wrapping. */
    redteamFinalPrompt?: string;
    /** HTTP transport details retained by HTTP-based providers. */
    http?: {
      /** Response status code returned by the upstream HTTP service. */
      status: number;
      /** Response status text returned by the upstream HTTP service. */
      statusText: string;
      /** Response headers returned by the upstream HTTP service. */
      headers?: Record<string, string>;
      /** Request headers sent to the upstream HTTP service. */
      requestHeaders?: Record<string, string>;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw?: string | any;
  /**
   * Main provider output consumed by assertions and result rendering. Most
   * providers return a string; complex providers may return a JSON object.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output?: string | any;
  /**
   * Input materialization metadata returned by a remote Promptfoo server.
   */
  inputMaterialization?: Record<string, unknown>;
  /**
   * Output after provider-level transform. Used by contextTransform to ensure
   * it operates on provider-normalized output, independent of test transforms.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  /** Stable conversation or thread id returned by session-aware providers. */
  sessionId?: string;
  /** Structured guardrail metadata returned by providers that run moderation checks. */
  guardrails?: GuardrailResponse;
  /** Provider-reported completion stop reason. */
  finishReason?: string;
  /** Audio attachment returned by audio-capable providers. */
  audio?: AudioOutput;
  /** Video attachment returned by video-capable providers. */
  video?: VideoOutput;
  /** Image attachments returned by image-capable providers. */
  images?: ImageOutput[];
}

/**
 * Response returned by embedding-capable providers.
 *
 * This is the payload returned from `callEmbeddingApi()`. Successful responses
 * normally populate `embedding`; providers may return `error` instead when they
 * handle a failure without throwing.
 *
 * @example
 * ```ts
 * const response: ProviderEmbeddingResponse = {
 *   embedding: [0.1, 0.2, 0.3],
 *   tokenUsage: { total: 4 },
 * };
 * ```
 *
 * @public
 */
export interface ProviderEmbeddingResponse {
  /** Whether the embedding response came from cache. */
  cached?: boolean;
  /** Estimated request cost when the provider can report it. */
  cost?: number;
  /** Error message when the embedding call failed without throwing. */
  error?: string;
  /** Embedding vector returned by the provider. */
  embedding?: number[];
  /** End-to-end provider latency in milliseconds. */
  latencyMs?: number;
  /** Token usage attributed to the embedding request. */
  tokenUsage?: Partial<TokenUsage>;
  /** Additional embedding-specific metadata preserved for callers. */
  metadata?: {
    /** Whether a provider-level transform changed the original input text. */
    transformed?: boolean;
    /** Original text before any provider-level transform. */
    originalText?: string;
    [key: string]: any;
  };
}

/**
 * Response returned by similarity-capable providers.
 *
 * This is the payload returned from `callSimilarityApi()` when assertions or
 * custom code ask a provider to compare two strings.
 *
 * @example
 * ```ts
 * const response: ProviderSimilarityResponse = {
 *   similarity: 0.93,
 * };
 * ```
 *
 * @public
 */
export interface ProviderSimilarityResponse {
  /** Error message when the similarity call failed without throwing. */
  error?: string;
  /** Similarity score reported by the provider. */
  similarity?: number;
  /** Token usage attributed to the similarity request. */
  tokenUsage?: Partial<TokenUsage>;
}

/**
 * Response returned by classification-capable providers.
 *
 * This is the payload returned from `callClassificationApi()`. Label names and
 * score ranges are provider-defined, so consumers should not assume a fixed
 * taxonomy unless the provider documents one.
 *
 * @example
 * ```ts
 * const response: ProviderClassificationResponse = {
 *   classification: { positive: 0.91, negative: 0.09 },
 * };
 * ```
 *
 * @public
 */
export interface ProviderClassificationResponse {
  /** Error message when the classification call failed without throwing. */
  error?: string;
  /** Class labels mapped to provider-reported scores. */
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
 * @param prompt - Rendered prompt text for the current provider call.
 * @param context - Runtime metadata for the current eval row, when available.
 * @param options - Per-request execution options such as cancellation.
 *
 * @public
 */
export interface CallApiFunction {
  (
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse>;
  /** Human-readable label used when the provider function is shown in reports. */
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
