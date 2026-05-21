import {
  context,
  propagation,
  ROOT_CONTEXT,
  type Span,
  SpanKind,
  SpanStatusCode,
} from '@opentelemetry/api';
import { getGenAITracer, PromptfooAttributes } from './genaiTracer';
import { getServiceName } from './graderTracer';
import { HttpAttributes } from './oauthTracer';

/**
 * Target-specific attribute names for tracing.
 * Uses the promptfoo namespace for custom attributes.
 */
export const TargetAttributes = {
  // Service identification
  SERVICE_NAME: 'service.name',

  // Target type (http, mcp, websocket)
  TARGET_TYPE: 'promptfoo.target.type',

  // Target endpoint URL
  TARGET_URL: 'promptfoo.target.url',

  // Target label (human-readable name for the target)
  TARGET_LABEL: 'promptfoo.target.label',
} as const;

/**
 * Target types for span categorization.
 */
export type TargetType = 'http' | 'mcp' | 'websocket' | 'llm';

/**
 * Context for creating a target span.
 */
export interface TargetSpanContext {
  /** The type of target (http, mcp, websocket) */
  targetType: TargetType;
  /** The target endpoint URL */
  url?: string;
  /** The provider ID (used for span name if label not provided) */
  providerId: string;
  /** Optional provider label (preferred for span name) */
  label?: string;
  /** W3C Trace Context - for propagating trace context from parent */
  traceparent?: string;
  /** Optional prompt label for identifying which prompt was used */
  promptLabel?: string;
  /** Optional evaluation ID */
  evalId?: string;
  /** Optional test case index */
  testIndex?: number;
  /** Optional iteration/turn number (1-indexed) */
  iteration?: number;
}

/**
 * Execute a function within a target span.
 *
 * This wrapper creates a root span for HTTP, MCP, or WebSocket target execution.
 * The span:
 * - Sets service.name = 'promptfoo-cli'
 * - Uses provider label or ID as the span name
 * - Sets promptfoo.target.* attributes
 * - Provides context for child spans (OAuth, HTTP requests, etc.)
 * - Sets span status to OK if no error, or ERROR if exception thrown
 *
 * @param ctx - Target span context with provider information
 * @param fn - The async function to execute
 * @returns The return value from fn
 *
 * @example
 * ```typescript
 * const response = await withTargetSpan(
 *   {
 *     targetType: 'http',
 *     url: 'https://api.example.com/chat',
 *     providerId: 'http:chat',
 *     label: 'Chat API',
 *   },
 *   async (span) => {
 *     // OAuth and HTTP request spans will be children of this span
 *     // Span status will be set to OK if no error, or ERROR if exception thrown
 *     return await makeRequest();
 *   }
 * );
 * ```
 */
export async function withTargetSpan<T>(
  ctx: TargetSpanContext,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = getGenAITracer();

  // Span name: use label if provided, otherwise provider ID
  const spanName = ctx.label || ctx.providerId;

  // Extract parent context from traceparent if provided
  let parentContext = context.active();
  if (ctx.traceparent) {
    const carrier = { traceparent: ctx.traceparent };
    parentContext = propagation.extract(ROOT_CONTEXT, carrier);
  }

  // Build attributes - use dynamic service name based on prompt label
  const attributes: Record<string, string | number | boolean> = {
    [TargetAttributes.SERVICE_NAME]: getServiceName(ctx.promptLabel),
    [TargetAttributes.TARGET_TYPE]: ctx.targetType,
    [PromptfooAttributes.PROVIDER_ID]: ctx.providerId,
  };

  if (ctx.url) {
    attributes[TargetAttributes.TARGET_URL] = ctx.url;
  }

  if (ctx.label) {
    attributes[TargetAttributes.TARGET_LABEL] = ctx.label;
  }

  if (ctx.promptLabel) {
    attributes[PromptfooAttributes.PROMPT_LABEL] = ctx.promptLabel;
  }

  if (ctx.evalId) {
    attributes[PromptfooAttributes.EVAL_ID] = ctx.evalId;
  }

  if (ctx.testIndex !== undefined) {
    attributes[PromptfooAttributes.TEST_INDEX] = ctx.testIndex;
  }

  if (ctx.iteration !== undefined) {
    attributes[PromptfooAttributes.ITERATION] = ctx.iteration;
  }

  const spanCallback = async (span: Span): Promise<T> => {
    try {
      const value = await fn(span);

      // Set cache hit attribute if present in response
      if (value && typeof value === 'object' && 'cached' in value) {
        span.setAttribute(PromptfooAttributes.CACHE_HIT, Boolean(value.cached));
      }

      // Check if the response contains an error field (e.g., ProviderResponse.error)
      if (value && typeof value === 'object' && 'error' in value && value.error) {
        const errorMessage = typeof value.error === 'string' ? value.error : String(value.error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage,
        });
        // Record the error as an exception for better visibility in tracing backends
        span.recordException(new Error(errorMessage));
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
      attributes,
    },
    parentContext,
    spanCallback,
  );
}

/**
 * Context for creating an HTTP request span.
 */
export interface HttpRequestSpanContext {
  /** HTTP method */
  method: string;
  /** Request URL */
  url: string;
}

/**
 * Result data to attach to an HTTP request span after completion.
 */
export interface HttpRequestSpanResult {
  /** HTTP status code */
  httpStatusCode?: number;
}

/**
 * Execute a function within an HTTP request span.
 *
 * This creates a child span for the actual HTTP request, separate from
 * the parent target span. This allows proper distributed tracing where
 * the external service can link its spans to this HTTP request span.
 *
 * @param ctx - HTTP request span context
 * @param fn - The async function to execute (typically the fetch call)
 * @param resultExtractor - Optional function to extract result data from the return value
 * @returns The return value from fn
 */
/**
 * MCP-specific attribute names for tracing.
 */
export const MCPAttributes = {
  TOOL_NAME: 'mcp.tool.name',
  SERVER_KEY: 'mcp.server.key',
} as const;

/**
 * Context for creating an MCP tool call span.
 */
export interface MCPToolCallSpanContext {
  /** Tool name being called */
  toolName: string;
  /** Server key (identifier for the MCP server) */
  serverKey?: string;
}

/**
 * Result data to attach to an MCP tool call span after completion.
 */
export interface MCPToolCallSpanResult {
  /** Whether the tool call resulted in an error */
  error?: boolean;
}

/**
 * Execute a function within an MCP tool call span.
 *
 * @param ctx - MCP tool call span context
 * @param fn - The async function to execute (typically the tool call)
 * @param resultExtractor - Optional function to extract result data from the return value
 * @returns The return value from fn
 */
export async function withMCPToolCallSpan<T>(
  ctx: MCPToolCallSpanContext,
  fn: (span: Span) => Promise<T>,
  resultExtractor?: (value: T) => MCPToolCallSpanResult,
): Promise<T> {
  const tracer = getGenAITracer();

  const spanName = `mcp tool_call ${ctx.toolName}`;
  const attributes: Record<string, string> = {
    [TargetAttributes.SERVICE_NAME]: 'promptfoo-cli',
    [MCPAttributes.TOOL_NAME]: ctx.toolName,
  };

  if (ctx.serverKey) {
    attributes[MCPAttributes.SERVER_KEY] = ctx.serverKey;
  }

  const spanCallback = async (span: Span): Promise<T> => {
    try {
      const value = await fn(span);

      // Set response attributes if extractor provided
      if (resultExtractor) {
        const result = resultExtractor(value);
        if (result.error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Tool call returned an error',
          });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }
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
      attributes,
    },
    spanCallback,
  );
}

export async function withHttpRequestSpan<T>(
  ctx: HttpRequestSpanContext,
  fn: (span: Span) => Promise<T>,
  resultExtractor?: (value: T) => HttpRequestSpanResult,
): Promise<T> {
  const tracer = getGenAITracer();

  // Parse URL for span name and attributes
  let spanName = `${ctx.method}`;
  const attributes: Record<string, string | number> = {
    [TargetAttributes.SERVICE_NAME]: 'promptfoo-cli',
    [HttpAttributes.REQUEST_METHOD]: ctx.method,
  };

  try {
    const url = new URL(ctx.url);
    spanName = `${ctx.method} ${url.pathname}`;
    attributes[HttpAttributes.URL_FULL] = `${url.protocol}//${url.host}${url.pathname}`;
    attributes[HttpAttributes.URL_SCHEME] = url.protocol.replace(':', '');
    attributes[HttpAttributes.URL_PATH] = url.pathname;
    attributes[HttpAttributes.SERVER_ADDRESS] = url.hostname;
    attributes[HttpAttributes.SERVER_PORT] = url.port
      ? parseInt(url.port, 10)
      : url.protocol === 'https:'
        ? 443
        : 80;
  } catch {
    // If URL parsing fails, use the raw URL
    attributes[HttpAttributes.URL_FULL] = ctx.url.slice(0, 256);
  }

  const spanCallback = async (span: Span): Promise<T> => {
    try {
      const value = await fn(span);

      // Set response attributes if extractor provided
      if (resultExtractor) {
        const result = resultExtractor(value);
        if (result.httpStatusCode !== undefined) {
          span.setAttribute(HttpAttributes.RESPONSE_STATUS_CODE, result.httpStatusCode);
        }
      }

      span.setStatus({ code: SpanStatusCode.OK });
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
      attributes,
    },
    spanCallback,
  );
}
