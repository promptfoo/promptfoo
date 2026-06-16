import { sanitizeObject } from '../sanitizer';

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
 * References:
 * - OpenAI: https://platform.openai.com/docs/guides/error-codes/api-errors
 * - Azure OpenAI: https://learn.microsoft.com/en-us/azure/ai-services/openai/reference
 * - Anthropic: https://docs.anthropic.com/en/api/errors
 *
 * Note: Azure OpenAI is known to return `insufficient_quota` for both billing
 * exhaustion AND per-minute deployment quota saturation. The
 * {@link HttpRateLimitError} constructor downgrades a quota code to
 * `rate_limit` when a small `Retry-After` is also present — a billing server
 * has no reason to hint at recovery time.
 */
export const HARD_QUOTA_ERROR_CODES: ReadonlySet<string> = new Set([
  'insufficient_quota',
  'billing_hard_limit_reached',
  'billing_not_active',
  'access_terminated',
  'quota_exceeded',
]);

/**
 * Upper bound for the "server hinted a recovery time, so this isn't billing"
 * heuristic. A server that says "retry in &lt;= 1 hour" is signalling a
 * per-window throttle, not a billing exhaustion. Above 1h we treat a
 * Retry-After as ambiguous and let the body code decide.
 */
const RATE_LIMIT_QUOTA_DOWNGRADE_THRESHOLD_MS = 60 * 60 * 1000;

/**
 * Distinguishes the operational meaning of an HTTP rate-limit response.
 *
 * - `'quota'`     — Daily / billing / contractual exhaustion. Retrying the
 *                   same request will not succeed; surface to the operator
 *                   and stop. Examples: `insufficient_quota`,
 *                   `billing_hard_limit_reached`.
 * - `'rate_limit'`— Per-window (RPM/TPM) throttling. The request is expected
 *                   to succeed once the window rolls; honor `Retry-After` and
 *                   retry with backoff/jitter.
 *
 * Open union: future variants (e.g. `'concurrent_limit'`, `'tier_limit'`)
 * would extend this — exhaustive switches should fall through to the most
 * conservative behavior (treat unknown as rate_limit; don't fail-fast).
 */
export type RateLimitKind = 'quota' | 'rate_limit';

/**
 * Constructor input for {@link HttpRateLimitError}. Notably absent: `kind`.
 * `kind` is derived from `code` so callers cannot create an inconsistent
 * (code, kind) pairing.
 */
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
}

/**
 * Structured error representing a final HTTP rate limit (status 429 or an
 * equivalent header signal) — i.e. retries are exhausted, or the response
 * code indicates a hard quota that should not be retried.
 *
 * Distinguishes:
 * - `kind: 'quota'`     — daily / billing / contractual exhaustion. Don't retry.
 * - `kind: 'rate_limit'` — per-window throttling. Retry honoring `retryAfterMs`.
 *
 * The rendered `message` always contains the kind prefix (`"Rate limit
 * exceeded"` or `"Quota exceeded"`) plus the literal status code. When the
 * status is 429 (the typical construction path) the message also contains
 * `"429"` and the default `"Too Many Requests"` statusText, which is what
 * legacy substring classifiers downstream rely on.
 *
 * The `Http` prefix on the name scopes this to the network transport
 * boundary, distinguishing it from rate-limit-shaped errors in other
 * layers (e.g. an in-process scheduler queue exhausting its budget).
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
    const retryAfterMs =
      typeof init.retryAfterMs === 'number' && init.retryAfterMs >= 0
        ? init.retryAfterMs
        : undefined;

    // A hard-quota body code normally implies `kind: 'quota'`. But Azure
    // OpenAI is known to return `insufficient_quota` for per-minute
    // deployment saturation too; in that case the server hints at recovery
    // via `Retry-After`. Trust that hint: if the wait is short, this is
    // recoverable rate_limit, not billing exhaustion.
    let kind: RateLimitKind = isHardQuotaCode(init.code) ? 'quota' : 'rate_limit';
    if (
      kind === 'quota' &&
      retryAfterMs !== undefined &&
      retryAfterMs <= RATE_LIMIT_QUOTA_DOWNGRADE_THRESHOLD_MS
    ) {
      kind = 'rate_limit';
    }

    const prefix = kind === 'quota' ? 'Quota exceeded' : 'Rate limit exceeded';
    const codeSuffix = init.code ? ` (code: ${init.code})` : '';
    super(`${prefix}: HTTP ${status} ${statusText}${codeSuffix}`);
    this.name = 'HttpRateLimitError';
    this.status = status;
    this.statusText = statusText;
    this.retryAfterMs = retryAfterMs;
    this.resetAt = init.resetAt;
    this.code = init.code;
    this.kind = kind;
    // Shallow-copy reference fields so post-construction mutations on the
    // caller's object don't bleed into the captured error.
    this.headers = init.headers ? { ...init.headers } : undefined;
    this.body = init.body;
  }
}

export function isHardQuotaCode(code: string | undefined): boolean {
  return code !== undefined && HARD_QUOTA_ERROR_CODES.has(code);
}

/**
 * Render the per-window retry-after / reset detail for a structured
 * rate-limit error. Returns empty string when:
 * - No retry metadata is available, OR
 * - The error is a hard quota (`kind === 'quota'`) — retries won't help,
 *   so showing a "retry after Xs" hint would contradict the quota message.
 */
export function formatRateLimitDetail(err: HttpRateLimitError): string {
  if (err.kind === 'quota') {
    return '';
  }
  const parts: string[] = [];
  if (typeof err.retryAfterMs === 'number') {
    parts.push(`retry after ${Math.round(err.retryAfterMs / 1000)}s`);
  } else if (typeof err.resetAt === 'number') {
    const remainingMs = Math.max(err.resetAt - Date.now(), 0);
    if (remainingMs > 0) {
      parts.push(`resets in ${Math.round(remainingMs / 1000)}s`);
    }
  }
  return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
}

/**
 * Render the user-facing error string for a structured rate-limit / quota
 * failure. Single-prefix format (no provider-specific wrapper duplication):
 *
 *   "Rate limit exceeded: HTTP 429 Too Many Requests (code: rate_limit_exceeded) [retry after 7s]"
 *   "Quota exceeded: HTTP 429 Too Many Requests (code: insufficient_quota). Retries will not help — check your billing or daily quota."
 *
 * `details` (optional) is appended verbatim before the kind-specific
 * trailer. Use it to surface upstream-provided context (e.g. an SDK
 * error's full message that names the deployment / token count) that the
 * structured error itself doesn't carry.
 */
export function formatRateLimitErrorMessage(err: HttpRateLimitError, details?: string): string {
  const codePart = err.code ? ` (code: ${err.code})` : '';
  const trailingDetails = details ? ` ${details}` : '';
  if (err.kind === 'quota') {
    return `Quota exceeded: HTTP ${err.status} ${err.statusText}${codePart}${trailingDetails}. Retries will not help — check your billing or daily quota.`;
  }
  const detail = formatRateLimitDetail(err);
  return `Rate limit exceeded: HTTP ${err.status} ${err.statusText}${codePart}${trailingDetails}${detail}`;
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

/**
 * Network-level error codes meaning the connection was refused, reset, or
 * dropped — as opposed to a clean HTTP error response. Proxies, firewalls, and
 * WAFs (e.g. Cloudflare blocking a POST with a 403) typically surface this way:
 * Node/undici reports `TypeError: fetch failed` or `TypeError: terminated` and
 * tucks the real reason into `error.cause`.
 */
const CONNECTION_BLOCK_CODES = new Set([
  'UND_ERR_SOCKET',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'EAI_AGAIN',
]);

/**
 * Hint appended when a request fails at the connection layer, pointing at the
 * common real-world causes instead of leaving users with a bare `terminated`.
 *
 * Worded cause-agnostically: `isConnectionError` matches undici's generic
 * `fetch failed` wrapper and DNS codes (`EAI_AGAIN`), so this hint is also shown
 * for DNS, TLS, and offline failures — not only proxy/firewall blocks. It leads
 * with the proxy/Cloudflare case (the original report, promptfoo#9679) but names
 * the other likely causes so the attribution is not misleading.
 */
export const CONNECTION_BLOCK_HINT =
  'The connection failed before a response was received. Common causes are a network proxy, ' +
  'firewall, or Cloudflare rule blocking the request (for example a 403 on POST), a DNS ' +
  'resolution failure, a TLS/certificate misconfiguration, or no network connectivity. Check ' +
  'your network, DNS, and proxy settings, or try a different network.';

/**
 * Undici's outer message for a connection-layer failure is one of a small set
 * of fixed phrases. Matched with word boundaries so a code-like substring (e.g.
 * the hard-quota code `access_terminated`, which embeds `terminated`) does not
 * trip the connection-block hint. The boundaries still match the wrapped form
 * `Request failed after N retries: TypeError: terminated (Cause: ...)` that
 * `fetchWithRetries` produces, so the real failure path is unaffected.
 */
const CONNECTION_BLOCK_MESSAGE_PATTERN =
  /\b(?:terminated|fetch failed|other side closed|socket hang up)\b/;

/**
 * Detects fetch failures that happened at the connection layer (refused, reset,
 * or dropped) rather than as a parseable HTTP response. Inspects both the outer
 * error and its `cause`, since undici hides the real `code`/`message` in
 * `cause` (the outer error is just `terminated` / `fetch failed`).
 *
 * Related but distinct from {@link isTransientConnectionError}, which decides
 * whether to *retry* (and inspects TLS/EPROTO codes); this one decides whether
 * to show a user-facing network-block hint and additionally reads `error.cause`.
 * Keep the two in sync when adding new connection-layer codes.
 */
export function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  // A rate-limit/quota response is a clean HTTP error, not a dropped
  // connection. Guard it explicitly: a hard-quota code such as
  // `access_terminated` would otherwise embed `terminated` in the message and
  // attach a misleading "check your network" hint to a billing problem.
  if (isHttpRateLimitError(error)) {
    return false;
  }
  const err = error as SystemError;
  const cause = err.cause as SystemError | undefined;
  const codes = [err.code, cause?.code].filter((c): c is string => typeof c === 'string');
  if (codes.some((code) => CONNECTION_BLOCK_CODES.has(code))) {
    return true;
  }
  const haystack = `${err.message ?? ''} ${cause?.message ?? ''}`.toLowerCase();
  return CONNECTION_BLOCK_MESSAGE_PATTERN.test(haystack);
}

/**
 * Renders an error's `cause` for logging. An `Error` cause stringifies to
 * `Name: message` (so a `SocketError` shows its class), other objects are
 * JSON-encoded to avoid a useless `[object Object]`, and primitives stringify
 * directly.
 *
 * Object causes are routed through {@link sanitizeObject} before serializing:
 * this string is interpolated into a plain log message (e.g.
 * `logger.warn(`...: ${describeFetchError(err)}`)`), and the logger only
 * sanitizes its structured *context* argument, not the message text. Dumping a
 * raw object cause could therefore leak secret-bearing fields (auth headers,
 * api keys, cookies) into logs; `sanitizeObject` redacts those and also handles
 * circular references, so a non-Error cause can never write a secret verbatim.
 */
function formatErrorCause(cause: unknown): string {
  if (cause instanceof Error) {
    return String(cause);
  }
  if (typeof cause === 'object' && cause !== null) {
    try {
      return JSON.stringify(sanitizeObject(cause));
    } catch {
      return String(cause);
    }
  }
  return String(cause);
}

/**
 * Formats a fetch/network error's name, message, and the otherwise-hidden
 * `cause` and `code` into a single log-friendly string. Raw interpolation of an
 * `Error` only yields `name: message`, dropping the diagnostic detail. The
 * `code` falls back to `cause.code` because undici reports the real code (e.g.
 * `ECONNREFUSED` on an `AggregateError`) on the cause, not the outer error.
 */
export function formatFetchError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const err = error as SystemError;
  let message = `${err.name}: ${err.message}`;
  if (err.cause !== undefined && err.cause !== null) {
    message += ` (Cause: ${formatErrorCause(err.cause)})`;
  }
  const code = err.code ?? (err.cause as SystemError | undefined)?.code;
  if (code) {
    message += ` (Code: ${code})`;
  }
  return message;
}

/**
 * Like {@link formatFetchError}, but also appends {@link CONNECTION_BLOCK_HINT}
 * when the failure looks like a connection-layer block. Use in catch blocks
 * around outbound requests so users get an actionable message instead of a bare
 * `terminated`.
 */
export function describeFetchError(error: unknown): string {
  const base = formatFetchError(error);
  return isConnectionError(error) ? `${base}\n${CONNECTION_BLOCK_HINT}` : base;
}

/**
 * True when an error represents an aborted/cancelled operation (an AbortController
 * signal firing). Callers use this to suppress expected cancellation rather than
 * treating it as a real failure, so the abort's `.name` must be preserved upstream.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'AbortException');
}
