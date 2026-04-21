import { describe, expect, it } from 'vitest';
import {
  findTargetErrorStatus,
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
