import { describe, expect, it } from 'vitest';
import { DEFAULT_RETRY_POLICY, getRetryDelay, shouldRetry } from '../../src/scheduler/retryPolicy';

describe('getRetryDelay', () => {
  const policy = { ...DEFAULT_RETRY_POLICY, jitterFactor: 0 }; // No jitter for predictable tests

  it('should return 0 for immediate retry when serverRetryAfterMs is 0', () => {
    const delay = getRetryDelay(1, policy, 0);
    expect(delay).toBe(0);
  });

  it('should use server retry-after when provided', () => {
    const delay = getRetryDelay(1, policy, 5000);
    expect(delay).toBe(5000);
  });

  it('should cap delay at maxDelayMs', () => {
    const delay = getRetryDelay(1, policy, 120000); // 2 minutes
    expect(delay).toBe(policy.maxDelayMs);
  });

  it('should use exponential backoff when no server retry-after', () => {
    const delay1 = getRetryDelay(1, policy, undefined);
    const delay2 = getRetryDelay(2, policy, undefined);
    const delay3 = getRetryDelay(3, policy, undefined);

    // Exponential: baseDelay * 2^attempt
    expect(delay1).toBe(policy.baseDelayMs * 2);
    expect(delay2).toBe(policy.baseDelayMs * 4);
    expect(delay3).toBe(policy.baseDelayMs * 8);
  });

  it('should cap exponential backoff at maxDelayMs', () => {
    const delay = getRetryDelay(10, policy, undefined); // 2^10 = 1024x base
    expect(delay).toBe(policy.maxDelayMs);
  });
});

describe('shouldRetry', () => {
  it('should retry on rate limit error', () => {
    const result = shouldRetry(0, undefined, true, DEFAULT_RETRY_POLICY);
    expect(result).toBe(true);
  });

  it('should not retry after max retries exceeded', () => {
    const result = shouldRetry(
      DEFAULT_RETRY_POLICY.maxRetries,
      undefined,
      true,
      DEFAULT_RETRY_POLICY,
    );
    expect(result).toBe(false);
  });

  it('should retry on rate limit (429 should be detected externally and set isRateLimited=true)', () => {
    // Note: 429 detection happens in the caller, not in shouldRetry
    // The caller should pass isRateLimited=true for 429 errors
    const error = new Error('HTTP 429: Too Many Requests');
    const result = shouldRetry(0, error, true, DEFAULT_RETRY_POLICY);
    expect(result).toBe(true);
  });

  it('should retry on 503 error message', () => {
    const error = new Error('HTTP 503: Service Unavailable');
    const result = shouldRetry(0, error, false, DEFAULT_RETRY_POLICY);
    expect(result).toBe(true);
  });

  it('should not retry on generic error', () => {
    const error = new Error('Some random error');
    const result = shouldRetry(0, error, false, DEFAULT_RETRY_POLICY);
    expect(result).toBe(false);
  });

  it('should handle error with undefined message gracefully', () => {
    // Test edge case where error.message could be undefined
    const error = new Error('placeholder');
    (error as { message: string | undefined }).message = undefined;
    const result = shouldRetry(0, error, false, DEFAULT_RETRY_POLICY);
    expect(result).toBe(false);
  });

  it('should retry on timeout error', () => {
    const error = new Error('Request timeout after 30000ms');
    const result = shouldRetry(0, error, false, DEFAULT_RETRY_POLICY);
    expect(result).toBe(true);
  });

  it('should retry on network error', () => {
    const error = new Error('ECONNRESET');
    const result = shouldRetry(0, error, false, DEFAULT_RETRY_POLICY);
    expect(result).toBe(true);
  });
});
