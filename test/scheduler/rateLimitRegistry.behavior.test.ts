import { describe, expect, it, vi } from 'vitest';

import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { getFetchRetryContextMaxRetries } from '../../src/util/fetch/retryContext';

import type { ApiProvider } from '../../src/types/providers';

function createProvider(maxRetries?: unknown): ApiProvider {
  const config =
    maxRetries === undefined
      ? {}
      : {
          maxRetries,
        };
  return {
    id: () => 'test-provider',
    config,
    callApi: vi.fn(),
  } as unknown as ApiProvider;
}

async function runRateLimitedCall(maxRetries?: unknown): Promise<number> {
  const registry = new RateLimitRegistry({
    maxConcurrency: 1,
    queueTimeoutMs: 100,
  });
  const provider = createProvider(maxRetries);
  const callFn = vi.fn().mockResolvedValue({ status: 429 });

  try {
    await expect(
      registry.execute(provider, callFn, {
        isRateLimited: (result) => (result as { status?: number } | undefined)?.status === 429,
        getRetryAfter: () => 0,
      }),
    ).rejects.toThrow('Rate limit exceeded');
  } finally {
    registry.dispose();
  }

  return callFn.mock.calls.length;
}

describe('RateLimitRegistry integration - provider maxRetries', () => {
  it('should propagate provider maxRetries to fetch retry context', async () => {
    const registry = new RateLimitRegistry({
      maxConcurrency: 1,
      queueTimeoutMs: 100,
    });
    const provider = createProvider(0);
    const callFn = vi.fn().mockImplementation(async () => getFetchRetryContextMaxRetries());

    try {
      const contextValue = await registry.execute(provider, callFn);
      expect(contextValue).toBe(0);
    } finally {
      registry.dispose();
    }
  });

  it('should propagate fetch retry context when scheduler is disabled', async () => {
    process.env.PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER = 'true';
    const registry = new RateLimitRegistry({
      maxConcurrency: 1,
      queueTimeoutMs: 100,
    });
    const provider = createProvider(0);
    const callFn = vi.fn().mockImplementation(async () => getFetchRetryContextMaxRetries());

    try {
      const contextValue = await registry.execute(provider, callFn);
      expect(contextValue).toBe(0);
    } finally {
      registry.dispose();
      delete process.env.PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER;
    }
  });

  it('should not retry when provider maxRetries is 0', async () => {
    const attempts = await runRateLimitedCall(0);
    expect(attempts).toBe(1);
  });

  it('should retry provider maxRetries + 1 total attempts', async () => {
    const attempts = await runRateLimitedCall(2);
    expect(attempts).toBe(3);
  });

  it('should parse numeric string maxRetries values', async () => {
    const attempts = await runRateLimitedCall('2');
    expect(attempts).toBe(3);
  });

  it('should use default scheduler retries when provider maxRetries is not set', async () => {
    const attempts = await runRateLimitedCall(undefined);
    expect(attempts).toBe(4);
  });

  it('should ignore invalid negative maxRetries and use default scheduler retries', async () => {
    const attempts = await runRateLimitedCall(-1);
    expect(attempts).toBe(4);
  });

  it('should ignore invalid non-integer string maxRetries values', async () => {
    const attempts = await runRateLimitedCall('2.5');
    expect(attempts).toBe(4);
  });
});
