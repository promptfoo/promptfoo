import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiProvider } from '../../src/types/providers';

const mockProviderRateLimitStateConstructor = vi.fn();
const mockGetRateLimitKey = vi.fn();
const mockGetEnvInt = vi.fn();
const mockGetEnvBool = vi.fn();

type MockProviderState = {
  executeWithRetry: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

let defaultState: MockProviderState;
const queuedStates: MockProviderState[] = [];

vi.mock('../../src/scheduler/providerRateLimitState', () => ({
  ProviderRateLimitState: class {
    executeWithRetry: MockProviderState['executeWithRetry'];
    dispose: MockProviderState['dispose'];

    constructor(options: unknown) {
      mockProviderRateLimitStateConstructor(options);
      const state = queuedStates.shift() ?? defaultState;
      this.executeWithRetry = state.executeWithRetry;
      this.dispose = state.dispose;
    }
  },
}));

vi.mock('../../src/scheduler/rateLimitKey', () => ({
  getRateLimitKey: mockGetRateLimitKey,
}));

vi.mock('../../src/envars', () => ({
  getEnvInt: mockGetEnvInt,
  getEnvBool: mockGetEnvBool,
}));

vi.mock('../../src/logger', () => ({
  __esModule: true,
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logRequestResponse: vi.fn(),
}));

const { RateLimitRegistry, createRateLimitRegistry } = await import(
  '../../src/scheduler/rateLimitRegistry'
);

describe('RateLimitRegistry', () => {
  let provider: ApiProvider;

  beforeEach(() => {
    mockProviderRateLimitStateConstructor.mockReset();
    mockGetRateLimitKey.mockReset();
    mockGetEnvInt.mockReset();
    mockGetEnvBool.mockReset();
    queuedStates.length = 0;
    defaultState = {
      executeWithRetry: vi.fn().mockResolvedValue('result'),
      dispose: vi.fn(),
    };
    provider = {
      id: () => 'test-provider',
      config: {},
      callApi: vi.fn(),
    } as unknown as ApiProvider;
    mockGetRateLimitKey.mockReturnValue('test-provider');
    mockGetEnvInt.mockReturnValue(1);
    mockGetEnvBool.mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('creates a registry with the configured concurrency settings', async () => {
    const registry = createRateLimitRegistry({ maxConcurrency: 10, minConcurrency: 3 });

    await registry.execute(provider, vi.fn());

    expect(registry).toBeInstanceOf(RateLimitRegistry);
    expect(mockProviderRateLimitStateConstructor).toHaveBeenCalledWith({
      rateLimitKey: 'test-provider',
      maxConcurrency: 10,
      minConcurrency: 3,
      queueTimeoutMs: 1,
      onDebug: expect.any(Function),
    });
  });

  it('uses environment defaults for minimum concurrency and queue timeout', async () => {
    mockGetEnvInt.mockReturnValue(2);
    const registry = new RateLimitRegistry({ maxConcurrency: 10 });

    await registry.execute(provider, vi.fn());

    expect(mockGetEnvInt).toHaveBeenCalledWith('PROMPTFOO_MIN_CONCURRENCY', 1);
    expect(mockProviderRateLimitStateConstructor).toHaveBeenCalledWith({
      rateLimitKey: 'test-provider',
      maxConcurrency: 10,
      minConcurrency: 2,
      queueTimeoutMs: 2,
      onDebug: expect.any(Function),
    });
  });

  it('runs calls directly when the adaptive scheduler is disabled', async () => {
    mockGetEnvBool.mockReturnValue(true);
    const registry = new RateLimitRegistry({ maxConcurrency: 10 });
    const call = vi.fn().mockResolvedValue('direct-result');

    await expect(registry.execute(provider, call)).resolves.toBe('direct-result');

    expect(call).toHaveBeenCalledOnce();
    expect(mockProviderRateLimitStateConstructor).not.toHaveBeenCalled();
  });

  it('preserves errors when the adaptive scheduler is disabled', async () => {
    mockGetEnvBool.mockReturnValue(true);
    const registry = new RateLimitRegistry({ maxConcurrency: 10 });

    await expect(
      registry.execute(provider, vi.fn().mockRejectedValue(new Error('request failed'))),
    ).rejects.toThrow('request failed');
  });

  it('passes request classification callbacks to the provider state', async () => {
    const registry = new RateLimitRegistry({ maxConcurrency: 10 });
    const call = vi.fn();
    const getHeaders = vi.fn();
    const isRateLimited = vi.fn();
    const getRetryAfter = vi.fn();

    await registry.execute(provider, call, { getHeaders, isRateLimited, getRetryAfter });

    expect(defaultState.executeWithRetry).toHaveBeenCalledWith('test-provider-1', call, {
      getHeaders,
      isRateLimited,
      getRetryAfter,
      maxRetriesOverride: undefined,
    });
  });

  it.each([
    [0, 0],
    [5, 5],
    ['2', 2],
  ])('preserves the provider retry limit %p', async (configured, expected) => {
    const registry = new RateLimitRegistry({ maxConcurrency: 10 });
    const configuredProvider = {
      ...provider,
      config: { ...provider.config, maxRetries: configured },
    } as ApiProvider;

    await registry.execute(configuredProvider, vi.fn());

    expect(defaultState.executeWithRetry).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ maxRetriesOverride: expected }),
    );
  });

  it.each([
    -1,
    2.5,
    '2.5',
    '1' + '0'.repeat(400),
    String(Number.MAX_SAFE_INTEGER) + '0',
  ])('rejects the invalid provider retry limit %p', async (configured) => {
    const logger = (await import('../../src/logger')).default;
    const warn = vi.mocked(logger.warn);
    warn.mockClear();
    const registry = new RateLimitRegistry({ maxConcurrency: 10 });
    const configuredProvider = {
      ...provider,
      config: { ...provider.config, maxRetries: configured },
    } as ApiProvider;

    await registry.execute(configuredProvider, vi.fn());

    expect(warn).toHaveBeenCalledWith(
      '[RateLimit] Ignoring invalid provider.config.maxRetries; expected a non-negative integer.',
      expect.objectContaining({ maxRetries: configured, providerId: 'test-provider' }),
    );
    expect(defaultState.executeWithRetry).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ maxRetriesOverride: undefined }),
    );
  });

  it('redacts credentials in invalid retry-limit warnings', async () => {
    const logger = (await import('../../src/logger')).default;
    const warn = vi.mocked(logger.warn);
    warn.mockClear();
    const registry = new RateLimitRegistry({ maxConcurrency: 10 });
    const configuredProvider = {
      ...provider,
      id: () => 'https://example.com/api?api_key=secret&model=test',
      config: { maxRetries: -1 },
    } as ApiProvider;

    await registry.execute(configuredProvider, vi.fn());

    const [, context] = warn.mock.calls[0];
    expect(context).toEqual(
      expect.objectContaining({ providerId: expect.stringContaining('api_key=%5BREDACTED%5D') }),
    );
    expect((context as { providerId: string }).providerId).not.toContain('secret');
  });

  it('assigns unique, predictable queue identifiers', async () => {
    const registry = new RateLimitRegistry({ maxConcurrency: 10 });

    await registry.execute(provider, vi.fn());
    await registry.execute(provider, vi.fn());

    expect(defaultState.executeWithRetry.mock.calls.map(([requestId]) => requestId)).toEqual([
      'test-provider-1',
      'test-provider-2',
    ]);
  });

  it('reuses state for repeated requests to the same provider', async () => {
    const registry = new RateLimitRegistry({ maxConcurrency: 10 });

    await registry.execute(provider, vi.fn());
    await registry.execute(provider, vi.fn());

    expect(mockProviderRateLimitStateConstructor).toHaveBeenCalledOnce();
    expect(defaultState.executeWithRetry).toHaveBeenCalledTimes(2);
  });

  it('isolates different provider credentials', async () => {
    const first = { executeWithRetry: vi.fn().mockResolvedValue('first'), dispose: vi.fn() };
    const second = { executeWithRetry: vi.fn().mockResolvedValue('second'), dispose: vi.fn() };
    queuedStates.push(first, second);
    mockGetRateLimitKey
      .mockReturnValueOnce('provider[first]')
      .mockReturnValueOnce('provider[second]');
    const registry = new RateLimitRegistry({ maxConcurrency: 10 });

    await expect(registry.execute(provider, vi.fn())).resolves.toBe('first');
    await expect(registry.execute(provider, vi.fn())).resolves.toBe('second');

    expect(mockProviderRateLimitStateConstructor).toHaveBeenCalledTimes(2);
  });

  it('propagates provider execution failures', async () => {
    defaultState.executeWithRetry.mockRejectedValue(new Error('provider failed'));
    const registry = new RateLimitRegistry({ maxConcurrency: 10 });

    await expect(registry.execute(provider, vi.fn())).rejects.toThrow('provider failed');
  });

  it('disposes every provider state', async () => {
    const first = { executeWithRetry: vi.fn().mockResolvedValue('first'), dispose: vi.fn() };
    const second = { executeWithRetry: vi.fn().mockResolvedValue('second'), dispose: vi.fn() };
    queuedStates.push(first, second);
    mockGetRateLimitKey.mockReturnValueOnce('first').mockReturnValueOnce('second');
    const registry = new RateLimitRegistry({ maxConcurrency: 10 });

    await registry.execute(provider, vi.fn());
    await registry.execute(provider, vi.fn());
    registry.dispose();

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
  });
});
