import { context, propagation, ROOT_CONTEXT, type Span, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { getGenAITracer } from './genaiTracer';

/**
 * Standard HTTP semantic convention attributes.
 * See: https://opentelemetry.io/docs/specs/semconv/http/http-spans/
 */
export const HttpAttributes = {
  // Request attributes
  REQUEST_METHOD: 'http.request.method',
  URL_FULL: 'url.full',
  URL_SCHEME: 'url.scheme',
  URL_PATH: 'url.path',
  SERVER_ADDRESS: 'server.address',
  SERVER_PORT: 'server.port',

  // Response attributes
  RESPONSE_STATUS_CODE: 'http.response.status_code',
} as const;

/**
 * OAuth-specific attribute names for tracing.
 */
export const OAuthAttributes = {
  // Operation type
  OPERATION: 'oauth.operation',

  // Grant type (client_credentials, password)
  GRANT_TYPE: 'oauth.grant_type',

  // Client identification (redacted)
  CLIENT_ID: 'oauth.client_id',

  // Scopes requested
  SCOPES: 'oauth.scopes',

  // Provider context (http, mcp)
  PROVIDER_TYPE: 'oauth.provider_type',

  // Token expiration
  EXPIRES_IN: 'oauth.expires_in',

  // Cache info
  CACHE_HIT: 'oauth.cache_hit',
} as const;

/**
 * OAuth operation types for span naming.
 */
export type OAuthOperation = 'token_fetch' | 'token_refresh' | 'discovery';

/**
 * Context for creating an OAuth span.
 */
export interface OAuthSpanContext {
  /** The OAuth operation type */
  operation: OAuthOperation;
  /** The target URL (token endpoint or discovery URL) */
  url: string;
  /** HTTP method (defaults to POST for token operations, GET for discovery) */
  method?: 'GET' | 'POST';
  /** The grant type (client_credentials, password) */
  grantType?: string;
  /** Client ID (will be partially redacted) */
  clientId?: string;
  /** Requested scopes */
  scopes?: string[];
  /** Provider type (http, mcp) */
  providerType?: 'http' | 'mcp';
  /** W3C Trace Context - for propagating trace context from parent */
  traceparent?: string;
}

/**
 * Result data to attach to an OAuth span after completion.
 */
export interface OAuthSpanResult {
  /** HTTP status code from token endpoint */
  httpStatusCode?: number;
  /** Token expiration time in seconds */
  expiresIn?: number;
  /** Whether the token was served from cache */
  cacheHit?: boolean;
}

/**
 * Partially redact a client ID for logging.
 * Shows first 4 and last 4 characters if long enough.
 */
function redactClientId(clientId: string): string {
  if (clientId.length <= 12) {
    return '***';
  }
  return `${clientId.slice(0, 4)}...${clientId.slice(-4)}`;
}

/**
 * Parse URL and extract HTTP semantic convention attributes.
 */
function extractHttpAttributes(
  urlString: string,
  method: string,
): Record<string, string | number> {
  const attributes: Record<string, string | number> = {
    [HttpAttributes.REQUEST_METHOD]: method,
  };

  try {
    const url = new URL(urlString);

    // url.full - Full URL without query params (for security)
    const sanitizedUrl = `${url.protocol}//${url.host}${url.pathname}`;
    attributes[HttpAttributes.URL_FULL] = sanitizedUrl;

    // url.scheme - http or https
    attributes[HttpAttributes.URL_SCHEME] = url.protocol.replace(':', '');

    // url.path - Path component
    attributes[HttpAttributes.URL_PATH] = url.pathname;

    // server.address - Hostname
    attributes[HttpAttributes.SERVER_ADDRESS] = url.hostname;

    // server.port - Port (if explicitly specified)
    if (url.port) {
      attributes[HttpAttributes.SERVER_PORT] = parseInt(url.port, 10);
    } else {
      // Use default ports
      attributes[HttpAttributes.SERVER_PORT] = url.protocol === 'https:' ? 443 : 80;
    }
  } catch {
    // If URL parsing fails, just set the full URL as-is (truncated)
    attributes[HttpAttributes.URL_FULL] = urlString.slice(0, 256);
  }

  return attributes;
}

/**
 * Execute a function within an OAuth span.
 *
 * This wrapper:
 * 1. Creates a span for the OAuth operation
 * 2. Sets request attributes before execution (including standard HTTP attributes)
 * 3. Executes the provided function
 * 4. Sets response attributes after execution
 * 5. Handles errors and sets appropriate span status
 *
 * @param ctx - OAuth span context with operation information
 * @param fn - The async function to execute (typically the token request)
 * @param resultExtractor - Optional function to extract result data from the return value
 * @returns The return value from fn
 *
 * @example
 * ```typescript
 * const token = await withOAuthSpan(
 *   {
 *     operation: 'token_fetch',
 *     url: 'https://auth.example.com/token',
 *     grantType: 'client_credentials',
 *     providerType: 'http',
 *   },
 *   async () => {
 *     return await fetchToken();
 *   },
 *   (result) => ({
 *     expiresIn: result.expires_in,
 *     httpStatusCode: 200,
 *   })
 * );
 * ```
 */
export async function withOAuthSpan<T>(
  ctx: OAuthSpanContext,
  fn: (span: Span) => Promise<T>,
  resultExtractor?: (value: T) => OAuthSpanResult,
): Promise<T> {
  const tracer = getGenAITracer();

  // Determine HTTP method (POST for token operations, GET for discovery)
  const method = ctx.method ?? (ctx.operation === 'discovery' ? 'GET' : 'POST');

  // Span name follows HTTP convention: "{METHOD} {path}"
  let spanName = `${method}`;
  try {
    const url = new URL(ctx.url);
    spanName = `${method} ${url.pathname}`;
  } catch {
    spanName = `${method} oauth_${ctx.operation}`;
  }

  // Extract parent context from traceparent if provided
  let parentContext = context.active();
  if (ctx.traceparent) {
    const carrier = { traceparent: ctx.traceparent };
    parentContext = propagation.extract(ROOT_CONTEXT, carrier);
  }

  // Build attributes - start with standard HTTP attributes
  const attributes: Record<string, string | number | string[]> = {
    ...extractHttpAttributes(ctx.url, method),
    [OAuthAttributes.OPERATION]: ctx.operation,
  };

  if (ctx.grantType) {
    attributes[OAuthAttributes.GRANT_TYPE] = ctx.grantType;
  }

  if (ctx.clientId) {
    attributes[OAuthAttributes.CLIENT_ID] = redactClientId(ctx.clientId);
  }

  if (ctx.scopes && ctx.scopes.length > 0) {
    attributes[OAuthAttributes.SCOPES] = ctx.scopes;
  }

  if (ctx.providerType) {
    attributes[OAuthAttributes.PROVIDER_TYPE] = ctx.providerType;
  }

  const spanCallback = async (span: Span): Promise<T> => {
    try {
      const value = await fn(span);

      // Set response attributes if extractor provided
      if (resultExtractor) {
        const result = resultExtractor(value);
        setOAuthResponseAttributes(span, result);
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
    parentContext,
    spanCallback,
  );
}

/**
 * Set response attributes on an OAuth span after completion.
 */
function setOAuthResponseAttributes(span: Span, result: OAuthSpanResult): void {
  if (result.httpStatusCode !== undefined) {
    span.setAttribute(HttpAttributes.RESPONSE_STATUS_CODE, result.httpStatusCode);
  }

  if (result.expiresIn !== undefined) {
    span.setAttribute(OAuthAttributes.EXPIRES_IN, result.expiresIn);
  }

  if (result.cacheHit !== undefined) {
    span.setAttribute(OAuthAttributes.CACHE_HIT, result.cacheHit);
  }
}
