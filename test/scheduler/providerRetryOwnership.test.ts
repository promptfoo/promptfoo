import { OAuth2Client } from 'google-auth-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { AnthropicMessagesProvider } from '../../src/providers/anthropic/messages';
import { GoogleImageProvider } from '../../src/providers/google/image';
import { HttpProvider } from '../../src/providers/http';
import { N8nProvider } from '../../src/providers/n8n';
import { OpenAiAgentsApiProvider } from '../../src/providers/openai/agents-api';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiResponsesProvider } from '../../src/providers/openai/responses';
import { OpenRouterProvider } from '../../src/providers/openrouter';
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
    // Fake timers keep jittered retries fast without mocking Math.random, which
    // source-map also uses to choose quicksort pivots while formatting SDK errors.
    vi.useFakeTimers();
    vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'false');
    registry = new RateLimitRegistry({ maxConcurrency: 4 });
  });
  afterEach(() => {
    registry.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function invoke(
    provider: ApiProvider,
    advanceTimersByMs?: number,
  ): Promise<ProviderResponse> {
    const pending = withCacheEnabled(false, () =>
      wrapProviderWithRateLimiting(provider, registry).callApi('hello', {
        vars: {},
        prompt: { raw: 'hello', label: 'fixture' },
      }),
    );
    const handled = pending.catch((error: Error) => ({ error: error.message }));
    if (advanceTimersByMs === undefined) {
      await vi.runAllTimersAsync();
    } else {
      await vi.advanceTimersByTimeAsync(advanceTimersByMs);
    }
    return handled;
  }

  it('delays later n8n calls after a 429 without replaying the webhook', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('busy', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'retry-after': '30' },
        }),
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ output: 'ready' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const provider = new N8nProvider('https://retry.fixture.test/n8n');
    const wrapped = wrapProviderWithRateLimiting(provider, registry);
    const first = wrapped.callApi('first');
    await vi.advanceTimersByTimeAsync(0);
    expect((await first).metadata?.http?.status).toBe(429);
    expect(fetch).toHaveBeenCalledOnce();
    const second = wrapped.callApi('second');
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetch).toHaveBeenCalledOnce();
    await vi.runAllTimersAsync();
    expect((await second).output).toBe('ready');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      failedRequests: 1,
      retriedRequests: 0,
    });
  });

  it.each([0, 1, 3])(
    'retains HTTP scheduler recovery with maxRetries=%i after transport exhaustion',
    async (maxRetries) => {
      const fetch = vi.fn().mockImplementation(async () => throttled());
      vi.stubGlobal('fetch', fetch);
      const provider = new HttpProvider('https://retry.fixture.test/http', {
        config: { method: 'POST', body: '{{prompt}}', maxRetries },
      });
      const result = await invoke(provider);
      expect(result.error).toContain('429');
      expect(fetch).toHaveBeenCalledTimes((maxRetries + 1) ** 2);
    },
  );

  it.each([0, 1, 3])(
    'preserves HTTP status-validation recovery with maxRetries=%i',
    async (maxRetries) => {
      vi.stubEnv('PROMPTFOO_RETRY_5XX', 'false');
      const fetch = vi
        .fn()
        .mockImplementation(async () =>
          fetch.mock.calls.length <= maxRetries
            ? new Response('temporarily unavailable', { status: 503 })
            : Response.json({ output: 'recovered' }),
        );
      vi.stubGlobal('fetch', fetch);
      const result = await invoke(
        new HttpProvider('https://retry.fixture.test/validated', {
          config: {
            method: 'GET',
            maxRetries,
            validateStatus: 'status >= 200 && status < 300',
            responseParser: 'json.output',
          },
        }),
      );
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('recovered');
      expect(fetch).toHaveBeenCalledTimes(maxRetries + 1);
    },
  );

  const chatProviders = [
    [
      'OpenRouter',
      (maxRetries: number) =>
        new OpenRouterProvider('fixture', { config: { apiKey: 'fixture', maxRetries } }),
    ],
    [
      'OpenAI gateway',
      (maxRetries: number) =>
        new OpenAiChatCompletionProvider('fixture', {
          config: { apiKey: 'fixture', apiBaseUrl: 'https://gateway.fixture.test/v1', maxRetries },
        }),
    ],
  ] as const;
  describe.each(chatProviders)('%s parsed response recovery', (_label, createProvider) => {
    it.each([0, 1, 3])(
      'preserves HTTP 200 throttling recovery with maxRetries=%i',
      async (maxRetries) => {
        const fetch = vi.fn().mockImplementation(async () =>
          Response.json(
            fetch.mock.calls.length <= maxRetries
              ? {
                  choices: [
                    {
                      finish_reason: 'error',
                      error: {
                        message: 'Too many requests',
                        metadata: { error_type: 'rate_limit_exceeded' },
                      },
                    },
                  ],
                }
              : {
                  choices: [
                    {
                      finish_reason: 'stop',
                      message: { role: 'assistant', content: 'recovered' },
                    },
                  ],
                },
          ),
        );
        vi.stubGlobal('fetch', fetch);
        const result = await invoke(createProvider(maxRetries));
        expect(result.error).toBeUndefined();
        expect(result.output).toBe('recovered');
        expect(fetch).toHaveBeenCalledTimes(maxRetries + 1);
      },
    );
  });

  describe.each(chatProviders)('%s excluded retry limits', (_label, createProvider) => {
    it('keeps maxRetries zero when a parsed throttle persists', async () => {
      const fetch = vi.fn().mockImplementation(async () =>
        Response.json({
          choices: [
            {
              finish_reason: 'error',
              error: {
                message: 'Rate limit exceeded',
                metadata: { error_type: 'rate_limit_exceeded' },
              },
            },
          ],
        }),
      );
      vi.stubGlobal('fetch', fetch);
      const result = await invoke(createProvider(0));
      expect(result.error).toContain('Rate limit exceeded');
      expect(result.metadata?.rateLimitKind).toBe('rate_limit');
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('does not retry a parsed hard quota', async () => {
      const fetch = vi.fn().mockImplementation(async () =>
        Response.json({
          choices: [
            {
              finish_reason: 'error',
              error: {
                message: 'Rate limit exceeded',
                code: 'credit_balance_exhausted',
                metadata: { error_type: 'rate_limit_exceeded' },
              },
            },
          ],
        }),
      );
      vi.stubGlobal('fetch', fetch);
      const result = await invoke(createProvider(3));
      expect(result.error).toContain('Rate limit exceeded');
      expect(result.metadata?.rateLimitKind).toBe('quota');
      expect(fetch).toHaveBeenCalledOnce();
    });
  });

  it.each([0, 1, 3])(
    'preserves Vertex Imagen OAuth 429 recovery with maxRetries=%i',
    async (maxRetries) => {
      let requests = 0;
      const client = new OAuth2Client({ credentials: { access_token: 'fixture' } });
      client.transporter.defaults.adapter = async (config) => {
        const throttled = ++requests <= maxRetries;
        const data = throttled
          ? { error: { message: 'Rate limit exceeded' } }
          : { predictions: [{ bytesBase64Encoded: 'aGk=', mimeType: 'image/png' }] };
        return Object.assign(
          new Response(JSON.stringify(data), { status: throttled ? 429 : 200 }),
          { data: data as any, config },
        );
      };
      const config = { projectId: 'fixture', maxRetries };
      const provider = new GoogleImageProvider('imagen-4.0-generate-001', { config });
      vi.spyOn(provider as any, 'getClientWithCredentials').mockResolvedValue(client);
      vi.spyOn(provider as any, 'getProjectId').mockResolvedValue('fixture');
      const result = await invoke(provider);
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('data:image/png;base64,aGk=');
      expect(requests).toBe(maxRetries + 1);
      // This is the existing provider-local total-attempt count, not the scheduler budget.
      expect(provider.maxRetries).toBe(3);
    },
  );

  it('preserves HTTP OAuth token status recovery before the target request', async () => {
    vi.stubEnv('PROMPTFOO_RETRY_5XX', 'false');
    let tokens = 0;
    let targets = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).endsWith('/token')) {
          return ++tokens === 1
            ? new Response('unavailable', { status: 503 })
            : Response.json({ access_token: 'fixture', expires_in: 3600 });
        }
        targets++;
        return Response.json({ output: 'recovered' });
      }),
    );
    const result = await invoke(
      new HttpProvider('https://retry.fixture.test/target', {
        config: {
          method: 'GET',
          maxRetries: 1,
          auth: {
            type: 'oauth',
            grantType: 'client_credentials',
            tokenUrl: 'https://retry.fixture.test/token',
            clientId: 'fixture',
            clientSecret: 'fixture',
          },
        },
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toEqual({ output: 'recovered' });
    expect(tokens).toBe(2);
    expect(targets).toBe(1);
  });

  it('keeps zero scheduler retries for excluded HTTP validation', async () => {
    vi.stubEnv('PROMPTFOO_RETRY_5XX', 'false');
    const fetch = vi
      .fn()
      .mockImplementation(async () => new Response('unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    const result = await invoke(
      new HttpProvider('https://retry.fixture.test/zero', {
        config: { method: 'GET', maxRetries: 0, validateStatus: 'status === 200' },
      }),
    );
    expect(result.error).toContain('503');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('preserves HTTP session endpoint status recovery before the target request', async () => {
    vi.stubEnv('PROMPTFOO_RETRY_5XX', 'false');
    let sessions = 0;
    let targets = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).endsWith('/session')) {
          return ++sessions === 1
            ? new Response('unavailable', { status: 503 })
            : Response.json({ id: 'session-fixture' });
        }
        targets++;
        return Response.json({ output: 'recovered' });
      }),
    );
    const result = await invoke(
      new HttpProvider('https://retry.fixture.test/target', {
        config: {
          method: 'GET',
          maxRetries: 1,
          session: { url: 'https://retry.fixture.test/session', responseParser: 'data.body.id' },
        },
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toEqual({ output: 'recovered' });
    expect(sessions).toBe(2);
    expect(targets).toBe(1);
  });

  it('preserves custom HTTP response-transform recovery outside the transport loop', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        Response.json(fetch.mock.calls.length === 1 ? { retry: true } : { output: 'recovered' }),
      );
    vi.stubGlobal('fetch', fetch);
    const result = await invoke(
      new HttpProvider('https://retry.fixture.test/transform', {
        config: {
          method: 'GET',
          maxRetries: 1,
          responseParser:
            "json.retry ? (() => { throw new Error('503 from upstream'); })() : json.output",
        },
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('recovered');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves Responses gateway HTTP 200 error recovery', async () => {
    const fetch = vi.fn().mockImplementation(async () =>
      Response.json(
        fetch.mock.calls.length === 1
          ? { error: { message: 'Rate limit exceeded' } }
          : {
              id: 'resp_fixture',
              status: 'completed',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'recovered' }],
                },
              ],
            },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await invoke(
      new OpenAiResponsesProvider('fixture', {
        config: { apiKey: 'fixture', apiBaseUrl: 'https://gateway.fixture.test/v1', maxRetries: 1 },
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('recovered');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retains OpenAI scheduler recovery until all response phases own retries', async () => {
    const fetch = vi.fn().mockImplementation(async () => throttled());
    vi.stubGlobal('fetch', fetch);
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { apiKey: 'fixture', apiBaseUrl: 'https://api.openai.com/v1', maxRetries: 1 },
    });
    const result = await invoke(provider);
    expect(result.error).toContain('429');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it.each(['GET', 'HEAD', 'PUT', 'POST', 'PATCH'] as const)(
    'does not replay a stateful n8n webhook %s with request-local zero retries',
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

  it('retains Anthropic outer recovery as well as the SDK retry budget', async () => {
    const fetch = vi.fn().mockImplementation(async () => throttled());
    vi.stubGlobal('fetch', fetch);
    const config = { apiKey: 'fixture', apiBaseUrl: 'https://retry.fixture.test', maxRetries: 1 };
    const provider = new AnthropicMessagesProvider('claude-sonnet-4-6', { config });
    const result = await invoke(provider, 120_000);
    expect(result.error).toContain('429');
    // The SDK's two retries and the scheduler's one retry remain separate.
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it('retains Agents session replay until terminal job failures have local recovery', async () => {
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
    ).toHaveLength(2);
    expect(requests.filter(({ path }) => path.endsWith('/turns'))).toHaveLength(4);
    expect(requests.filter(({ method }) => method === 'DELETE')).toHaveLength(2);
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
      get handlesOwnRetries(): boolean {
        return false;
      }
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
