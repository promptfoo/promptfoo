import { describe, expect, it } from 'vitest';
import { categorizeError, computeErrorStats } from '../../src/runStats/errors';
import type { StatableResult } from '../../src/runStats/types';

describe('categorizeError', () => {
  it('should categorize timeout errors', () => {
    expect(categorizeError('Request timeout')).toBe('timeout');
    expect(categorizeError('Connection timed out')).toBe('timeout');
    expect(categorizeError('TIMEOUT: Operation took too long')).toBe('timeout');
    expect(categorizeError('ETIMEDOUT: Connection timed out')).toBe('timeout');
  });

  it('should categorize rate limit errors', () => {
    expect(categorizeError('Rate limit exceeded')).toBe('rate_limit');
    expect(categorizeError('Error 429: Too Many Requests')).toBe('rate_limit');
    expect(categorizeError('too many requests, please slow down')).toBe('rate_limit');
    expect(categorizeError('Request throttled')).toBe('rate_limit');
    expect(categorizeError('rate_limit exceeded')).toBe('rate_limit');
  });

  it('should categorize auth errors', () => {
    expect(categorizeError('401 Unauthorized')).toBe('auth');
    expect(categorizeError('403 Forbidden')).toBe('auth');
    expect(categorizeError('Error: Invalid API key (401)')).toBe('auth');
    expect(categorizeError('Authentication failed')).toBe('auth');
    expect(categorizeError('Unauthorized access')).toBe('auth');
  });

  it('should NOT categorize 401k as auth error (false positive prevention)', () => {
    // This tests the word boundary matching - "401k" should NOT match auth
    expect(categorizeError('User has 401k retirement plan')).toBe('other');
    expect(categorizeError('Error processing 401k data')).toBe('other');
  });

  it('should categorize server errors', () => {
    expect(categorizeError('500 Internal Server Error')).toBe('server_error');
    expect(categorizeError('502 Bad Gateway')).toBe('server_error');
    expect(categorizeError('503 Service Unavailable')).toBe('server_error');
  });

  it('should categorize network errors', () => {
    expect(categorizeError('Network error occurred')).toBe('network');
    expect(categorizeError('ECONNREFUSED: Connection refused')).toBe('network');
    expect(categorizeError('ENOTFOUND: DNS lookup failed')).toBe('network');
    expect(categorizeError('ECONNRESET: Connection reset')).toBe('network');
    expect(categorizeError('socket hang up')).toBe('network');
    expect(categorizeError('DNS resolution failed')).toBe('network');
  });

  it('should categorize unknown errors as other', () => {
    expect(categorizeError('Something went wrong')).toBe('other');
    expect(categorizeError('Invalid JSON response')).toBe('other');
    expect(categorizeError('')).toBe('other');
  });

  it('should be case-insensitive', () => {
    expect(categorizeError('TIMEOUT')).toBe('timeout');
    expect(categorizeError('Rate Limit')).toBe('rate_limit');
    expect(categorizeError('NETWORK ERROR')).toBe('network');
  });

  it('should prioritize first matching category', () => {
    // If an error contains multiple keywords, first match wins
    // 'timeout' is checked before 'rate_limit'
    expect(categorizeError('timeout due to rate limit')).toBe('timeout');
  });
});

describe('computeErrorStats', () => {
  it('should return zeros for empty results', () => {
    const stats = computeErrorStats([]);
    expect(stats).toEqual({
      total: 0,
      types: [],
      breakdown: {
        timeout: 0,
        rate_limit: 0,
        auth: 0,
        server_error: 0,
        network: 0,
        other: 0,
      },
    });
  });

  it('should return zeros when no errors', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100 },
      { success: true, latencyMs: 200 },
    ];
    const stats = computeErrorStats(results);
    expect(stats.total).toBe(0);
    expect(stats.types).toEqual([]);
  });

  it('should count and categorize errors', () => {
    const results: StatableResult[] = [
      { success: false, latencyMs: 100, error: 'Request timeout' },
      { success: false, latencyMs: 200, error: 'Rate limit exceeded' },
      { success: false, latencyMs: 300, error: 'Another timeout error' },
      { success: true, latencyMs: 400 },
    ];
    const stats = computeErrorStats(results);
    expect(stats.total).toBe(3);
    expect(stats.breakdown.timeout).toBe(2);
    expect(stats.breakdown.rate_limit).toBe(1);
    expect(stats.types).toEqual(['rate_limit', 'timeout']); // sorted alphabetically
  });

  it('should only include non-zero error types in types array', () => {
    const results: StatableResult[] = [
      { success: false, latencyMs: 100, error: '500 Internal Server Error' },
      { success: false, latencyMs: 200, error: '502 Bad Gateway' },
    ];
    const stats = computeErrorStats(results);
    expect(stats.types).toEqual(['server_error']);
    expect(stats.breakdown.server_error).toBe(2);
  });

  it('should handle null error field', () => {
    const results: StatableResult[] = [
      { success: false, latencyMs: 100, error: null },
      { success: false, latencyMs: 200, error: 'Real error' },
    ];
    const stats = computeErrorStats(results);
    // null error should not be counted
    expect(stats.total).toBe(1);
  });

  it('should handle empty string error', () => {
    const results: StatableResult[] = [{ success: false, latencyMs: 100, error: '' }];
    const stats = computeErrorStats(results);
    // Empty string is truthy for the filter, categorized as 'other'
    expect(stats.total).toBe(0); // empty string is falsy
  });

  it('should count all error categories correctly', () => {
    const results: StatableResult[] = [
      { success: false, latencyMs: 100, error: 'timeout' },
      { success: false, latencyMs: 100, error: '429 rate limit' },
      { success: false, latencyMs: 100, error: '401 unauthorized' },
      { success: false, latencyMs: 100, error: '500 server error' },
      { success: false, latencyMs: 100, error: 'ECONNREFUSED' },
      { success: false, latencyMs: 100, error: 'unknown error' },
    ];
    const stats = computeErrorStats(results);
    expect(stats.total).toBe(6);
    expect(stats.breakdown).toEqual({
      timeout: 1,
      rate_limit: 1,
      auth: 1,
      server_error: 1,
      network: 1,
      other: 1,
    });
    expect(stats.types.sort()).toEqual([
      'auth',
      'network',
      'other',
      'rate_limit',
      'server_error',
      'timeout',
    ]);
  });
});
