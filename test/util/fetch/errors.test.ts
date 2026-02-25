import { describe, expect, it } from 'vitest';
import {
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

  it('returns true for 500 Internal Server Error', () => {
    expect(isNonTransientHttpStatus(500)).toBe(true);
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
