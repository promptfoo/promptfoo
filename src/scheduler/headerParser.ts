export interface ParsedRateLimitHeaders {
  remainingRequests?: number;
  remainingTokens?: number;
  limitRequests?: number;
  limitTokens?: number;
  resetAt?: number; // Absolute Unix timestamp in milliseconds
  retryAfterMs?: number; // Relative duration in milliseconds
}

// ============================================================================
// Header names by provider
// ============================================================================

// OpenAI-style headers (also used by Azure, many OpenAI-compatible APIs)
const OPENAI_HEADERS = {
  remainingRequests: 'x-ratelimit-remaining-requests',
  remainingTokens: 'x-ratelimit-remaining-tokens',
  limitRequests: 'x-ratelimit-limit-requests',
  limitTokens: 'x-ratelimit-limit-tokens',
  resetRequests: 'x-ratelimit-reset-requests',
  resetTokens: 'x-ratelimit-reset-tokens',
} as const;

// Anthropic-style headers
const ANTHROPIC_HEADERS = {
  remainingRequests: 'anthropic-ratelimit-requests-remaining',
  remainingTokens: 'anthropic-ratelimit-tokens-remaining',
  limitRequests: 'anthropic-ratelimit-requests-limit',
  limitTokens: 'anthropic-ratelimit-tokens-limit',
  reset: 'anthropic-ratelimit-requests-reset',
} as const;

// Standard/generic headers (RFC 6585 style)
const STANDARD_HEADERS = {
  remaining: 'ratelimit-remaining',
  limit: 'ratelimit-limit',
  reset: 'ratelimit-reset',
  // Fallback variants
  remainingAlt: 'x-ratelimit-remaining',
  limitAlt: 'x-ratelimit-limit',
  resetAlt: 'x-ratelimit-reset',
} as const;

/**
 * Parse rate limit headers from response.
 */
export function parseRateLimitHeaders(headers: Record<string, string>): ParsedRateLimitHeaders {
  const result: ParsedRateLimitHeaders = {};
  const h = lowercaseKeys(headers);

  // --- Remaining counts (ordered: OpenAI, Anthropic, Standard) ---
  result.remainingRequests = parseFirstMatch(h, [
    OPENAI_HEADERS.remainingRequests,
    ANTHROPIC_HEADERS.remainingRequests,
    STANDARD_HEADERS.remainingAlt,
    STANDARD_HEADERS.remaining,
  ]);

  result.remainingTokens = parseFirstMatch(h, [
    OPENAI_HEADERS.remainingTokens,
    ANTHROPIC_HEADERS.remainingTokens,
  ]);

  // --- Limits (ordered: OpenAI, Anthropic, Standard) ---
  result.limitRequests = parseFirstMatch(h, [
    OPENAI_HEADERS.limitRequests,
    ANTHROPIC_HEADERS.limitRequests,
    STANDARD_HEADERS.limitAlt,
    STANDARD_HEADERS.limit,
  ]);

  result.limitTokens = parseFirstMatch(h, [
    OPENAI_HEADERS.limitTokens,
    ANTHROPIC_HEADERS.limitTokens,
  ]);

  // --- Reset time (ordered: OpenAI, Anthropic, Standard) ---
  for (const name of [
    OPENAI_HEADERS.resetRequests,
    OPENAI_HEADERS.resetTokens,
    ANTHROPIC_HEADERS.reset,
    STANDARD_HEADERS.resetAlt,
    STANDARD_HEADERS.reset,
  ]) {
    if (h[name] !== undefined) {
      const parsed = parseResetTime(h[name]);
      if (parsed !== null) {
        result.resetAt = parsed;
        break;
      }
    }
  }

  // --- Retry-After ---
  if (h['retry-after-ms'] !== undefined) {
    const ms = parseInt(h['retry-after-ms'], 10);
    // Accept 0 as valid (means "retry immediately")
    if (!isNaN(ms) && ms >= 0) {
      result.retryAfterMs = ms;
      if (result.resetAt === undefined) {
        result.resetAt = Date.now() + ms;
      }
    }
  } else if (h['retry-after'] !== undefined) {
    const parsed = parseRetryAfter(h['retry-after']);
    if (parsed !== null) {
      result.retryAfterMs = parsed;
      if (result.resetAt === undefined) {
        result.resetAt = Date.now() + parsed;
      }
    }
  }

  return result;
}

/**
 * Parse Retry-After header value.
 * Returns duration in milliseconds.
 * Exported for integration use.
 */
export function parseRetryAfter(value: string): number | null {
  // Try as integer seconds (must be non-negative)
  const seconds = parseInt(value, 10);
  if (!isNaN(seconds) && seconds >= 0 && String(seconds) === value.trim()) {
    return seconds * 1000;
  }

  // Try HTTP-date format
  const httpDate = parseHttpDate(value);
  if (httpDate !== null) {
    return Math.max(0, httpDate - Date.now());
  }

  return null;
}

function parseFirstMatch(headers: Record<string, string>, names: string[]): number | undefined {
  for (const name of names) {
    const value = headers[name];
    if (value !== undefined) {
      const num = parseInt(value, 10);
      if (!isNaN(num) && num >= 0) {
        return num;
      }
    }
  }
  return undefined;
}

/**
 * Parse reset time from various formats.
 * Returns absolute Unix timestamp in milliseconds.
 */
function parseResetTime(value: string): number | null {
  // Try duration format first (e.g., "1s", "100ms", "1m30s")
  const durationMs = parseDuration(value);
  if (durationMs !== null) {
    return Date.now() + durationMs;
  }

  // Try as numeric
  const num = parseFloat(value);
  if (!isNaN(num)) {
    // Disambiguate by magnitude:
    // - < 1 billion: relative seconds
    // - 1-10 billion: Unix seconds (10 digits)
    // - > 10 billion: Unix milliseconds (13 digits)
    if (num < 1_000_000_000) {
      return Date.now() + num * 1000;
    } else if (num < 10_000_000_000) {
      return num * 1000;
    } else {
      return num;
    }
  }

  // Try HTTP-date format
  const httpDate = parseHttpDate(value);
  if (httpDate !== null) {
    return httpDate;
  }

  return null;
}

/**
 * Parse HTTP-date format (RFC 7231).
 */
function parseHttpDate(value: string): number | null {
  const timestamp = Date.parse(value);
  if (!isNaN(timestamp)) {
    // Sanity check: within reasonable range (not too far past or future)
    const now = Date.now();
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    if (timestamp > now - oneYearMs && timestamp < now + oneYearMs) {
      return timestamp;
    }
  }
  return null;
}

/**
 * Parse duration strings like "1s", "100ms", "1m30s", "1h30s", "2h15m30s".
 *
 * Supported formats:
 * - Xms (milliseconds)
 * - Xs or X.Xs (seconds)
 * - Xm or XmYs (minutes with optional seconds)
 * - Xh or XhYm or XhYs or XhYmZs (hours with optional minutes/seconds)
 */
function parseDuration(value: string): number | null {
  // Try comprehensive pattern: optional h, optional m, optional s/ms
  // Each component is optional, but at least one must be present
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:(\d+(?:\.\d+)?)(ms|s))?$/);

  if (!match) {
    return null;
  }

  const [, hours, minutes, secondsValue, secondsUnit] = match;

  // At least one component must be present
  if (!hours && !minutes && !secondsValue) {
    return null;
  }

  let ms = 0;

  if (hours) {
    ms += parseInt(hours, 10) * 3600_000;
  }
  if (minutes) {
    ms += parseInt(minutes, 10) * 60_000;
  }
  if (secondsValue) {
    const num = parseFloat(secondsValue);
    ms += secondsUnit === 'ms' ? num : num * 1000;
  }

  return ms;
}

function lowercaseKeys(obj: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key.toLowerCase()] = value;
  }
  return result;
}
