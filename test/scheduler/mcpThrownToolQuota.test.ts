import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';

import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled, withCacheNamespace } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { getRateLimitKey } from '../../src/scheduler/rateLimitKey';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { TokenUsageTracker } from '../../src/util/tokenUsage';
import {
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
} from '../../src/util/tokenUsageUtils';
import { createDeferred, mockProcessEnv } from '../util/utils';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';

import type { ApiProvider } from '../../src/types/providers';

const gateway = 'https://thrown-tool-quota.fixture.test';
const toolName = 'lookup';
const usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 };
const completedUsage = { prompt: 2, completion: 3, total: 5, numRequests: 1 };
const modelPayload = {
  choices: [
    {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'disconnected-tool-call',
            type: 'function',
            function: { name: toolName, arguments: '{"item":"fixture"}' },
          },
        ],
      },
      finish_reason: 'tool_calls',
    },
  ],
  usage,
};

function settled<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error }),
  );
}

describe('disconnected MCP tool failures and target model quota', () => {
  const providers: ApiProvider[] = [];
  const registries: RateLimitRegistry[] = [];
  const controllers: AbortController[] = [];
  const drains: (() => void)[] = [];
  const pending: Promise<unknown>[] = [];
  let restoreEnvironment: () => void;
  let tracerProvider: NodeTracerProvider;

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      OPENAI_API_KEY: 'fixture-key',
      OPENAI_ORGANIZATION: undefined,
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  });

  afterEach(async () => {
    for (const controller of controllers.splice(0)) {
      controller.abort();
    }
    for (const finish of drains.splice(0)) {
      finish();
    }
    await Promise.all(pending.splice(0));
    // Real cleanup also waits for any shared refresh whose caller stopped waiting.
    for (const provider of providers.splice(0)) {
      await provider.cleanup?.();
    }
    for (const registry of registries.splice(0)) {
      registry.dispose();
    }
    await tracerProvider?.shutdown();
    trace.disable();
    context.disable();
    propagation.disable();
    vi.restoreAllMocks();
    vi.useRealTimers();
    restoreEnvironment();
  });

  async function fixture({
    serverName = 'downstream service',
    abortOnCompletion = true,
    quotaHeaders = false,
    disabled = false,
  } = {}) {
    if (disabled) {
      vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'true');
      drains.push(() => vi.unstubAllEnvs());
    }
    const namespace = randomUUID();
    const tokenUrl = `${gateway}/oauth/${namespace}/token`;
    const mcpUrl = `${gateway}/mcp/${namespace}`;
    const clientId = `fixture-client-${namespace}`;
    const clientSecret = 'synthetic-client-secret';
    const accessToken = 'synthetic-short-lived-token';
    const controller = new AbortController();
    const survivorController = new AbortController();
    controllers.push(controller, survivorController);
    const reason = Object.assign(new Error('caller stopped after disconnected tool span'), {
      name: 'AbortError',
    });
    const completed = createDeferred<void>();
    const reconnectStarted = createDeferred<void>();
    const deliverReconnect = createDeferred<void>();
    const deliverSurvivor = createDeferred<void>();
    drains.push(
      () => completed.resolve(),
      () => deliverReconnect.resolve(),
      () => deliverSurvivor.resolve(),
    );
    const events: string[] = [];
    const toolSpans: { span: ReadableSpan; aborted: boolean }[] = [];
    const requests: {
      url: string;
      method: string;
      body?: Record<string, any>;
      headers: Headers;
    }[] = [];
    const responses: { url: string; response: Response }[] = [];
    let tokenRequests = 0;
    let survivorDispatchedAt: number | undefined;
    const processor: SpanProcessor = {
      onStart() {},
      onEnd(span) {
        if (span.name === `execute_tool ${toolName}`) {
          toolSpans.push({ span, aborted: controller.signal.aborted });
          events.push('tool span ended');
          // Only record the actual completed span and resolve an application
          // Promise. Caller cancellation belongs to the separate policy below.
          completed.resolve();
        }
      },
      async forceFlush() {},
      async shutdown() {},
    };
    tracerProvider = new NodeTracerProvider({ spanProcessors: [processor] });
    tracerProvider.register();
    const policy = completed.promise.then(() => {
      if (abortOnCompletion) {
        events.push('caller abort');
        controller.abort(reason);
      }
    });
    pending.push(policy);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = options?.method ?? (input instanceof Request ? input.method : 'GET');
      const serialized =
        options?.body ?? (input instanceof Request ? await input.clone().text() : '');
      const body = serialized
        ? url === tokenUrl
          ? Object.fromEntries(new URLSearchParams(String(serialized)))
          : JSON.parse(String(serialized))
        : undefined;
      const requestHeaders = new Headers(
        options?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      requests.push({ url, method, body, headers: requestHeaders });
      let response: Response;
      if (url === tokenUrl) {
        tokenRequests++;
        if (tokenRequests === 1) {
          events.push('initial token issued');
          response = new Response(
            JSON.stringify({ access_token: accessToken, token_type: 'Bearer', expires_in: 30 }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        } else {
          expect(tokenRequests).toBe(2);
          events.push('reconnect token requested');
          reconnectStarted.resolve();
          await deliverReconnect.promise;
          events.push('reconnect token failed');
          response = new Response('synthetic token service unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
          });
        }
      } else if (url === `${gateway}/v1/chat/completions`) {
        const survivor = body.messages[0].content === 'survivor';
        events.push(survivor ? 'survivor dispatched' : 'model dispatched');
        if (survivor) {
          survivorDispatchedAt = Date.now();
          await deliverSurvivor.promise;
        }
        response = new Response(
          JSON.stringify(
            survivor
              ? {
                  choices: [
                    {
                      message: { role: 'assistant', content: 'survivor output' },
                      finish_reason: 'stop',
                    },
                  ],
                  usage,
                }
              : modelPayload,
          ),
          {
            status: 200,
            statusText: 'OK',
            headers: {
              'content-type': 'application/json',
              'x-request-id': 'disconnected-tool-target',
              ...(quotaHeaders && !survivor
                ? {
                    'ratelimit-limit': '100',
                    'ratelimit-remaining': '0',
                    'ratelimit-reset': '2s',
                  }
                : {}),
            },
          },
        );
      } else if (url === mcpUrl) {
        if (method === 'GET') {
          response = new Response(null, { status: 405 });
        } else if (body.method === 'notifications/initialized') {
          response = new Response(null, { status: 202 });
        } else {
          let result: unknown;
          if (body.method === 'initialize') {
            result = {
              protocolVersion: '2025-11-25',
              capabilities: { tools: {} },
              serverInfo: { name: 'fixture', version: '1' },
            };
          } else {
            expect(body.method).toBe('tools/list');
            events.push('tool advertised');
            result = {
              tools: [
                {
                  name: toolName,
                  inputSchema: { type: 'object', properties: { item: { type: 'string' } } },
                },
              ],
            };
          }
          response = new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
      } else {
        throw new Error(`Unexpected fixture request: ${method} ${url}`);
      }
      responses.push({ url, response });
      return response;
    });
    const raw = await loadApiProvider('openai:chat:gpt-4o-mini', {
      options: {
        config: {
          apiBaseUrl: `${gateway}/v1`,
          apiKey: 'fixture-key',
          maxRetries: 0,
          cost: 0.25,
          mcp: {
            enabled: true,
            servers: [
              {
                name: serverName,
                url: mcpUrl,
                auth: {
                  type: 'oauth',
                  grantType: 'client_credentials',
                  clientId,
                  clientSecret,
                  tokenUrl,
                },
              },
            ],
          },
        },
      },
    });
    expect(raw).toBeInstanceOf(OpenAiChatCompletionProvider);
    providers.push(raw);
    const registry = new RateLimitRegistry({ maxConcurrency: 1, minConcurrency: 1 });
    registries.push(registry);
    const wrapped = wrapProviderWithRateLimiting(raw, registry);
    const key = getRateLimitKey(raw);
    expect(getRateLimitKey(wrapped)).toBe(key);
    const release = vi.spyOn(SlotQueue.prototype, 'release');
    const retrying = vi.fn();
    registry.on('request:retrying', retrying);
    const scope = <T>(invoke: () => Promise<T>) =>
      withCacheNamespace(namespace, () => withCacheEnabled(true, invoke));
    const outcome = settled(
      scope(() =>
        trace
          .getTracer('disconnected-tool-fixture')
          .startActiveSpan('application policy', async (span) => {
            try {
              return await wrapped.callApi('fixture', undefined, {
                abortSignal: controller.signal,
              });
            } finally {
              span.end();
            }
          }),
      ),
    );
    pending.push(outcome);
    await reconnectStarted.promise;
    expect(controller.signal.aborted).toBe(false);
    expect(toolSpans).toEqual([]);
    const startedAt = Date.now();
    // The same public provider/key returns ordinary text for this prompt, so it
    // does not execute a second MCP tool or trigger an unrelated reconnect.
    const survivor = disabled
      ? undefined
      : settled(
          scope(() =>
            wrapped.callApi('survivor', undefined, { abortSignal: survivorController.signal }),
          ),
        );
    if (survivor) {
      pending.push(survivor);
      await setImmediate();
      expect(registry.getMetrics()[key]).toMatchObject({ activeRequests: 1, queueDepth: 1 });
      expect(survivorDispatchedAt).toBeUndefined();
    }
    deliverReconnect.resolve();
    const result = await outcome;
    await policy;
    await setImmediate();
    const disconnected = `Tool lookup is known but MCP server is disconnected: ${serverName}`;
    expect(toolSpans).toHaveLength(1);
    expect(toolSpans[0].aborted).toBe(false);
    expect(toolSpans[0].span.attributes).toMatchObject({
      'tool.is_error': true,
      'error.type': 'Error',
      'tool.arguments': '{"item":"fixture"}',
    });
    expect(toolSpans[0].span.status).toEqual({ code: SpanStatusCode.ERROR, message: disconnected });
    expect(controller.signal.aborted).toBe(abortOnCompletion);
    expect(events.filter((event) => event !== 'survivor dispatched')).toEqual([
      'initial token issued',
      'tool advertised',
      'model dispatched',
      'reconnect token requested',
      'reconnect token failed',
      'tool span ended',
      ...(abortOnCompletion ? ['caller abort'] : []),
    ]);
    const tokenCalls = requests.filter((request) => request.url === tokenUrl);
    expect(tokenCalls).toHaveLength(2);
    for (const request of tokenCalls) {
      expect(request.method).toBe('POST');
      expect(request.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
      expect(request.body).toEqual({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      });
    }
    const tokenResponses = responses.filter(({ url }) => url === tokenUrl);
    expect(tokenResponses.map(({ response }) => response.status)).toEqual([200, 503]);
    expect(tokenResponses.every(({ response }) => response.bodyUsed)).toBe(true);
    const mcpCalls = requests.filter((request) => request.url === mcpUrl);
    expect(mcpCalls).toHaveLength(4);
    expect(
      mcpCalls
        .filter((request) => request.method === 'POST')
        .map((request) => request.body?.method),
    ).toEqual(['initialize', 'notifications/initialized', 'tools/list']);
    expect(mcpCalls.filter((request) => request.method === 'GET')).toHaveLength(1);
    expect(
      mcpCalls.every((request) => request.headers.get('authorization') === `Bearer ${accessToken}`),
    ).toBe(true);
    expect(
      responses
        .filter(({ url }) => url === mcpUrl)
        .map(({ response }) => response.status)
        .sort(),
    ).toEqual([200, 200, 202, 405]);
    const modelCalls = requests.filter((request) => request.url.endsWith('/chat/completions'));
    expect(modelCalls[0].body?.tools).toEqual([
      expect.objectContaining({
        type: 'function',
        function: expect.objectContaining({ name: toolName }),
      }),
    ]);
    expect(requests.filter((request) => request.body?.method === 'tools/call')).toHaveLength(0);
    expect(retrying).not.toHaveBeenCalled();
    if (disabled) {
      expect(registry.getMetrics()).toEqual({});
      expect(release).not.toHaveBeenCalled();
      expect(requests).toHaveLength(7);
    } else {
      expect(release).toHaveBeenCalledTimes(1);
    }
    return {
      ...result,
      disconnected,
      quotaHeaders,
      registry,
      key,
      release,
      retrying,
      requests,
      responses,
      startedAt,
      survivor,
      survivorDispatchedAt: () => survivorDispatchedAt,
      finishSurvivor: () => deliverSurvivor.resolve(),
    };
  }

  function expectCompletedAccounting(f: Awaited<ReturnType<typeof fixture>>) {
    expect.soft(f.value).toMatchObject({
      tokenUsage: completedUsage,
      cost: 1.25,
      cached: false,
      // Fake Date remains fixed through the completed native Response fetch.
      latencyMs: 0,
    });
    expect.soft(f.value?.tokenUsage).toEqual(completedUsage);

    // Exercise the same response-aware accounting consumers as the evaluator,
    // using the actual returned diagnostic rather than a copied usage object.
    const accounting = createEmptyTokenUsage();
    accumulateResponseTokenUsage(accounting, f.value);
    const expected = { ...createEmptyTokenUsage(), ...completedUsage };
    expect.soft(accounting).toEqual(expected);

    const tracker = TokenUsageTracker.getInstance();
    const trackingId = `${f.key}:completed-tool-accounting:${randomUUID()}`;
    try {
      tracker.trackResponseUsage(trackingId, f.value);
      expect.soft(tracker.getProviderUsage(trackingId)).toEqual(expected);
    } finally {
      tracker.resetProviderUsage(trackingId);
    }
  }

  function expectToolOrigin(f: Awaited<ReturnType<typeof fixture>>) {
    expect.soft(f.error).toBeUndefined();
    expect.soft(f.value).toEqual({
      error: `API error: Error: ${f.disconnected}: ${JSON.stringify(modelPayload)}`,
      tokenUsage: completedUsage,
      cost: 1.25,
      cached: false,
      latencyMs: 0,
      metadata: {
        errorOrigin: 'tool',
        http: {
          status: 200,
          statusText: 'OK',
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'disconnected-tool-target',
            ...(f.quotaHeaders
              ? { 'ratelimit-limit': '100', 'ratelimit-remaining': '0', 'ratelimit-reset': '2s' }
              : {}),
          },
        },
      },
    });
    expectCompletedAccounting(f);
  }

  async function finishQueuedSurvivor(f: Awaited<ReturnType<typeof fixture>>, delay = 0) {
    if (delay) {
      expect(f.survivorDispatchedAt()).toBeUndefined();
      expect(f.registry.getMetrics()[f.key]).toMatchObject({ activeRequests: 0, queueDepth: 1 });
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(f.survivorDispatchedAt()).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
    }
    await setImmediate();
    // Record the genuine RED before draining its finite fallback. The drain is
    // cleanup only and cannot satisfy the no-wait dispatch assertion above it.
    expect.soft(f.survivorDispatchedAt()).toBe(f.startedAt + delay);
    expect.soft(f.registry.getMetrics()[f.key]).toMatchObject({
      rateLimitHits: 0,
      activeRequests: 1,
      queueDepth: 0,
      retriedRequests: 0,
    });
    if (f.survivorDispatchedAt() === undefined) {
      await vi.advanceTimersByTimeAsync(60000);
    }
    f.finishSurvivor();
    expect(await f.survivor).toMatchObject({
      value: { output: 'survivor output' },
      error: undefined,
    });
    expect(f.release).toHaveBeenCalledTimes(2);
    expect(f.registry.getMetrics()[f.key]).toMatchObject({
      activeRequests: 0,
      queueDepth: 0,
      totalRequests: 2,
      retriedRequests: 0,
    });
    expect(f.retrying).not.toHaveBeenCalled();
    expect(f.requests.filter((request) => request.url.endsWith('/chat/completions'))).toHaveLength(
      2,
    );
    expect(f.requests).toHaveLength(8);
    expect(f.responses).toHaveLength(8);
    expect(vi.getTimerCount()).toBe(0);
  }

  it.each(['downstream service', 'downstream rate limit service'])(
    'keeps disconnected tool origin and releases the same-key queued survivor: %s',
    async (serverName) => {
      const f = await fixture({ serverName });
      expectToolOrigin(f);
      await finishQueuedSurvivor(f);
    },
  );

  it('preserves the disconnected formatter and origin with the scheduler disabled', async () => {
    const f = await fixture({ serverName: 'downstream rate limit service', disabled: true });
    expectToolOrigin(f);
  });

  it('still enforces genuine model quota headers after the independent tool failure', async () => {
    const f = await fixture({ quotaHeaders: true });
    expectToolOrigin(f);
    await finishQueuedSurvivor(f, 2000);
  });

  it('retains the ordinary uncancelled disconnected-tool output and metadata', async () => {
    const f = await fixture({ abortOnCompletion: false });
    expectCompletedAccounting(f);
    expect(f.error).toBeUndefined();
    expect(f.value?.error).toBeUndefined();
    expect(f.value).toMatchObject({
      output: `MCP Tool Error (lookup): Error: ${f.disconnected}`,
      metadata: {
        toolCalls: [
          {
            id: 'disconnected-tool-call',
            name: 'lookup',
            input: { item: 'fixture' },
            output: `Error: ${f.disconnected}`,
            is_error: true,
          },
        ],
      },
    });
    await finishQueuedSurvivor(f);
  });
});
