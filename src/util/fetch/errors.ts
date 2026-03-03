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
