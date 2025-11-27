import { categorizeError, computeErrorMetrics } from '../../src/metrics/errors';
import type { MetricableResult } from '../../src/metrics/types';

describe('categorizeError', () => {
  it('should categorize timeout errors', () => {
    expect(categorizeError('Request timeout')).toBe('timeout');
    expect(categorizeError('Connection timed out')).toBe('timeout');
    expect(categorizeError('TIMEOUT: operation exceeded limit')).toBe('timeout');
  });

  it('should categorize rate limit errors', () => {
    expect(categorizeError('Rate limit exceeded')).toBe('rate_limit');
    expect(categorizeError('HTTP 429: Too Many Requests')).toBe('rate_limit');
    expect(categorizeError('Error 429')).toBe('rate_limit');
    expect(categorizeError('too many requests, please slow down')).toBe('rate_limit');
  });

  it('should categorize auth errors', () => {
    expect(categorizeError('HTTP 401 Unauthorized')).toBe('auth');
    expect(categorizeError('403 Forbidden')).toBe('auth');
    expect(categorizeError('Error code: 401')).toBe('auth');
  });

  it('should categorize server errors', () => {
    expect(categorizeError('HTTP 500 Internal Server Error')).toBe('server_error');
    expect(categorizeError('502 Bad Gateway')).toBe('server_error');
    expect(categorizeError('Service unavailable (503)')).toBe('server_error');
  });

  it('should categorize network errors', () => {
    expect(categorizeError('Network error occurred')).toBe('network');
    expect(categorizeError('ECONNREFUSED: Connection refused')).toBe('network');
    expect(categorizeError('getaddrinfo ENOTFOUND api.example.com')).toBe('network');
  });

  it('should categorize unknown errors as other', () => {
    expect(categorizeError('Something went wrong')).toBe('other');
    expect(categorizeError('Invalid JSON response')).toBe('other');
    expect(categorizeError('Unexpected error')).toBe('other');
  });

  it('should be case insensitive', () => {
    expect(categorizeError('TIMEOUT')).toBe('timeout');
    expect(categorizeError('RATE LIMIT')).toBe('rate_limit');
    expect(categorizeError('NETWORK ERROR')).toBe('network');
  });
});

describe('computeErrorMetrics', () => {
  it('should return empty metrics for empty results', () => {
    const metrics = computeErrorMetrics([]);
    expect(metrics).toEqual({
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

  it('should return empty metrics when no errors', () => {
    const results: MetricableResult[] = [
      { success: true, latencyMs: 100 },
      { success: true, latencyMs: 200 },
    ];
    const metrics = computeErrorMetrics(results);
    expect(metrics.total).toBe(0);
    expect(metrics.types).toEqual([]);
  });

  it('should count and categorize errors correctly', () => {
    const results: MetricableResult[] = [
      { success: false, latencyMs: 0, error: 'Request timeout' },
      { success: false, latencyMs: 0, error: 'Connection timed out' },
      { success: false, latencyMs: 0, error: 'Rate limit exceeded' },
      { success: true, latencyMs: 100 },
      { success: false, latencyMs: 0, error: 'Unknown error' },
    ];
    const metrics = computeErrorMetrics(results);
    expect(metrics).toEqual({
      total: 4,
      types: ['other', 'rate_limit', 'timeout'],
      breakdown: {
        timeout: 2,
        rate_limit: 1,
        auth: 0,
        server_error: 0,
        network: 0,
        other: 1,
      },
    });
  });

  it('should only include non-zero error types in types array', () => {
    const results: MetricableResult[] = [
      { success: false, latencyMs: 0, error: 'HTTP 500' },
      { success: false, latencyMs: 0, error: 'HTTP 502' },
    ];
    const metrics = computeErrorMetrics(results);
    expect(metrics.types).toEqual(['server_error']);
  });

  it('should sort types alphabetically', () => {
    const results: MetricableResult[] = [
      { success: false, latencyMs: 0, error: 'timeout' },
      { success: false, latencyMs: 0, error: '401 unauthorized' },
      { success: false, latencyMs: 0, error: 'network error' },
    ];
    const metrics = computeErrorMetrics(results);
    expect(metrics.types).toEqual(['auth', 'network', 'timeout']);
  });
});
