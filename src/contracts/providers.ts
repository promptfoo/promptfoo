import type { BlobRef } from './blobs.js';
import type { TokenUsage, VarValue } from './shared.js';

/**
 * Chat message type for provider-reported prompts and other multi-turn interactions.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'function';
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
  tokenUsage?: TokenUsage;
}

export interface GuardrailResponse {
  flaggedInput?: boolean;
  flaggedOutput?: boolean;
  flagged?: boolean;
  reason?: string;
}

export interface ImageOutput {
  data?: string; // data URI or base64
  blobRef?: BlobRef;
  mimeType?: string;
}

export interface ProviderResponse {
  cached?: boolean;
  cost?: number;
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
  logProbs?: number[];
  latencyMs?: number;
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
  raw?: string | any;
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
  tokenUsage?: TokenUsage;
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
