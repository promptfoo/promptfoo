import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { AnthropicMessagesProvider } from '../../src/providers/anthropic/messages';
import { HttpProvider } from '../../src/providers/http';
import { N8nProvider } from '../../src/providers/n8n';
import { OpenAiAgentsApiProvider } from '../../src/providers/openai/agents-api';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { getFetchRetryContextMaxRetries } from '../../src/util/fetch/retryContext';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

const throttled = () =>
  new Response(
    JSON.stringify({ error: { message: 'Rate limit exceeded', type: 'rate_limit_error' } }),
    {
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'content-type': 'application/json', 'retry-after-ms': '0' },
    },
  );

describe('provider operation retry ownership', () => {
  let registry: RateLimitRegistry;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'false');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    registry = new RateLimitRegistry({ maxConcurrency: 4 });
  });
  afterEach(() => {
    registry.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function invoke(provider: ApiProvider): Promise<ProviderResponse> {
    const pending = withCacheEnabled(false, () =>
      wrapProviderWithRateLimiting(provider, registry).callApi('hello', {
        vars: {},
        prompt: { raw: 'hello', label: 'fixture' },
      }),
    );
    const handled = pending.catch((error: Error) => ({ error: error.message }));
    await vi.runAllTimersAsync();
    return handled;
  }

  it.each([0, 1, 3])(
    'does not multiply HTTP maxRetries=%i after transport exhaustion',
    async (maxRetries) => {
      const fetch = vi.fn().mockImplementation(async () => throttled());
      vi.stubGlobal('fetch', fetch);
      const provider = new HttpProvider('https://retry.fixture.test/http', {
        config: { method: 'POST', body: '{{prompt}}', maxRetries },
      });
      const result = await invoke(provider);
      expect(result.error).toContain('429');
      expect(fetch).toHaveBeenCalledTimes(maxRetries + 1);
    },
  );

  it('does not restart an OpenAI conversation after its request retry budget', async () => {
    const fetch = vi.fn().mockImplementation(async () => throttled());
    vi.stubGlobal('fetch', fetch);
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { apiKey: 'fixture', apiBaseUrl: 'https://retry.fixture.test/v1', maxRetries: 1 },
    });
    const result = await invoke(provider);
    expect(result.error).toContain('429');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['POST', 'PATCH'] as const)(
    'does not replay a stateful n8n %s with request-local zero retries',
    async (method) => {
      const fetch = vi.fn().mockImplementation(async () => throttled());
      vi.stubGlobal('fetch', fetch);
      const result = await invoke(
        new N8nProvider('https://retry.fixture.test/n8n', { config: { method } }),
      );
      expect(result.error).toContain('429');
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it('leaves the real Anthropic SDK retry count unchanged after exhaustion', async () => {
    const fetch = vi.fn().mockImplementation(async () => throttled());
    vi.stubGlobal('fetch', fetch);
    const provider = new AnthropicMessagesProvider('claude-sonnet-4-6', {
      config: { apiKey: 'fixture', apiBaseUrl: 'https://retry.fixture.test' },
    });
    const result = await invoke(provider);
    expect(result.error).toContain('429');
    // The SDK's existing default is two retries, independent of scheduler defaults.
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not create another billable Agents session after a later polling failure', async () => {
    const requests: { path: string; method: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
        const path = new URL(url instanceof Request ? url.url : String(url)).pathname;
        const method = options?.method ?? 'GET';
        requests.push({ path, method });
        if (method === 'DELETE') {
          return Response.json({ deleted: true });
        }
        if (path.endsWith('/turns')) {
          return throttled();
        }
        return Response.json({
          id: 'sess_fixture',
          status: 'idle',
          agent: { model: 'gpt-6-astra' },
        });
      }),
    );
    const provider = new OpenAiAgentsApiProvider('', {
      config: { apiKey: 'fixture', apiBaseUrl: 'https://retry.fixture.test/v1', maxRetries: 1 },
    });
    const result = await invoke(provider);
    expect(result.error).toContain('429');
    expect(
      requests.filter(({ path, method }) => path.endsWith('/sessions') && method === 'POST'),
    ).toHaveLength(1);
    expect(requests.filter(({ path }) => path.endsWith('/turns'))).toHaveLength(2);
    expect(requests.filter(({ method }) => method === 'DELETE')).toHaveLength(1);
  });

  it('preserves transport retries when adaptive scheduling is disabled', async () => {
    registry.dispose();
    vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'true');
    registry = new RateLimitRegistry({ maxConcurrency: 1 });
    const fetch = vi.fn().mockImplementation(async () => throttled());
    vi.stubGlobal('fetch', fetch);
    const result = await invoke(
      new HttpProvider('https://retry.fixture.test/disabled', {
        config: { method: 'POST', body: '{{prompt}}', maxRetries: 1 },
      }),
    );
    expect(result.error).toContain('429');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves final partial output, usage and headers without replaying completed work', async () => {
    const response: ProviderResponse = {
      error: 'Rate limit exceeded during tool continuation',
      output: 'partial answer',
      tokenUsage: { total: 20, numRequests: 2 },
      metadata: {
        http: { status: 429, statusText: 'Too Many Requests', headers: { 'retry-after-ms': '0' } },
      },
    };
    const callApi = vi.fn().mockResolvedValue(response);
    const provider = {
      id: () => 'owned',
      handlesOwnRetries: true,
      config: { maxRetries: 3 },
      callApi,
    };
    expect(await invoke(provider)).toBe(response);
    expect(callApi).toHaveBeenCalledOnce();
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      activeRequests: 0,
      failedRequests: 1,
      retriedRequests: 0,
    });
  });

  it('keeps custom retries independent from an operation-owned provider with the same rate-limit key', async () => {
    const response = {
      error: 'Rate limit exceeded',
      metadata: {
        http: { status: 429, statusText: 'Too Many Requests', headers: { 'retry-after-ms': '0' } },
      },
    };
    const ownedCall = vi.fn().mockResolvedValue(response);
    const customCall = vi.fn().mockResolvedValue(response);
    const config = Object.freeze({ maxRetries: 1 });
    const owned = {
      id: () => 'same-provider',
      config,
      handlesOwnRetries: true,
      callApi: ownedCall,
    };
    const custom = { id: () => 'same-provider', config, callApi: customCall };
    const pending = Promise.all([
      wrapProviderWithRateLimiting(owned, registry).callApi('hello'),
      wrapProviderWithRateLimiting(custom, registry).callApi('hello'),
    ]);
    await vi.runAllTimersAsync();
    await pending;
    expect(ownedCall).toHaveBeenCalledOnce();
    expect(customCall).toHaveBeenCalledTimes(2);
    expect(config.maxRetries).toBe(1);
  });

  it('keeps the configured transport context for owned calls and shadows it for a nested default provider', async () => {
    const outer = {
      id: () => 'outer',
      config: { maxRetries: 3 },
      handlesOwnRetries: true,
      callApi: vi.fn(),
    };
    const inner = { id: () => 'inner', callApi: vi.fn() };
    const seen = await registry.execute(outer, async () => {
      const before = getFetchRetryContextMaxRetries();
      const nested = await registry.execute(inner, async () => getFetchRetryContextMaxRetries());
      return { before, nested, after: getFetchRetryContextMaxRetries() };
    });
    expect(seen).toEqual({ before: 3, nested: undefined, after: 3 });
  });
  it('continues pacing subsequent owned calls using final rate-limit headers', async () => {
    const calls: number[] = [];
    const provider = {
      id: () => 'paced',
      handlesOwnRetries: true,
      callApi: vi.fn(async () => {
        calls.push(Date.now());
        return calls.length === 1
          ? {
              error: 'Rate limit exceeded',
              metadata: {
                http: {
                  status: 429,
                  statusText: 'Too Many Requests',
                  headers: { 'retry-after-ms': '100' },
                },
              },
            }
          : { output: 'ok' };
      }),
    };
    const wrapped = wrapProviderWithRateLimiting(provider, registry);
    expect((await wrapped.callApi('first')).error).toBe('Rate limit exceeded');
    const pending = wrapped.callApi('second');
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ output: 'ok' });
    expect(calls).toHaveLength(2);
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(100);
  });
  it('lets custom subclasses opt back into scheduler retries', async () => {
    let calls = 0;
    class CustomHttpProvider extends HttpProvider {
      override readonly handlesOwnRetries = false;
      override async callApi(): Promise<ProviderResponse> {
        calls++;
        return {
          error: 'Rate limit exceeded',
          metadata: {
            http: {
              status: 429,
              statusText: 'Too Many Requests',
              headers: { 'retry-after-ms': '0' },
            },
          },
        };
      }
    }
    const provider = new CustomHttpProvider('https://retry.fixture.test/custom', {
      config: { method: 'POST', body: '{{prompt}}', maxRetries: 1 },
    });
    expect((await invoke(provider)).error).toBe('Rate limit exceeded');
    expect(calls).toBe(2);
  });
});
