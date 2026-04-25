/**
 * Error with additional system information (e.g. Node.js system errors).
 */
export interface SystemError extends Error {
  code?: string;
  cause?: unknown;
}

/**
 * Body-level error codes that indicate a hard quota/billing failure rather than
 * a transient per-window rate limit. Retrying these will not succeed and just
 * amplifies load and cost; callers should fail fast.
 *
 * Sourced from documented OpenAI / Azure OpenAI / Anthropic responses.
 */
export const HARD_QUOTA_ERROR_CODES = new Set([
  'insufficient_quota',
  'billing_hard_limit_reached',
  'billing_not_active',
  'access_terminated',
  'quota_exceeded',
]);

export type RateLimitKind = 'quota' | 'rate_limit';

export interface HttpRateLimitErrorInit {
  status: number;
  statusText?: string;
  /** Parsed `Retry-After` (or equivalent) in milliseconds, if known. */
  retryAfterMs?: number;
  /** Absolute reset timestamp (ms since epoch), if known. */
  resetAt?: number;
  /** Body-level error code (e.g. `insufficient_quota`, `rate_limit_exceeded`). */
  code?: string;
  /** Response headers as a plain object (lowercased keys preferred). */
  headers?: Record<string, string>;
  /** Parsed body — JSON object if parseable, else raw string. */
  body?: unknown;
  /** Optional message override. */
  message?: string;
}

/**
 * Structured error thrown by `fetchWithRetries` when an HTTP rate limit
 * (status 429 or equivalent header signal) is final — i.e. retries are
 * exhausted, or the response code indicates a hard quota that should not
 * be retried.
 *
 * Distinguishes:
 * - `kind: 'quota'`  — daily / billing / contractual exhaustion. Don't retry.
 * - `kind: 'rate_limit'` — per-window throttling. Retry honoring `retryAfterMs`.
 *
 * The `message` always contains the substrings "Rate limit" / "Quota" and "429"
 * so legacy substring-based classifiers continue to match.
 */
export class HttpRateLimitError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly retryAfterMs?: number;
  readonly resetAt?: number;
  readonly code?: string;
  readonly kind: RateLimitKind;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;

  constructor(init: HttpRateLimitErrorInit) {
    const status = init.status;
    const statusText = init.statusText ?? 'Too Many Requests';
    const kind: RateLimitKind = isHardQuotaCode(init.code) ? 'quota' : 'rate_limit';
    const prefix = kind === 'quota' ? 'Quota exceeded' : 'Rate limit exceeded';
    const codeSuffix = init.code ? ` (code: ${init.code})` : '';
    const message = init.message ?? `${prefix}: HTTP ${status} ${statusText}${codeSuffix}`;
    super(message);
    this.name = 'HttpRateLimitError';
    this.status = status;
    this.statusText = statusText;
    this.retryAfterMs = init.retryAfterMs;
    this.resetAt = init.resetAt;
    this.code = init.code;
    this.kind = kind;
    this.headers = init.headers;
    this.body = init.body;
  }
}

export function isHardQuotaCode(code: string | undefined): boolean {
  return code !== undefined && HARD_QUOTA_ERROR_CODES.has(code);
}

export function isHttpRateLimitError(err: unknown): err is HttpRateLimitError {
  return err instanceof HttpRateLimitError;
}

/**
 * Best-effort extraction of an error code from a parsed response body across
 * provider variants (OpenAI / Azure / Anthropic / generic JSON-RPC style).
 */
export function extractRateLimitErrorCode(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const root = body as Record<string, unknown>;

  // OpenAI / Azure OpenAI: { error: { code, type, message } }
  if (typeof root.error === 'object' && root.error !== null) {
    const err = root.error as Record<string, unknown>;
    if (typeof err.code === 'string' && err.code.length > 0) {
      return err.code;
    }
    if (typeof err.type === 'string' && err.type.length > 0) {
      return err.type;
    }
  }

  if (typeof root.code === 'string' && root.code.length > 0) {
    return root.code;
  }
  if (typeof root.type === 'string' && root.type.length > 0) {
    return root.type;
  }
  return undefined;
}

/**
 * Non-transient HTTP status codes that indicate the target is unavailable or misconfigured.
 * These errors will not resolve on retry and should abort the scan immediately.
 *
 * - 401: Unauthorized - authentication required or invalid credentials
 * - 403: Forbidden - valid credentials but access denied
 * - 404: Not Found - target endpoint doesn't exist
 * - 501: Not Implemented - server doesn't support the request method
 *
 * Excluded: 500 (often transient — server crashes, DB timeouts, deployment rollouts,
 * or input-dependent bugs where one prompt triggers it but the next doesn't),
 * 502/503/504 (typically transient gateway issues).
 */
export const NON_TRANSIENT_HTTP_STATUSES = [401, 403, 404, 501] as const;

export function isNonTransientHttpStatus(status: number): boolean {
  return (NON_TRANSIENT_HTTP_STATUSES as readonly number[]).includes(status);
}

/**
 * Detect transient connection errors distinct from rate limits or permanent
 * certificate/config errors.  Only matches errors that are likely to succeed
 * on retry (stale connections, mid-stream resets).  Permanent failures like
 * "self signed certificate", "unable to verify", "unknown ca", or
 * "wrong version number" (HTTPS->HTTP mismatch) are intentionally excluded.
 */
/**
 * Find the first non-transient HTTP error status from evaluation results.
 * Used to detect if a scan was aborted due to target unavailability.
 *
 * @param results - Array of evaluation results to scan
 * @returns The HTTP status code if found, undefined otherwise
 */
export function findTargetErrorStatus(
  results: Array<{ response?: { metadata?: { http?: { status?: number } } } }>,
): number | undefined {
  for (const result of results) {
    const status = result.response?.metadata?.http?.status;
    if (typeof status === 'number' && isNonTransientHttpStatus(status)) {
      return status;
    }
  }
  return undefined;
}

export function isTransientConnectionError(error: Error | undefined): boolean {
  if (!error) {
    return false;
  }

  // Check error.code first — more robust across Node.js versions than
  // parsing error messages, since system errors always set .code.
  const code = (error as SystemError).code;
  if (code === 'ECONNRESET' || code === 'EPIPE') {
    return true;
  }

  const message = (error.message ?? '').toLowerCase();
  // EPROTO can wrap permanent TLS misconfigs. Exclude when paired with
  // known permanent error phrases to avoid futile retries.
  if (
    message.includes('eproto') &&
    (message.includes('wrong version number') ||
      message.includes('self signed') ||
      message.includes('unable to verify') ||
      message.includes('unknown ca') ||
      message.includes('cert'))
  ) {
    return false;
  }
  return (
    message.includes('bad record mac') ||
    message.includes('eproto') ||
    message.includes('econnreset') ||
    message.includes('socket hang up')
  );
}
