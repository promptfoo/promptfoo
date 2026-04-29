import { describe, expect, it } from 'vitest';
import {
  extractRateLimitErrorCode,
  findTargetErrorStatus,
  formatRateLimitDetail,
  formatRateLimitErrorMessage,
  HttpRateLimitError,
  isHardQuotaCode,
  isHttpRateLimitError,
  isNonTransientHttpStatus,
  isTransientConnectionError,
} from '../../../src/util/fetch/errors';

describe('isNonTransientHttpStatus', () => {
  it('returns true for 401 Unauthorized', () => {
    expect(isNonTransientHttpStatus(401)).toBe(true);
  });

  it('returns true for 403 Forbidden', () => {
    expect(isNonTransientHttpStatus(403)).toBe(true);
  });

  it('returns true for 404 Not Found', () => {
    expect(isNonTransientHttpStatus(404)).toBe(true);
  });

  it('returns false for 500 Internal Server Error (transient)', () => {
    expect(isNonTransientHttpStatus(500)).toBe(false);
  });

  it('returns true for 501 Not Implemented', () => {
    expect(isNonTransientHttpStatus(501)).toBe(true);
  });

  it('returns false for 200 OK', () => {
    expect(isNonTransientHttpStatus(200)).toBe(false);
  });

  it('returns false for 201 Created', () => {
    expect(isNonTransientHttpStatus(201)).toBe(false);
  });

  it('returns false for 429 Too Many Requests (transient)', () => {
    expect(isNonTransientHttpStatus(429)).toBe(false);
  });

  it('returns false for 502 Bad Gateway (transient)', () => {
    expect(isNonTransientHttpStatus(502)).toBe(false);
  });

  it('returns false for 503 Service Unavailable (transient)', () => {
    expect(isNonTransientHttpStatus(503)).toBe(false);
  });

  it('returns false for 504 Gateway Timeout (transient)', () => {
    expect(isNonTransientHttpStatus(504)).toBe(false);
  });
});

describe('findTargetErrorStatus', () => {
  it('returns undefined for empty results', () => {
    expect(findTargetErrorStatus([])).toBeUndefined();
  });

  it('returns undefined when no HTTP status in results', () => {
    const results = [{ response: {} }, { response: { metadata: {} } }];
    expect(findTargetErrorStatus(results)).toBeUndefined();
  });

  it('returns undefined for successful HTTP status', () => {
    const results = [{ response: { metadata: { http: { status: 200 } } } }];
    expect(findTargetErrorStatus(results)).toBeUndefined();
  });

  it('returns undefined for transient errors (429, 502, 503, 504)', () => {
    const results = [
      { response: { metadata: { http: { status: 429 } } } },
      { response: { metadata: { http: { status: 502 } } } },
      { response: { metadata: { http: { status: 503 } } } },
      { response: { metadata: { http: { status: 504 } } } },
    ];
    expect(findTargetErrorStatus(results)).toBeUndefined();
  });

  it('returns 401 for unauthorized error', () => {
    const results = [
      { response: { metadata: { http: { status: 200 } } } },
      { response: { metadata: { http: { status: 401 } } } },
    ];
    expect(findTargetErrorStatus(results)).toBe(401);
  });

  it('returns 403 for forbidden error', () => {
    const results = [{ response: { metadata: { http: { status: 403 } } } }];
    expect(findTargetErrorStatus(results)).toBe(403);
  });

  it('returns 404 for not found error', () => {
    const results = [{ response: { metadata: { http: { status: 404 } } } }];
    expect(findTargetErrorStatus(results)).toBe(404);
  });

  it('returns undefined for 500 Internal Server Error (transient)', () => {
    const results = [{ response: { metadata: { http: { status: 500 } } } }];
    expect(findTargetErrorStatus(results)).toBeUndefined();
  });

  it('returns 501 for not implemented error', () => {
    const results = [{ response: { metadata: { http: { status: 501 } } } }];
    expect(findTargetErrorStatus(results)).toBe(501);
  });

  it('returns first non-transient error found', () => {
    const results = [
      { response: { metadata: { http: { status: 200 } } } },
      { response: { metadata: { http: { status: 403 } } } },
      { response: { metadata: { http: { status: 404 } } } },
    ];
    expect(findTargetErrorStatus(results)).toBe(403);
  });
});

describe('isTransientConnectionError', () => {
  it('returns false for undefined error', () => {
    expect(isTransientConnectionError(undefined)).toBe(false);
  });

  it('returns true for ECONNRESET errors', () => {
    const error = new Error('Connection reset') as Error & { code?: string };
    error.code = 'ECONNRESET';
    expect(isTransientConnectionError(error)).toBe(true);
  });

  it('returns true for EPIPE errors', () => {
    const error = new Error('Broken pipe') as Error & { code?: string };
    error.code = 'EPIPE';
    expect(isTransientConnectionError(error)).toBe(true);
  });

  it('returns true for socket hang up errors', () => {
    const error = new Error('socket hang up');
    expect(isTransientConnectionError(error)).toBe(true);
  });

  it('returns true for bad record mac errors', () => {
    const error = new Error('bad record mac');
    expect(isTransientConnectionError(error)).toBe(true);
  });

  it('returns false for permanent TLS config errors', () => {
    const error = new Error('eproto self signed certificate');
    expect(isTransientConnectionError(error)).toBe(false);
  });

  it('returns false for wrong version number errors', () => {
    const error = new Error('eproto wrong version number');
    expect(isTransientConnectionError(error)).toBe(false);
  });
});

describe('isHardQuotaCode', () => {
  it.each([
    ['insufficient_quota', true],
    ['billing_hard_limit_reached', true],
    ['billing_not_active', true],
    ['access_terminated', true],
    ['quota_exceeded', true],
    ['rate_limit_exceeded', false],
    ['tokens_per_min', false],
    ['', false],
  ])('isHardQuotaCode(%s) === %s', (code, expected) => {
    expect(isHardQuotaCode(code as string)).toBe(expected);
  });

  it('returns false for undefined', () => {
    expect(isHardQuotaCode(undefined)).toBe(false);
  });
});

describe('extractRateLimitErrorCode', () => {
  it('extracts OpenAI / Azure shape: { error: { code } }', () => {
    expect(
      extractRateLimitErrorCode({
        error: { code: 'insufficient_quota', message: 'You exceeded your current quota' },
      }),
    ).toBe('insufficient_quota');
  });

  it('falls back to error.type when error.code is missing', () => {
    expect(extractRateLimitErrorCode({ error: { type: 'rate_limit_error' } })).toBe(
      'rate_limit_error',
    );
  });

  it('reads top-level code', () => {
    expect(extractRateLimitErrorCode({ code: 'tokens_per_min' })).toBe('tokens_per_min');
  });

  it('reads top-level type', () => {
    expect(extractRateLimitErrorCode({ type: 'rate_limit_error' })).toBe('rate_limit_error');
  });

  it('returns undefined for non-object', () => {
    expect(extractRateLimitErrorCode('plain text')).toBeUndefined();
    expect(extractRateLimitErrorCode(null)).toBeUndefined();
    expect(extractRateLimitErrorCode(undefined)).toBeUndefined();
    expect(extractRateLimitErrorCode(123)).toBeUndefined();
  });

  it('returns undefined when no code-like field is present', () => {
    expect(extractRateLimitErrorCode({ error: {} })).toBeUndefined();
    expect(extractRateLimitErrorCode({})).toBeUndefined();
  });

  it('ignores empty string code', () => {
    expect(extractRateLimitErrorCode({ error: { code: '' } })).toBeUndefined();
  });
});

describe('HttpRateLimitError', () => {
  it('classifies known quota codes as kind="quota"', () => {
    const err = new HttpRateLimitError({ status: 429, code: 'insufficient_quota' });
    expect(err.kind).toBe('quota');
    expect(err.message).toContain('Quota exceeded');
    expect(err.message).toContain('429');
    expect(err.message).toContain('insufficient_quota');
  });

  it('classifies unknown / per-window codes as kind="rate_limit"', () => {
    const err = new HttpRateLimitError({ status: 429, code: 'rate_limit_exceeded' });
    expect(err.kind).toBe('rate_limit');
    expect(err.message).toContain('Rate limit exceeded');
    expect(err.message).toContain('429');
  });

  it('preserves status, retryAfterMs, resetAt, headers, body', () => {
    const err = new HttpRateLimitError({
      status: 429,
      statusText: 'Too Many Requests',
      retryAfterMs: 5000,
      resetAt: 1_700_000_000_000,
      headers: { 'retry-after': '5' },
      body: { error: { code: 'rate_limit_exceeded' } },
      code: 'rate_limit_exceeded',
    });
    expect(err.status).toBe(429);
    expect(err.statusText).toBe('Too Many Requests');
    expect(err.retryAfterMs).toBe(5000);
    expect(err.resetAt).toBe(1_700_000_000_000);
    expect(err.headers?.['retry-after']).toBe('5');
    expect(err.body).toEqual({ error: { code: 'rate_limit_exceeded' } });
    expect(err.code).toBe('rate_limit_exceeded');
  });

  it('defaults statusText to "Too Many Requests"', () => {
    const err = new HttpRateLimitError({ status: 429 });
    expect(err.statusText).toBe('Too Many Requests');
  });

  it('produces a message containing the substrings legacy classifiers match on', () => {
    const err = new HttpRateLimitError({ status: 429, code: 'rate_limit_exceeded' });
    const lowered = err.message.toLowerCase();
    // Back-compat: substring matchers across the codebase look for these tokens
    expect(err.message).toContain('429');
    expect(lowered.includes('rate limit') || lowered.includes('too many requests')).toBe(true);
  });

  it('isHttpRateLimitError type guard works', () => {
    expect(isHttpRateLimitError(new HttpRateLimitError({ status: 429 }))).toBe(true);
    expect(isHttpRateLimitError(new Error('rate limit'))).toBe(false);
    expect(isHttpRateLimitError(undefined)).toBe(false);
    expect(isHttpRateLimitError(null)).toBe(false);
    expect(isHttpRateLimitError({ name: 'HttpRateLimitError' })).toBe(false);
  });

  it('shallow-copies headers so post-construction mutation does not leak in', () => {
    const headers = { 'retry-after': '5' };
    const err = new HttpRateLimitError({ status: 429, headers });
    headers['retry-after'] = '999';
    expect(err.headers?.['retry-after']).toBe('5');
  });

  it('rejects negative retryAfterMs', () => {
    const err = new HttpRateLimitError({ status: 429, retryAfterMs: -100 });
    expect(err.retryAfterMs).toBeUndefined();
  });
});

describe('formatRateLimitDetail', () => {
  it('renders retry-after seconds', () => {
    const err = new HttpRateLimitError({ status: 429, retryAfterMs: 12_000 });
    expect(formatRateLimitDetail(err)).toBe(' [retry after 12s]');
  });

  it('renders resetAt fallback when retryAfterMs is missing', () => {
    const err = new HttpRateLimitError({
      status: 429,
      resetAt: Date.now() + 30_000,
    });
    expect(formatRateLimitDetail(err)).toMatch(/resets in \d+s/);
  });

  it('returns empty string when no metadata is present', () => {
    const err = new HttpRateLimitError({ status: 429 });
    expect(formatRateLimitDetail(err)).toBe('');
  });

  it('returns empty string for kind=quota even when retry metadata is present', () => {
    // Quota errors should not advertise a "retry after Xs" hint — that
    // would contradict the "Retries will not help" message the providers
    // surface to the operator. Use a 2-hour retryAfterMs so the constructor's
    // "small Retry-After downgrades quota to rate_limit" heuristic does not
    // fire here.
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const err = new HttpRateLimitError({
      status: 429,
      code: 'insufficient_quota',
      retryAfterMs: twoHoursMs,
      resetAt: Date.now() + twoHoursMs,
    });
    expect(err.kind).toBe('quota');
    expect(formatRateLimitDetail(err)).toBe('');
  });
});

describe('HttpRateLimitError: small Retry-After downgrades quota to rate_limit', () => {
  // Azure OpenAI returns `insufficient_quota` for both billing exhaustion and
  // per-minute deployment saturation. A small Retry-After is the server
  // hinting at recovery — billing quotas don't recover in seconds.
  it('downgrades insufficient_quota with small retryAfterMs to rate_limit', () => {
    const err = new HttpRateLimitError({
      status: 429,
      code: 'insufficient_quota',
      retryAfterMs: 30_000,
    });
    expect(err.kind).toBe('rate_limit');
    expect(err.code).toBe('insufficient_quota');
    expect(err.message).toContain('Rate limit exceeded');
  });

  it('keeps kind=quota when no Retry-After is present', () => {
    const err = new HttpRateLimitError({ status: 429, code: 'insufficient_quota' });
    expect(err.kind).toBe('quota');
  });

  it('keeps kind=quota when Retry-After is large (> 1h)', () => {
    const err = new HttpRateLimitError({
      status: 429,
      code: 'insufficient_quota',
      retryAfterMs: 90 * 60 * 1000,
    });
    expect(err.kind).toBe('quota');
  });

  it('downgrades all hard-quota codes when Retry-After is small', () => {
    for (const code of ['quota_exceeded', 'billing_hard_limit_reached', 'insufficient_quota']) {
      const err = new HttpRateLimitError({ status: 429, code, retryAfterMs: 5000 });
      expect(err.kind).toBe('rate_limit');
    }
  });
});

describe('formatRateLimitErrorMessage', () => {
  it('formats a per-window rate limit with status, code, and retry-after', () => {
    const err = new HttpRateLimitError({
      status: 429,
      code: 'rate_limit_exceeded',
      retryAfterMs: 7000,
    });
    expect(formatRateLimitErrorMessage(err)).toBe(
      'Rate limit exceeded: HTTP 429 Too Many Requests (code: rate_limit_exceeded) [retry after 7s]',
    );
  });

  it('formats a hard quota with the non-retryable hint', () => {
    const err = new HttpRateLimitError({
      status: 429,
      code: 'insufficient_quota',
    });
    expect(formatRateLimitErrorMessage(err)).toBe(
      'Quota exceeded: HTTP 429 Too Many Requests (code: insufficient_quota). Retries will not help — check your billing or daily quota.',
    );
  });

  it('omits the code segment when no code is set', () => {
    const err = new HttpRateLimitError({ status: 429 });
    expect(formatRateLimitErrorMessage(err)).toBe(
      'Rate limit exceeded: HTTP 429 Too Many Requests',
    );
  });

  it('appends `details` for upstream-supplied context', () => {
    const err = new HttpRateLimitError({
      status: 429,
      code: 'rate_limit_exceeded',
      retryAfterMs: 12_000,
    });
    const out = formatRateLimitErrorMessage(
      err,
      'Rate limit reached for gpt-4o (current: 1000 TPM)',
    );
    expect(out).toBe(
      'Rate limit exceeded: HTTP 429 Too Many Requests (code: rate_limit_exceeded) Rate limit reached for gpt-4o (current: 1000 TPM) [retry after 12s]',
    );
  });

  it('appends `details` before the non-retryable hint on quota errors', () => {
    const err = new HttpRateLimitError({
      status: 429,
      code: 'insufficient_quota',
    });
    expect(formatRateLimitErrorMessage(err, 'Quota exhausted for asst_xyz')).toBe(
      'Quota exceeded: HTTP 429 Too Many Requests (code: insufficient_quota) Quota exhausted for asst_xyz. Retries will not help — check your billing or daily quota.',
    );
  });

  it('produces a single non-redundant prefix (no double "Rate limit exceeded")', () => {
    const err = new HttpRateLimitError({ status: 429, code: 'rate_limit_exceeded' });
    const out = formatRateLimitErrorMessage(err);
    expect(out.match(/Rate limit exceeded/g)?.length).toBe(1);
    expect(out.match(/HTTP 429/g)?.length).toBe(1);
  });
});
