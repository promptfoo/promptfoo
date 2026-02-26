/**
 * Error with additional system information (e.g. Node.js system errors).
 */
export interface SystemError extends Error {
  code?: string;
  cause?: unknown;
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
 * Excluded: 500 (often transient: server crashes, DB timeouts, deployment in progress),
 * 502/503/504 (typically transient gateway issues).
 */
export const NON_TRANSIENT_HTTP_STATUSES = [401, 403, 404, 501] as const;

const NON_TRANSIENT_HTTP_STATUS_SET = new Set<number>(NON_TRANSIENT_HTTP_STATUSES);

export function isNonTransientHttpStatus(status: number): boolean {
  return NON_TRANSIENT_HTTP_STATUS_SET.has(status);
}

/**
 * Detect transient connection errors distinct from rate limits or permanent
 * certificate/config errors.  Only matches errors that are likely to succeed
 * on retry (stale connections, mid-stream resets).  Permanent failures like
 * "self signed certificate", "unable to verify", "unknown ca", or
 * "wrong version number" (HTTPS->HTTP mismatch) are intentionally excluded.
 */
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
