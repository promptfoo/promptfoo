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

import type { TokenUsage } from '../types/shared';

const TRACER_NAME = 'promptfoo.providers';
const TRACER_VERSION = '1.0.0';

// GenAI Semantic Convention attribute names
// See: https://opentelemetry.io/docs/specs/semconv/gen-ai/
export const GenAIAttributes = {
  // System identification
  SYSTEM: 'gen_ai.system',
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

  // Response attributes
  RESPONSE_MODEL: 'gen_ai.response.model',
  RESPONSE_ID: 'gen_ai.response.id',
  RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',

  // Usage attributes (official)
  USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',

  // Usage attributes (custom/extended)
  USAGE_TOTAL_TOKENS: 'gen_ai.usage.total_tokens',
  USAGE_CACHED_TOKENS: 'gen_ai.usage.cached_tokens',
  USAGE_REASONING_TOKENS: 'gen_ai.usage.reasoning_tokens',
  USAGE_ACCEPTED_PREDICTION_TOKENS: 'gen_ai.usage.accepted_prediction_tokens',
  USAGE_REJECTED_PREDICTION_TOKENS: 'gen_ai.usage.rejected_prediction_tokens',
} as const;

// Promptfoo-specific attributes
export const PromptfooAttributes = {
  PROVIDER_ID: 'promptfoo.provider.id',
  EVAL_ID: 'promptfoo.eval.id',
  TEST_INDEX: 'promptfoo.test.index',
  PROMPT_LABEL: 'promptfoo.prompt.label',
  ITERATION: 'promptfoo.iteration',
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
  /** The operation type */
  operationName: 'chat' | 'completion' | 'embedding';
  /** The requested model name */
  model: string;
  /** The promptfoo provider ID */
  providerId: string;

  // Optional request parameters
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  frequencyPenalty?: number;
  presencePenalty?: number;

  // Promptfoo context
  evalId?: string;
  testIndex?: number;
  promptLabel?: string;
  /** Iteration/turn number (1-indexed) for multi-turn evaluations */
  iteration?: number;

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

  // Span name follows GenAI convention: "{operation} {model}"
  const spanName = `${ctx.operationName} ${ctx.model}`;

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
        setGenAIResponseAttributes(span, result, ctx.sanitizeBodies);
      }

      // Check if response contains an error (ProviderResponse pattern)
      // Many providers return { error: "..." } instead of throwing
      const valueAsRecord = value as Record<string, unknown>;
      if (valueAsRecord && typeof valueAsRecord.error === 'string' && valueAsRecord.error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: valueAsRecord.error,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      return value;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });

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
      attributes: buildRequestAttributes(ctx),
    },
    parentContext,
    spanCallback,
  );
}

/**
 * Build request attributes for a GenAI span.
 */
function buildRequestAttributes(ctx: GenAISpanContext): Attributes {
  const attrs: Attributes = {
    // GenAI semantic conventions
    [GenAIAttributes.SYSTEM]: ctx.system,
    [GenAIAttributes.OPERATION_NAME]: ctx.operationName,
    [GenAIAttributes.REQUEST_MODEL]: ctx.model,

    // Promptfoo attributes
    [PromptfooAttributes.PROVIDER_ID]: ctx.providerId,
  };

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
  if (ctx.iteration !== undefined) {
    attrs[PromptfooAttributes.ITERATION] = ctx.iteration;
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

/**
 * Set response attributes on a span after the API call completes.
 *
 * @param span - The span to update
 * @param result - The result data containing token usage and response metadata
 * @param sanitize - Whether to sanitize sensitive data from response body (defaults to true)
 */
export function setGenAIResponseAttributes(
  span: Span,
  result: GenAISpanResult,
  sanitize: boolean = true,
): void {
  // Token usage
  if (result.tokenUsage) {
    const usage = result.tokenUsage;

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

    // Completion details (reasoning tokens, etc.)
    if (usage.completionDetails) {
      if (usage.completionDetails.reasoning !== undefined) {
        span.setAttribute(
          GenAIAttributes.USAGE_REASONING_TOKENS,
          usage.completionDetails.reasoning,
        );
      }
      if (usage.completionDetails.acceptedPrediction !== undefined) {
        span.setAttribute(
          GenAIAttributes.USAGE_ACCEPTED_PREDICTION_TOKENS,
          usage.completionDetails.acceptedPrediction,
        );
      }
      if (usage.completionDetails.rejectedPrediction !== undefined) {
        span.setAttribute(
          GenAIAttributes.USAGE_REJECTED_PREDICTION_TOKENS,
          usage.completionDetails.rejectedPrediction,
        );
      }
    }
  }

  // Response metadata
  if (result.responseModel) {
    span.setAttribute(GenAIAttributes.RESPONSE_MODEL, result.responseModel);
  }
  if (result.responseId) {
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
