import type { BlobRef } from './blobs.js';
import type { TokenUsage, VarValue } from './shared.js';

/**
 * Chat message reported by providers for multi-turn prompts and transcripts.
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

export interface ModerationFlag {
  code: string;
  description: string;
  confidence: number;
}

export interface ProviderModerationResponse {
  cached?: boolean;
  error?: string;
  flags?: ModerationFlag[];
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
 * Image attachment returned by providers that produce images.
 *
 * Populate either `data` for inline payloads or `blobRef` when the image has
 * already been externalized out of the result row.
 *
 * @public
 */
export interface ImageOutput {
  /** Inline data URI or base64 payload. */
  data?: string; // data URI or base64
  /** External blob reference when image data is stored outside the result row. */
  blobRef?: BlobRef;
  /** MIME type such as `image/png`. */
  mimeType?: string;
}

/**
 * Audio attachment returned by providers that produce or transform sound.
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
  storageRef?: { key?: string };
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
  /**
   * Main provider output consumed by assertions and result rendering. Most
   * providers return a string; complex providers may return a JSON object.
   */
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

/** Response returned by similarity-capable providers. @public */
export interface ProviderSimilarityResponse {
  /** Error message when the similarity call failed without throwing. */
  error?: string;
  /** Similarity score reported by the provider. */
  similarity?: number;
  /** Token usage attributed to the similarity request. */
  tokenUsage?: Partial<TokenUsage>;
}

/** Response returned by classification-capable providers. @public */
export interface ProviderClassificationResponse {
  /** Error message when the classification call failed without throwing. */
  error?: string;
  /** Class labels mapped to provider-reported scores. */
  classification?: Record<string, number>;
}

export interface FunctionToolCallValidator {
  validateFunctionToolCall(output: string | object, vars?: Record<string, VarValue>): void;
}

export function hasFunctionToolCallValidator(
  provider: unknown,
): provider is FunctionToolCallValidator {
  return (
    typeof provider === 'object' &&
    provider !== null &&
    'validateFunctionToolCall' in provider &&
    typeof provider.validateFunctionToolCall === 'function'
  );
}
