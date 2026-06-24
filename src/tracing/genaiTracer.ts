import {
  type Attributes,
  context,
  propagation,
  ROOT_CONTEXT,
  type Span,
  SpanKind,
  SpanStatusCode,
  type Tracer,
  trace,
} from '@opentelemetry/api';
import { ATTR_ERROR_TYPE, ERROR_TYPE_VALUE_OTHER } from '@opentelemetry/semantic-conventions';
import { getEnvString } from '../envars';
import logger from '../logger';

import type { CallApiContextParams, ProviderResponse } from '../types/index';
import type { TokenUsage } from '../types/shared';

export {
  PROMPTFOO_RESOURCE_ATTR_PARENT_SPAN_ID,
  PROMPTFOO_RESOURCE_ATTR_TRACE_ID,
} from './resourceAttributes';

const TRACER_NAME = 'promptfoo.providers';
const TRACER_VERSION = '1.0.0';

// GenAI Semantic Convention attribute names (OTEL Gen AI spec)
// See: https://github.com/open-telemetry/semantic-conventions-genai/tree/main/docs/gen-ai
export const GenAIAttributes = {
  // System identification (deprecated: use PROVIDER_NAME for spec compliance)
  SYSTEM: 'gen_ai.system',
  /** Required by spec: Gen AI provider identifier */
  PROVIDER_NAME: 'gen_ai.provider.name',
  OPERATION_NAME: 'gen_ai.operation.name',

  // Request attributes
  REQUEST_MODEL: 'gen_ai.request.model',
  REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
  REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
  REQUEST_TOP_P: 'gen_ai.request.top_p',
  REQUEST_TOP_K: 'gen_ai.request.top_k',
  REQUEST_STOP_SEQUENCES: 'gen_ai.request.stop_sequences',
  REQUEST_FREQUENCY_PENALTY: 'gen_ai.request.frequency_penalty',
  REQUEST_PRESENCE_PENALTY: 'gen_ai.request.presence_penalty',
  REQUEST_STREAM: 'gen_ai.request.stream',

  // Response attributes
  CONVERSATION_ID: 'gen_ai.conversation.id',
  RESPONSE_MODEL: 'gen_ai.response.model',
  RESPONSE_ID: 'gen_ai.response.id',
  RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',

  // Usage attributes (official)
  USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',

  // Usage attributes (custom/extended)
  USAGE_TOTAL_TOKENS: 'gen_ai.usage.total_tokens',
  USAGE_CACHED_TOKENS: 'gen_ai.usage.cached_tokens',
  // Legacy Promptfoo spellings retained in default mode for existing dashboards.
  USAGE_REASONING_TOKENS: 'gen_ai.usage.reasoning_tokens',
  USAGE_ACCEPTED_PREDICTION_TOKENS: 'gen_ai.usage.accepted_prediction_tokens',
  USAGE_REJECTED_PREDICTION_TOKENS: 'gen_ai.usage.rejected_prediction_tokens',
  USAGE_CACHE_READ_INPUT_TOKENS: 'gen_ai.usage.cache_read_input_tokens',
  USAGE_CACHE_CREATION_INPUT_TOKENS: 'gen_ai.usage.cache_creation_input_tokens',
  // Latest OpenTelemetry Gen AI semantic convention spellings.
  USAGE_REASONING_OUTPUT_TOKENS: 'gen_ai.usage.reasoning.output_tokens',
  USAGE_CACHE_READ_INPUT_TOKENS_LATEST: 'gen_ai.usage.cache_read.input_tokens',
  USAGE_CACHE_CREATION_INPUT_TOKENS_LATEST: 'gen_ai.usage.cache_creation.input_tokens',
} as const;

/** Current OTEL Gen AI operation names supported by Promptfoo instrumentation. */
export type GenAIOperationName =
  | 'chat'
  | 'text_completion'
  | 'embeddings'
  | 'generate_content'
  | 'invoke_agent';

/** Legacy operation names accepted for backward compatibility */
export type LegacyOperationName = 'completion' | 'embedding';

/** Legacy operation names (pre-spec); used when OTEL_SEMCONV_STABILITY_OPT_IN is not set */
const LEGACY_OPERATION_NAMES: Record<GenAIOperationName, string> = {
  chat: 'chat',
  text_completion: 'completion',
  embeddings: 'embedding',
  generate_content: 'chat',
  invoke_agent: 'chat',
};

/** Map legacy operation names to their canonical spec equivalents */
const LEGACY_TO_CANONICAL: Record<LegacyOperationName, GenAIOperationName> = {
  completion: 'text_completion',
  embedding: 'embeddings',
};

/**
 * Normalize an operation name, mapping legacy values to canonical spec names.
 * e.g. 'completion' -> 'text_completion', 'embedding' -> 'embeddings'
 */
export function normalizeOperationName(
  name: GenAIOperationName | LegacyOperationName,
): GenAIOperationName {
  if (Object.prototype.hasOwnProperty.call(LEGACY_TO_CANONICAL, name)) {
    return LEGACY_TO_CANONICAL[name as LegacyOperationName];
  }
  return name as GenAIOperationName;
}

const GEN_AI_LATEST_OPT_IN = 'gen_ai_latest_experimental';

/**
 * True when OTEL_SEMCONV_STABILITY_OPT_IN includes gen_ai_latest_experimental.
 * When false, we emit only the convention version used before this migration.
 */
export function useGenAILatestExperimental(): boolean {
  const val = getEnvString('OTEL_SEMCONV_STABILITY_OPT_IN');
  if (!val) {
    return false;
  }
  return val
    .split(',')
    .map((s) => s.trim())
    .includes(GEN_AI_LATEST_OPT_IN);
}

/**
 * Operation name to emit on the span (and gen_ai.operation.name).
 * Uses legacy names when opt-in is not set so existing dashboards keep working.
 */
function getEmittedOperationName(operationName: GenAIOperationName, useLatest: boolean): string {
  return useLatest ? operationName : LEGACY_OPERATION_NAMES[operationName];
}

/**
 * Map promptfoo provider/system id to OTEL gen_ai.provider.name.
 * Uses spec well-known values where defined; otherwise returns the system string.
 */
export function getGenAIProviderName(system: string): string {
  // Use segment before ':' for lookup so compound ids (e.g. vertex:palm2) map to same provider
  const baseSystem = system.includes(':') ? system.split(':')[0]! : system;
  const normalized = baseSystem.toLowerCase().replace(/[-.]/g, '_');
  const mapping: Record<string, string> = {
    openai: 'openai',
    anthropic: 'anthropic',
    aws_bedrock: 'aws.bedrock',
    bedrock: 'aws.bedrock',
    azure: 'azure.ai.openai',
    azure_ai_inference: 'azure.ai.inference',
    azure_openai: 'azure.ai.openai',
    vertex: 'gcp.vertex_ai',
    gcp_vertex_ai: 'gcp.vertex_ai',
    google: 'gcp.gen_ai',
    gemini: 'gcp.gemini',
    gcp_gemini: 'gcp.gemini',
    gcp_gen_ai: 'gcp.gen_ai',
    cohere: 'cohere',
    mistral: 'mistral_ai',
    mistral_ai: 'mistral_ai',
    moonshot: 'moonshot_ai',
    moonshot_ai: 'moonshot_ai',
    ollama: 'ollama',
    openrouter: 'openrouter',
    watsonx: 'ibm.watsonx.ai',
    ibm_watsonx: 'ibm.watsonx.ai',
    groq: 'groq',
    deepseek: 'deepseek',
    perplexity: 'perplexity',
    x_ai: 'x_ai',
    xai: 'x_ai',
    replicate: 'replicate',
    huggingface: 'huggingface',
    http: 'http',
  };
  const key = normalized.replace(/\s+/g, '_');
  return mapping[key] ?? baseSystem;
}

/** Build the mutually exclusive legacy/latest provider identity attributes. */
export function getGenAIProviderAttributes(
  system: string,
  providerName?: string,
  useLatest: boolean = useGenAILatestExperimental(),
): Attributes {
  return useLatest
    ? { [GenAIAttributes.PROVIDER_NAME]: getGenAIProviderName(providerName ?? system) }
    : { [GenAIAttributes.SYSTEM]: system };
}

// Promptfoo-specific attributes
export const PromptfooAttributes = {
  PROVIDER_ID: 'promptfoo.provider.id',
  EVAL_ID: 'promptfoo.eval.id',
  TEST_INDEX: 'promptfoo.test.index',
  PROMPT_LABEL: 'promptfoo.prompt.label',
  CACHE_HIT: 'promptfoo.cache_hit',
  REQUEST_BODY: 'promptfoo.request.body',
  RESPONSE_BODY: 'promptfoo.response.body',
} as const;

/** Maximum length for request/response body attributes (characters) */
const MAX_BODY_LENGTH = 4096;

/**
 * Patterns to redact from request/response bodies for security.
 * These patterns match common API key and secret formats.
 */
const SENSITIVE_PATTERNS: Array<{
  pattern: RegExp;
  replacement: string | ((match: string) => string);
}> = [
  // API keys with common prefixes (allow hyphens/underscores for keys like sk-proj-...)
  { pattern: /\b(sk-[a-zA-Z0-9_-]{20,})/g, replacement: '<REDACTED_API_KEY>' },
  { pattern: /\b(pk-[a-zA-Z0-9_-]{20,})/g, replacement: '<REDACTED_API_KEY>' },
  {
    pattern: /\b(api[_-]?key["']?\s*[:=]\s*["']?)([a-zA-Z0-9_-]{16,})/gi,
    replacement: '$1<REDACTED>',
  },
  { pattern: /\b(secret["']?\s*[:=]\s*["']?)([a-zA-Z0-9_-]{16,})/gi, replacement: '$1<REDACTED>' },
  { pattern: /\b(token["']?\s*[:=]\s*["']?)([a-zA-Z0-9_-]{16,})/gi, replacement: '$1<REDACTED>' },
  { pattern: /\b(password["']?\s*[:=]\s*["']?)([^\s"',}{]+)/gi, replacement: '$1<REDACTED>' },
  // Authorization headers
  {
    pattern: /(Authorization["']?\s*[:=]\s*["']?)(Bearer\s+)?([a-zA-Z0-9_.-]{16,})/gi,
    replacement: '$1$2<REDACTED>',
  },
  // AWS credentials
  { pattern: /\b(AKIA[A-Z0-9]{16})/g, replacement: '<REDACTED_AWS_KEY>' },
  {
    pattern: /\b([a-zA-Z0-9/+=]{40})/g,
    replacement: (match) => {
      // Only redact if it looks like a base64-encoded secret (not normal text)
      if (/^[A-Za-z0-9+/=]{40}$/.test(match) && match.includes('/')) {
        return '<REDACTED_SECRET>';
      }
      return match;
    },
  },
  // Generic long alphanumeric strings that look like secrets (64+ chars)
  { pattern: /\b[a-f0-9]{64,}\b/gi, replacement: '<REDACTED_HASH>' },
];

/**
 * Context for creating a GenAI span.
 * Contains all the information needed to properly annotate the span.
 */
export interface GenAISpanContext {
  /** The GenAI system (e.g., 'openai', 'anthropic', 'bedrock') */
  system: string;
  /** Explicit latest-convention provider identity when it differs from the legacy system. */
  providerName?: string;
  /** The operation type (OTEL spec: chat, text_completion, embeddings). Legacy names (completion, embedding) are also accepted and auto-normalized. */
  operationName: GenAIOperationName | LegacyOperationName;
  /** The requested model name */
  model: string;
  /** The promptfoo provider ID */
  providerId: string;
  /** Human-readable agent name, used only for invoke_agent spans when available. */
  agentName?: string;
  /** Stable agent identifier, used only for invoke_agent spans when available. */
  agentId?: string;

  // Optional request parameters
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  frequencyPenalty?: number;
  presencePenalty?: number;
  /** Whether the effective request is streaming. Only true is emitted in latest mode. */
  stream?: boolean;

  // Promptfoo context
  evalId?: string;
  testIndex?: number;
  promptLabel?: string;

  // W3C Trace Context - for propagating trace context from evaluation
  traceparent?: string;

  // Request body (will be truncated to MAX_BODY_LENGTH)
  requestBody?: string;

  /** Whether to sanitize sensitive data (API keys, secrets) from bodies. Defaults to true. */
  sanitizeBodies?: boolean;
}

/**
 * Result data to attach to a GenAI span after the API call completes.
 */
export interface GenAISpanResult {
  tokenUsage?: TokenUsage;
  conversationId?: string;
  responseModel?: string;
  responseId?: string;
  finishReasons?: string[];
  /** Whether the response was served from cache */
  cacheHit?: boolean;
  /** Response body (will be truncated to MAX_BODY_LENGTH) */
  responseBody?: string;
  /** Additional provider-specific attributes to add to the span */
  additionalAttributes?: Record<string, string | number | boolean>;
}

/**
 * Get the tracer instance for GenAI operations.
 */
export function getGenAITracer(): Tracer {
  return trace.getTracer(TRACER_NAME, TRACER_VERSION);
}

/**
 * Extract the error type string from a ProviderResponse-style error value.
 * Prefers provider code/type/status, then HTTP status (4xx/5xx), else `_OTHER`.
 */
function extractErrorType(rawError: unknown, metadata?: Record<string, unknown>): string {
  const errObj =
    typeof rawError === 'object' && rawError ? (rawError as Record<string, unknown>) : null;
  const providerCode =
    errObj && (errObj.code ?? errObj.type ?? errObj.status) != null
      ? String(errObj.code ?? errObj.type ?? errObj.status)
      : null;
  const httpStatus = (metadata as { http?: { status?: number } } | undefined)?.http?.status;
  return (
    providerCode ??
    (typeof httpStatus === 'number' && httpStatus >= 400 ? String(httpStatus) : null) ??
    ERROR_TYPE_VALUE_OTHER
  );
}

/**
 * Extract a human-readable error message from a ProviderResponse error field.
 */
function extractErrorMessage(rawError: unknown): string {
  if (typeof rawError === 'string') {
    return rawError;
  }
  return String((rawError as { message?: string }).message ?? 'Provider error');
}

/**
 * Execute a function within a GenAI span.
 *
 * This wrapper:
 * 1. Creates a span with GenAI semantic conventions
 * 2. Sets request attributes before execution
 * 3. Executes the provided function
 * 4. Sets response attributes (including token usage) after execution
 * 5. Handles errors and sets appropriate span status
 *
 * @param ctx - GenAI span context with request information
 * @param fn - The async function to execute (typically the API call)
 * @param resultExtractor - Optional function to extract result data from the return value
 * @returns The return value from fn
 *
 * @example
 * ```typescript
 * const response = await withGenAISpan(
 *   {
 *     system: 'openai',
 *     operationName: 'chat',
 *     model: 'gpt-4',
 *     providerId: 'openai:gpt-4',
 *   },
 *   async (span) => {
 *     return await openai.chat.completions.create({...});
 *   },
 *   (response) => ({
 *     tokenUsage: {
 *       prompt: response.usage?.prompt_tokens,
 *       completion: response.usage?.completion_tokens,
 *     },
 *     responseId: response.id,
 *   })
 * );
 * ```
 */
export async function withGenAISpan<T>(
  ctx: GenAISpanContext,
  fn: (span: Span) => Promise<T>,
  resultExtractor?: (value: T) => GenAISpanResult,
): Promise<T> {
  const tracer = getGenAITracer();

  // Normalize legacy operation names (completion -> text_completion, embedding -> embeddings)
  const canonicalOperation = normalizeOperationName(ctx.operationName);
  const useLatest = useGenAILatestExperimental();

  // Span name follows GenAI convention: "{operation} {model}"
  // Use emitted operation name (legacy vs latest per OTEL_SEMCONV_STABILITY_OPT_IN)
  const emittedOperation = getEmittedOperationName(canonicalOperation, useLatest);
  const spanName =
    useLatest && canonicalOperation === 'invoke_agent'
      ? ctx.agentName
        ? `invoke_agent ${ctx.agentName}`
        : 'invoke_agent'
      : `${emittedOperation} ${ctx.model}`;

  // Extract parent context from traceparent if provided
  // This allows spans to be linked to the evaluation's trace
  let parentContext = context.active();
  if (ctx.traceparent) {
    const carrier = { traceparent: ctx.traceparent };
    parentContext = propagation.extract(ROOT_CONTEXT, carrier);
  }

  // Create the span within the parent context
  const spanCallback = async (span: Span): Promise<T> => {
    try {
      const value = await fn(span);

      // Set response attributes if extractor provided
      if (resultExtractor) {
        const result = resultExtractor(value);
        setGenAIResponseAttributes(span, result, ctx.sanitizeBodies, useLatest);
      }

      // Check if response contains an error (ProviderResponse pattern)
      // Many providers return { error: "..." } instead of throwing
      const valueAsRecord = value as Record<string, unknown>;
      const rawError = valueAsRecord?.error;
      const hasError =
        (typeof rawError === 'string' && rawError) || (rawError && typeof rawError === 'object');

      if (hasError) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: extractErrorMessage(rawError),
        });
        span.setAttribute(
          ATTR_ERROR_TYPE,
          extractErrorType(rawError, valueAsRecord?.metadata as Record<string, unknown>),
        );
      } else if (!useLatest) {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      return value;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });

      const errorType =
        error instanceof Error
          ? (error as { code?: string }).code || error.name || ERROR_TYPE_VALUE_OTHER
          : ERROR_TYPE_VALUE_OTHER;
      span.setAttribute(ATTR_ERROR_TYPE, String(errorType));

      if (error instanceof Error) {
        span.recordException(error);
      }

      throw error;
    } finally {
      span.end();
    }
  };

  return tracer.startActiveSpan(
    spanName,
    {
      kind: SpanKind.CLIENT,
      attributes: buildRequestAttributes(ctx, emittedOperation, useLatest),
    },
    parentContext,
    spanCallback,
  );
}

/**
 * Build request attributes for a GenAI span.
 */
function buildRequestAttributes(
  ctx: GenAISpanContext,
  emittedOperation: string,
  useLatest: boolean,
): Attributes {
  const attrs: Attributes = {
    [GenAIAttributes.OPERATION_NAME]: emittedOperation,
    [GenAIAttributes.REQUEST_MODEL]: ctx.model,

    // Promptfoo attributes
    [PromptfooAttributes.PROVIDER_ID]: ctx.providerId,
  };

  Object.assign(attrs, getGenAIProviderAttributes(ctx.system, ctx.providerName, useLatest));

  if (useLatest && ctx.agentName) {
    attrs['gen_ai.agent.name'] = ctx.agentName;
  }
  if (useLatest && ctx.agentId) {
    attrs['gen_ai.agent.id'] = ctx.agentId;
  }

  // Optional request parameters
  if (ctx.maxTokens !== undefined) {
    attrs[GenAIAttributes.REQUEST_MAX_TOKENS] = ctx.maxTokens;
  }
  if (ctx.temperature !== undefined) {
    attrs[GenAIAttributes.REQUEST_TEMPERATURE] = ctx.temperature;
  }
  if (ctx.topP !== undefined) {
    attrs[GenAIAttributes.REQUEST_TOP_P] = ctx.topP;
  }
  if (ctx.topK !== undefined) {
    attrs[GenAIAttributes.REQUEST_TOP_K] = ctx.topK;
  }
  if (ctx.stopSequences && ctx.stopSequences.length > 0) {
    attrs[GenAIAttributes.REQUEST_STOP_SEQUENCES] = ctx.stopSequences;
  }
  if (ctx.frequencyPenalty !== undefined) {
    attrs[GenAIAttributes.REQUEST_FREQUENCY_PENALTY] = ctx.frequencyPenalty;
  }
  if (ctx.presencePenalty !== undefined) {
    attrs[GenAIAttributes.REQUEST_PRESENCE_PENALTY] = ctx.presencePenalty;
  }
  if (useLatest && ctx.stream === true) {
    attrs[GenAIAttributes.REQUEST_STREAM] = true;
  }

  // Promptfoo context
  if (ctx.evalId) {
    attrs[PromptfooAttributes.EVAL_ID] = ctx.evalId;
  }
  if (ctx.testIndex !== undefined) {
    attrs[PromptfooAttributes.TEST_INDEX] = ctx.testIndex;
  }
  if (ctx.promptLabel) {
    attrs[PromptfooAttributes.PROMPT_LABEL] = ctx.promptLabel;
  }

  // Request body (truncated, optionally sanitized)
  if (ctx.requestBody) {
    attrs[PromptfooAttributes.REQUEST_BODY] = truncateBody(ctx.requestBody, ctx.sanitizeBodies);
  }

  return attrs;
}

/**
 * Sanitize sensitive data from a body string.
 * Redacts API keys, secrets, tokens, and other sensitive patterns.
 */
export function sanitizeBody(body: string): string {
  let sanitized = body;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    if (typeof replacement === 'function') {
      sanitized = sanitized.replace(pattern, replacement);
    } else {
      sanitized = sanitized.replace(pattern, replacement);
    }
  }
  return sanitized;
}

/**
 * Truncate a body string to MAX_BODY_LENGTH.
 * Optionally sanitizes sensitive data first if sanitize=true.
 *
 * @param body - The body string to process
 * @param sanitize - Whether to sanitize sensitive data (defaults to true)
 */
function truncateBody(body: string, sanitize: boolean = true): string {
  // Sanitize sensitive data if requested
  const processed = sanitize ? sanitizeBody(body) : body;

  // Then truncate if needed
  if (processed.length <= MAX_BODY_LENGTH) {
    return processed;
  }
  return processed.slice(0, MAX_BODY_LENGTH - 15) + '... [truncated]';
}

function setGenAICompletionDetailAttributes(
  span: Span,
  details: NonNullable<TokenUsage['completionDetails']>,
  useLatest: boolean,
): void {
  if (details.reasoning !== undefined) {
    span.setAttribute(
      useLatest
        ? GenAIAttributes.USAGE_REASONING_OUTPUT_TOKENS
        : GenAIAttributes.USAGE_REASONING_TOKENS,
      details.reasoning,
    );
  }
  if (details.acceptedPrediction !== undefined) {
    span.setAttribute(GenAIAttributes.USAGE_ACCEPTED_PREDICTION_TOKENS, details.acceptedPrediction);
  }
  if (details.rejectedPrediction !== undefined) {
    span.setAttribute(GenAIAttributes.USAGE_REJECTED_PREDICTION_TOKENS, details.rejectedPrediction);
  }
  if (details.cacheReadInputTokens !== undefined) {
    span.setAttribute(
      useLatest
        ? GenAIAttributes.USAGE_CACHE_READ_INPUT_TOKENS_LATEST
        : GenAIAttributes.USAGE_CACHE_READ_INPUT_TOKENS,
      details.cacheReadInputTokens,
    );
  }
  if (details.cacheCreationInputTokens !== undefined) {
    span.setAttribute(
      useLatest
        ? GenAIAttributes.USAGE_CACHE_CREATION_INPUT_TOKENS_LATEST
        : GenAIAttributes.USAGE_CACHE_CREATION_INPUT_TOKENS,
      details.cacheCreationInputTokens,
    );
  }
}

function setGenAITokenUsageAttributes(span: Span, usage: TokenUsage, useLatest: boolean): void {
  if (usage.prompt !== undefined) {
    span.setAttribute(GenAIAttributes.USAGE_INPUT_TOKENS, usage.prompt);
  }
  if (usage.completion !== undefined) {
    span.setAttribute(GenAIAttributes.USAGE_OUTPUT_TOKENS, usage.completion);
  }
  if (usage.total !== undefined) {
    span.setAttribute(GenAIAttributes.USAGE_TOTAL_TOKENS, usage.total);
  }
  if (usage.cached !== undefined) {
    span.setAttribute(GenAIAttributes.USAGE_CACHED_TOKENS, usage.cached);
  }
  if (usage.completionDetails) {
    setGenAICompletionDetailAttributes(span, usage.completionDetails, useLatest);
  }
}

/**
 * Set response attributes on a span after the API call completes.
 *
 * @param span - The span to update
 * @param result - The result data containing token usage and response metadata
 * @param sanitize - Whether to sanitize sensitive data from response body (defaults to true)
 * @param useLatest - Whether to emit latest experimental OTEL usage attributes
 */
export function setGenAIResponseAttributes(
  span: Span,
  result: GenAISpanResult,
  sanitize: boolean = true,
  useLatest: boolean = useGenAILatestExperimental(),
): void {
  // Token usage
  if (result.tokenUsage) {
    setGenAITokenUsageAttributes(span, result.tokenUsage, useLatest);
  }

  // Response metadata
  if (result.responseModel) {
    span.setAttribute(GenAIAttributes.RESPONSE_MODEL, result.responseModel);
  }
  if (useLatest && result.conversationId) {
    span.setAttribute(GenAIAttributes.CONVERSATION_ID, result.conversationId);
  }
  if (result.responseId && (!useLatest || !result.conversationId)) {
    span.setAttribute(GenAIAttributes.RESPONSE_ID, result.responseId);
  }
  if (result.finishReasons && result.finishReasons.length > 0) {
    span.setAttribute(GenAIAttributes.RESPONSE_FINISH_REASONS, result.finishReasons);
  }

  // Promptfoo-specific response attributes
  if (result.cacheHit !== undefined) {
    span.setAttribute(PromptfooAttributes.CACHE_HIT, result.cacheHit);
  }
  if (result.responseBody) {
    span.setAttribute(
      PromptfooAttributes.RESPONSE_BODY,
      truncateBody(result.responseBody, sanitize),
    );
  }

  // Provider-specific additional attributes
  // Apply same sanitization/truncation as request/response bodies to prevent secret leakage
  if (result.additionalAttributes) {
    for (const [key, value] of Object.entries(result.additionalAttributes)) {
      if (value !== undefined && value !== null) {
        // Sanitize string values (e.g., reasoning text, conversation content)
        if (typeof value === 'string') {
          span.setAttribute(key, truncateBody(value, sanitize));
        } else {
          span.setAttribute(key, value);
        }
      }
    }
  }
}

/**
 * Get the W3C traceparent header value from the current active span.
 * Returns undefined if there is no active span.
 *
 * This can be used to propagate trace context to downstream services.
 */
export function getTraceparent(): string | undefined {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) {
    return undefined;
  }

  const ctx = activeSpan.spanContext();
  // W3C Trace Context format: version-traceId-spanId-traceFlags
  const traceFlags = ctx.traceFlags.toString(16).padStart(2, '0');
  return `00-${ctx.traceId}-${ctx.spanId}-${traceFlags}`;
}

/**
 * Get the current trace ID from the active span.
 * Returns undefined if there is no active span.
 */
export function getCurrentTraceId(): string | undefined {
  const activeSpan = trace.getActiveSpan();
  return activeSpan?.spanContext().traceId;
}

/**
 * Get the current span ID from the active span.
 * Returns undefined if there is no active span.
 */
export function getCurrentSpanId(): string | undefined {
  const activeSpan = trace.getActiveSpan();
  return activeSpan?.spanContext().spanId;
}

/**
 * Build a `chat` GenAISpanContext from the fields every provider shares.
 *
 * The promptfoo context fields (eval id, test index, prompt label, traceparent)
 * and the request body are derived identically across providers; per-provider
 * request parameters (max tokens, temperature, etc.) are passed via `request`.
 */
export function buildChatSpanContext(args: {
  system: string;
  providerName?: string;
  operationName?: GenAIOperationName;
  model: string;
  agentName?: string;
  agentId?: string;
  providerId: string;
  prompt: string;
  context?: CallApiContextParams;
  request?: Pick<
    GenAISpanContext,
    'maxTokens' | 'temperature' | 'topP' | 'stopSequences' | 'stream'
  >;
}): GenAISpanContext {
  const {
    system,
    providerName,
    operationName = 'chat',
    model,
    agentName,
    agentId,
    providerId,
    prompt,
    context,
    request,
  } = args;
  return {
    system,
    providerName,
    operationName,
    model,
    agentName,
    agentId,
    providerId,
    evalId: context?.evaluationId || (context?.test?.metadata?.evaluationId as string | undefined),
    testIndex: context?.test?.vars?.__testIdx as number | undefined,
    promptLabel: context?.prompt?.label,
    traceparent: context?.traceparent,
    requestBody: prompt,
    ...request,
  };
}

/**
 * Extract the standard GenAI response attributes (token usage, finish reason,
 * cache hit, response body) from a ProviderResponse. Every field is optional
 * and only emitted when present, so this is safe to share across providers
 * whose responses populate different subsets.
 */
export function extractProviderResponseAttributes(response: ProviderResponse): GenAISpanResult {
  const result: GenAISpanResult = {};
  if (response.tokenUsage) {
    // Preserve the full usage object (including completionDetails) so
    // setGenAIResponseAttributes can emit reasoning / prediction / cache-detail
    // token counts for reasoning models, not just the four top-level totals.
    result.tokenUsage = { ...response.tokenUsage };
  }
  if (response.finishReason) {
    result.finishReasons = [response.finishReason];
  }
  if (typeof response.metadata?.model === 'string') {
    result.responseModel = response.metadata.model;
  }
  if (typeof response.metadata?.responseId === 'string') {
    result.responseId = response.metadata.responseId;
  }
  if (response.cached !== undefined) {
    result.cacheHit = response.cached;
  }
  if (response.output !== undefined) {
    result.responseBody =
      typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
  }
  return result;
}

/**
 * Per-turn span bookkeeping shared by streaming agent providers. A provider's
 * streaming state embeds these fields and hands the state to the turn-span
 * helpers below, which own the span lifecycle while the provider supplies the
 * usage attributes (which differ per API).
 */
export interface TurnSpanState {
  /** Number of turns opened so far in this run (1-based for the active turn). */
  turnCount: number;
  /** The currently open `gen_ai.turn` span, if any. */
  activeTurnSpan?: Span;
  /** 1-based index of the currently open turn, stamped on child item spans. */
  activeTurnIndex: number;
}

/**
 * Open a `gen_ai.turn N` span on `state`, force-closing any still-open prior
 * turn span with ERROR status first (so a never-completed turn is
 * distinguishable). Span-creation failures are logged and leave no active span.
 */
export function openTurnSpan(
  state: TurnSpanState,
  opts: {
    tracer: Tracer;
    eventTime: number;
    system: string;
    providerName?: string;
    attributes?: Attributes;
    logLabel?: string;
  },
): void {
  if (state.activeTurnSpan) {
    try {
      state.activeTurnSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: 'Turn span not properly closed before next turn started',
      });
      state.activeTurnSpan.setAttribute(ATTR_ERROR_TYPE, ERROR_TYPE_VALUE_OTHER);
      state.activeTurnSpan.end(opts.eventTime);
    } catch {
      // ignore
    }
    state.activeTurnSpan = undefined;
  }
  // Only advance the turn counter / active index once the span actually opens,
  // so a (practically impossible) startSpan failure can't leave item spans
  // tagged with a turn index that has no corresponding gen_ai.turn span.
  const index = state.turnCount + 1;
  try {
    const span = opts.tracer.startSpan(`gen_ai.turn ${index}`, {
      kind: SpanKind.INTERNAL,
      startTime: opts.eventTime,
      attributes: {
        'gen_ai.turn.index': index,
        ...getGenAIProviderAttributes(opts.system, opts.providerName),
        ...opts.attributes,
      },
    });
    state.turnCount = index;
    state.activeTurnIndex = index;
    state.activeTurnSpan = span;
  } catch (err) {
    logger.warn(`[${opts.logLabel ?? 'TurnSpan'}] Failed to start turn span: ${err}`);
    state.activeTurnSpan = undefined;
  }
}

/**
 * Close the active `gen_ai.turn` span on `state`, applying any provider-supplied
 * usage attributes and convention-appropriate status. No-op when no turn span is open.
 */
export function closeTurnSpan(
  state: TurnSpanState,
  opts: {
    eventTime?: number;
    attributes?: Attributes;
    tokenUsage?: TokenUsage;
    errorMessage?: string;
    logLabel?: string;
  } = {},
): void {
  const span = state.activeTurnSpan;
  if (!span) {
    return;
  }
  try {
    if (opts.attributes) {
      for (const [key, value] of Object.entries(opts.attributes)) {
        if (value !== undefined && value !== null) {
          span.setAttribute(key, value);
        }
      }
    }
    if (opts.tokenUsage) {
      setGenAITokenUsageAttributes(span, opts.tokenUsage, useGenAILatestExperimental());
    }
    if (opts.errorMessage) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: opts.errorMessage });
      span.setAttribute(ATTR_ERROR_TYPE, ERROR_TYPE_VALUE_OTHER);
    } else if (!useGenAILatestExperimental()) {
      span.setStatus({ code: SpanStatusCode.OK });
    }
    span.end(opts.eventTime);
  } catch (err) {
    logger.warn(`[${opts.logLabel ?? 'TurnSpan'}] Failed to end turn span: ${err}`);
  }
  state.activeTurnSpan = undefined;
}

/**
 * Emit a fire-and-forget `gen_ai.turn N` marker span (created and ended at the
 * given timestamps). Used by providers whose agent loop has a natural turn
 * boundary but no streaming span to bracket. Status follows the selected
 * convention and errors are always marked explicitly.
 */
export function emitTurnMarkerSpan(opts: {
  tracer: Tracer;
  index: number;
  startTime: number;
  endTime: number;
  system: string;
  providerName?: string;
  attributes?: Attributes;
  errorMessage?: string;
  logLabel?: string;
}): void {
  try {
    const span = opts.tracer.startSpan(`gen_ai.turn ${opts.index}`, {
      kind: SpanKind.INTERNAL,
      startTime: opts.startTime,
      attributes: {
        ...getGenAIProviderAttributes(opts.system, opts.providerName),
        ...opts.attributes,
      },
    });
    if (opts.errorMessage) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: opts.errorMessage });
      span.setAttribute(ATTR_ERROR_TYPE, ERROR_TYPE_VALUE_OTHER);
    } else if (!useGenAILatestExperimental()) {
      span.setStatus({ code: SpanStatusCode.OK });
    }
    span.end(opts.endTime);
  } catch (err) {
    logger.warn(`[${opts.logLabel ?? 'TurnSpan'}] Failed to emit turn span: ${err}`);
  }
}
