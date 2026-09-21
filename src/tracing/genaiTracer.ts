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
import logger from '../logger';
import { getActiveSpanRole, SPAN_ROLE_ATTRIBUTE } from './spanRoles';

import type { CallApiContextParams, ProviderResponse } from '../types/index';
import type { TokenUsage } from '../types/shared';

export {
  PROMPTFOO_RESOURCE_ATTR_PARENT_SPAN_ID,
  PROMPTFOO_RESOURCE_ATTR_TRACE_ID,
} from './resourceAttributes';

const TRACER_NAME = 'promptfoo.providers';
const TRACER_VERSION = '1.0.0';

// GenAI Semantic Convention attribute names
// See: https://github.com/open-telemetry/semantic-conventions-genai/tree/main/docs/gen-ai
export const GenAIAttributes = {
  // Provider identification
  /** @deprecated Read-only compatibility for spans emitted before gen_ai.provider.name. */
  SYSTEM: 'gen_ai.system',
  PROVIDER_NAME: 'gen_ai.provider.name',
  OPERATION_NAME: 'gen_ai.operation.name',
  AGENT_ID: 'gen_ai.agent.id',
  AGENT_NAME: 'gen_ai.agent.name',

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

  // Evaluation attributes
  EVALUATION_NAME: 'gen_ai.evaluation.name',
  EVALUATION_SCORE_VALUE: 'gen_ai.evaluation.score.value',
  EVALUATION_SCORE_LABEL: 'gen_ai.evaluation.score.label',
  EVALUATION_EXPLANATION: 'gen_ai.evaluation.explanation',

  // Usage attributes
  USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  USAGE_REASONING_OUTPUT_TOKENS: 'gen_ai.usage.reasoning.output_tokens',
  USAGE_CACHE_READ_INPUT_TOKENS: 'gen_ai.usage.cache_read.input_tokens',
  USAGE_CACHE_CREATION_INPUT_TOKENS: 'gen_ai.usage.cache_creation.input_tokens',
} as const;

// Promptfoo-specific attributes
export const PromptfooAttributes = {
  PROVIDER_ID: 'promptfoo.provider.id',
  EVAL_ID: 'promptfoo.eval.id',
  TEST_INDEX: 'promptfoo.test.index',
  PROMPT_LABEL: 'promptfoo.prompt.label',
  CACHE_HIT: 'promptfoo.cache_hit',
  REQUEST_BODY: 'promptfoo.request.body',
  RESPONSE_BODY: 'promptfoo.response.body',
  USAGE_TOTAL_TOKENS: 'promptfoo.usage.total_tokens',
  USAGE_CACHED_RESPONSE_TOKENS: 'promptfoo.usage.cached_response_tokens',
  USAGE_ACCEPTED_PREDICTION_TOKENS: 'promptfoo.usage.accepted_prediction_tokens',
  USAGE_REJECTED_PREDICTION_TOKENS: 'promptfoo.usage.rejected_prediction_tokens',
} as const;

type GenAIOperationName = 'chat' | 'text_completion' | 'embeddings' | 'invoke_agent';

const GEN_AI_PROVIDER_NAMES: Record<string, string> = {
  alibaba: 'alibaba_cloud',
  aws_bedrock: 'aws.bedrock',
  azure: 'azure.ai.openai',
  azure_ai_inference: 'azure.ai.inference',
  azure_openai: 'azure.ai.openai',
  bedrock: 'aws.bedrock',
  gemini: 'gcp.gemini',
  google: 'gcp.gen_ai',
  gcp_vertex_ai: 'gcp.vertex_ai',
  ibm_watsonx: 'ibm.watsonx.ai',
  mistral: 'mistral_ai',
  vertex: 'gcp.vertex_ai',
  watsonx: 'ibm.watsonx.ai',
  xai: 'x_ai',
};

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
  /** The operation type. Legacy completion and embedding values are normalized on spans. */
  operationName: GenAIOperationName | 'completion' | 'embedding';
  /** The requested model name */
  model: string;
  /** Stable identifier for a remotely hosted agent, when available. */
  agentId?: string;
  /** Human-readable agent name for invoke_agent spans. */
  agentName?: string;
  /** Distinguishes OpenAI's Responses and Chat Completions APIs. */
  openaiApiType?: 'responses' | 'chat_completions';
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

/** Details shared by function callbacks and MCP tool executions. */
export interface GenAIToolSpanContext {
  name: string;
  arguments?: unknown;
  callId?: string;
  /** MCP wraps its model-visible output in a protocol-specific content field. */
  resultFormat?: 'mcp';
}

/**
 * Get the tracer instance for GenAI operations.
 */
export function getGenAITracer(): Tracer {
  return trace.getTracer(TRACER_NAME, TRACER_VERSION);
}

/** Preserve whether provider-created child spans belong to the target or the grader. */
export function addActiveSpanRoleAttribute(attributes: Attributes): Attributes {
  const role = getActiveSpanRole();
  return role ? { ...attributes, [SPAN_ROLE_ATTRIBUTE]: role } : attributes;
}

/** Record tool execution beneath its existing target or grader span. */
export async function withGenAIToolSpan<T>(
  tool: GenAIToolSpanContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (!trace.getActiveSpan()) {
    return await fn();
  }

  const attributes: Attributes = addActiveSpanRoleAttribute({
    [GenAIAttributes.OPERATION_NAME]: 'execute_tool',
    'gen_ai.tool.name': tool.name,
    'tool.name': tool.name,
  });
  if (tool.callId) {
    attributes['gen_ai.tool.call.id'] = tool.callId;
  }
  const toolArguments = serializeToolAttribute(tool.arguments);
  if (toolArguments !== undefined) {
    attributes['tool.arguments'] = toolArguments;
  }

  return getGenAITracer().startActiveSpan(
    `execute_tool ${tool.name}`,
    { kind: SpanKind.INTERNAL, attributes },
    async (span) => {
      try {
        const result = await fn();
        const resultRecord =
          result && typeof result === 'object' ? (result as Record<string, unknown>) : undefined;
        const output = serializeToolAttribute(
          tool.resultFormat === 'mcp' && resultRecord && 'content' in resultRecord
            ? resultRecord.content
            : result,
        );
        if (output !== undefined) {
          span.setAttribute('tool.output', output);
        }

        if (
          resultRecord &&
          (resultRecord.isError === true ||
            (tool.resultFormat === 'mcp' && Boolean(resultRecord.error)))
        ) {
          span.setAttribute('tool.is_error', true);
          span.setAttribute('error.type', 'tool_error');
          span.setStatus({
            code: SpanStatusCode.ERROR,
            ...(typeof resultRecord.error === 'string'
              ? { message: truncateBody(resultRecord.error) }
              : {}),
          });
        } else {
          span.setAttribute('tool.is_error', false);
          span.setStatus({ code: SpanStatusCode.OK });
        }
        return result;
      } catch (error) {
        span.setAttribute('tool.is_error', true);
        span.setAttribute('error.type', error instanceof Error ? error.name : '_OTHER');
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: truncateBody(error instanceof Error ? error.message : String(error)),
        });
        if (error instanceof Error) {
          const sanitizedError = new Error(truncateBody(error.message));
          sanitizedError.name = error.name;
          if (error.stack) {
            sanitizedError.stack = truncateBody(error.stack);
          }
          span.recordException(sanitizedError);
        }
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

function serializeToolAttribute(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return serialized === undefined ? undefined : truncateBody(serialized);
  } catch {
    return undefined;
  }
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
  const operationName = normalizeOperationName(ctx.operationName);

  // Agent spans identify the invoked agent; inference spans identify the requested model.
  const spanName =
    operationName === 'invoke_agent'
      ? ctx.agentName
        ? `${operationName} ${ctx.agentName}`
        : operationName
      : `${operationName} ${ctx.model}`;

  // Extract parent context from traceparent if provided
  // This allows spans to be linked to the evaluation's trace
  let parentContext = context.active();
  const activeSpanContext = trace.getSpan(parentContext)?.spanContext();
  const [, explicitTraceId, explicitSpanId] = ctx.traceparent?.split('-') ?? [];
  if (
    ctx.traceparent &&
    (activeSpanContext?.traceId.toLowerCase() !== explicitTraceId?.toLowerCase() ||
      activeSpanContext?.spanId.toLowerCase() !== explicitSpanId?.toLowerCase())
  ) {
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
        if (
          result.cacheHit === undefined &&
          value !== null &&
          typeof value === 'object' &&
          'cached' in value &&
          typeof value.cached === 'boolean'
        ) {
          result.cacheHit = value.cached;
        }
        setGenAIResponseAttributes(span, result, ctx.sanitizeBodies);
      }

      // Check if response contains an error (ProviderResponse pattern)
      // Many providers return { error: "..." } instead of throwing
      const valueAsRecord = value as Record<string, unknown>;
      if (valueAsRecord && typeof valueAsRecord.error === 'string' && valueAsRecord.error) {
        span.setAttribute('error.type', 'provider_error');
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: valueAsRecord.error,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      return value;
    } catch (error) {
      span.setAttribute('error.type', error instanceof Error ? error.name : '_OTHER');
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
      attributes: buildRequestAttributes(ctx, operationName),
    },
    parentContext,
    spanCallback,
  );
}

/**
 * Build request attributes for a GenAI span.
 */
function normalizeOperationName(
  operationName: GenAISpanContext['operationName'],
): GenAIOperationName {
  if (operationName === 'completion') {
    return 'text_completion';
  }
  return operationName === 'embedding' ? 'embeddings' : operationName;
}

function getProviderName(system: string): string {
  const baseSystem = system.split(':', 1)[0];
  const normalizedSystem = baseSystem.toLowerCase().replace(/[-.\s]/g, '_');
  return GEN_AI_PROVIDER_NAMES[normalizedSystem] ?? baseSystem;
}

function buildRequestAttributes(
  ctx: GenAISpanContext,
  operationName: GenAIOperationName,
): Attributes {
  const attrs: Attributes = {
    // GenAI semantic conventions
    [GenAIAttributes.PROVIDER_NAME]: getProviderName(ctx.system),
    [GenAIAttributes.OPERATION_NAME]: operationName,

    // Promptfoo attributes
    [PromptfooAttributes.PROVIDER_ID]: ctx.providerId,
  };

  if (operationName === 'invoke_agent' && ctx.agentName) {
    attrs[GenAIAttributes.AGENT_NAME] = ctx.agentName;
  }
  if (operationName === 'invoke_agent' && ctx.agentId) {
    attrs[GenAIAttributes.AGENT_ID] = ctx.agentId;
  }
  if (
    operationName !== 'invoke_agent' ||
    (ctx.model !== ctx.agentName && ctx.model !== ctx.agentId)
  ) {
    attrs[GenAIAttributes.REQUEST_MODEL] = ctx.model;
  }
  if (ctx.openaiApiType && attrs[GenAIAttributes.PROVIDER_NAME] === 'openai') {
    attrs['openai.api.type'] = ctx.openaiApiType;
  }

  const spanRole = getActiveSpanRole();
  if (spanRole) {
    attrs[SPAN_ROLE_ATTRIBUTE] = spanRole;
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
  const replace = String.prototype.replace as (
    this: string,
    pattern: RegExp,
    replacement: (typeof SENSITIVE_PATTERNS)[number]['replacement'],
  ) => string;
  let sanitized = body;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    sanitized = replace.call(sanitized, pattern, replacement);
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
      span.setAttribute(PromptfooAttributes.USAGE_TOTAL_TOKENS, usage.total);
    }
    if (usage.cached !== undefined) {
      if (result.cacheHit === true) {
        span.setAttribute(PromptfooAttributes.USAGE_CACHED_RESPONSE_TOKENS, usage.cached);
      } else if (usage.completionDetails?.cacheReadInputTokens === undefined) {
        span.setAttribute(GenAIAttributes.USAGE_CACHE_READ_INPUT_TOKENS, usage.cached);
      }
    }

    // Completion details (reasoning tokens, etc.)
    if (usage.completionDetails) {
      if (usage.completionDetails.reasoning !== undefined) {
        span.setAttribute(
          GenAIAttributes.USAGE_REASONING_OUTPUT_TOKENS,
          usage.completionDetails.reasoning,
        );
      }
      if (usage.completionDetails.acceptedPrediction !== undefined) {
        span.setAttribute(
          PromptfooAttributes.USAGE_ACCEPTED_PREDICTION_TOKENS,
          usage.completionDetails.acceptedPrediction,
        );
      }
      if (usage.completionDetails.rejectedPrediction !== undefined) {
        span.setAttribute(
          PromptfooAttributes.USAGE_REJECTED_PREDICTION_TOKENS,
          usage.completionDetails.rejectedPrediction,
        );
      }
      if (usage.completionDetails.cacheReadInputTokens !== undefined) {
        span.setAttribute(
          GenAIAttributes.USAGE_CACHE_READ_INPUT_TOKENS,
          usage.completionDetails.cacheReadInputTokens,
        );
      }
      if (usage.completionDetails.cacheCreationInputTokens !== undefined) {
        span.setAttribute(
          GenAIAttributes.USAGE_CACHE_CREATION_INPUT_TOKENS,
          usage.completionDetails.cacheCreationInputTokens,
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

/**
 * Build a `chat` GenAISpanContext from the fields every provider shares.
 *
 * The promptfoo context fields (eval id, test index, prompt label, traceparent)
 * and the request body are derived identically across providers; per-provider
 * request parameters (max tokens, temperature, etc.) are passed via `request`.
 */
export function buildChatSpanContext(args: {
  system: string;
  model: string;
  providerId: string;
  prompt: string;
  context?: CallApiContextParams;
  request?: Pick<GenAISpanContext, 'maxTokens' | 'temperature' | 'topP' | 'stopSequences'>;
}): GenAISpanContext {
  const { system, model, providerId, prompt, context, request } = args;
  return {
    system,
    operationName: 'chat',
    model,
    providerId,
    evalId: context?.evaluationId || (context?.test?.metadata?.evaluationId as string | undefined),
    testIndex: context?.testIdx ?? (context?.test?.vars?.__testIdx as number | undefined),
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
      attributes: addActiveSpanRoleAttribute({
        'gen_ai.turn.index': index,
        [GenAIAttributes.PROVIDER_NAME]: getProviderName(opts.system),
        ...opts.attributes,
      }),
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
 * usage attributes and an OK/ERROR status. No-op when no turn span is open.
 */
export function closeTurnSpan(
  state: TurnSpanState,
  opts: {
    eventTime?: number;
    attributes?: Attributes;
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
    span.setStatus(
      opts.errorMessage
        ? { code: SpanStatusCode.ERROR, message: opts.errorMessage }
        : { code: SpanStatusCode.OK },
    );
    span.end(opts.eventTime);
  } catch (err) {
    logger.warn(`[${opts.logLabel ?? 'TurnSpan'}] Failed to end turn span: ${err}`);
  }
  state.activeTurnSpan = undefined;
}

/**
 * Emit a fire-and-forget `gen_ai.turn N` marker span (created and ended at the
 * given timestamps). Used by providers whose agent loop has a natural turn
 * boundary but no streaming span to bracket. Caller builds the full attribute
 * set; status is OK unless `errorMessage` is provided.
 */
export function emitTurnMarkerSpan(opts: {
  tracer: Tracer;
  index: number;
  startTime: number;
  endTime: number;
  attributes: Attributes;
  errorMessage?: string;
  logLabel?: string;
}): void {
  try {
    const span = opts.tracer.startSpan(`gen_ai.turn ${opts.index}`, {
      kind: SpanKind.INTERNAL,
      startTime: opts.startTime,
      attributes: addActiveSpanRoleAttribute(opts.attributes),
    });
    span.setStatus(
      opts.errorMessage
        ? { code: SpanStatusCode.ERROR, message: opts.errorMessage }
        : { code: SpanStatusCode.OK },
    );
    span.end(opts.endTime);
  } catch (err) {
    logger.warn(`[${opts.logLabel ?? 'TurnSpan'}] Failed to emit turn span: ${err}`);
  }
}
