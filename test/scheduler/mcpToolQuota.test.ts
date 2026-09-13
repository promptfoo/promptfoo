import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';

import { context, propagation, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled, withCacheNamespace } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { getRateLimitKey } from '../../src/scheduler/rateLimitKey';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { createDeferred, mockProcessEnv } from '../util/utils';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';

import type { ApiProvider } from '../../src/types/providers';

const gateway = 'https://tool-quota.fixture.test';
const toolName = 'lookup';
const usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 };

describe('completed MCP diagnostics and target model quota', () => {
  const providers: ApiProvider[] = [];
  const registries: RateLimitRegistry[] = [];
  const controllers: AbortController[] = [];
  const drains: (() => void)[] = [];
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
    await setImmediate();
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
    text = 'Downstream service returned 429 rate limit',
    abortOnCompletion = true,
    isError = true,
    pendingTool = false,
    quotaHeaders = false,
    disabled = false,
    protocolError = false,
  } = {}) {
    if (disabled) {
      vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'true');
      drains.push(() => vi.unstubAllEnvs());
    }
    const controller = new AbortController();
    controllers.push(controller);
    const reason = Object.assign(new Error('caller stopped after completed tool'), {
      name: 'AbortError',
    });
    const completed = createDeferred<void>();
    const toolDispatched = createDeferred<void>();
    const deliverTool = createDeferred<void>();
    drains.push(
      () => deliverTool.resolve(),
      () => completed.resolve(),
    );
    const events: string[] = [];
    const spans: ReadableSpan[] = [];
    const responses: Response[] = [];
    const requests: { url: string; method: string; body?: Record<string, any> }[] = [];
    let toolBody: Response | undefined;
    const processor: SpanProcessor = {
      onStart() {},
      onEnd(span) {
        spans.push(span);
        if (span.name === `execute_tool ${toolName}`) {
          events.push('tool span ended');
          // A normal application completion policy only observes the real span
          // and resolves its own Promise. It does not abort inside the tracer.
          completed.resolve();
        }
      },
      async forceFlush() {},
      async shutdown() {},
    };
    tracerProvider = new NodeTracerProvider({ spanProcessors: [processor] });
    tracerProvider.register();
    const policy = completed.promise.then(() => {
      if (abortOnCompletion && !pendingTool) {
        events.push('caller abort');
        controller.abort(reason);
      }
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = options?.method ?? (input instanceof Request ? input.method : 'GET');
      const serialized =
        options?.body ?? (input instanceof Request ? await input.clone().text() : '');
      const body = serialized ? JSON.parse(String(serialized)) : undefined;
      requests.push({ url, method, body });
      let response: Response;
      if (url === `${gateway}/v1/chat/completions`) {
        const survivor = body.messages[0].content === 'survivor';
        response = new Response(
          JSON.stringify({
            choices: [
              {
                message: survivor
                  ? { role: 'assistant', content: 'survivor output' }
                  : {
                      role: 'assistant',
                      content: null,
                      tool_calls: [
                        {
                          id: 'tool-call-fixture',
                          type: 'function',
                          function: { name: toolName, arguments: '{"item":"fixture"}' },
                        },
                      ],
                    },
                finish_reason: survivor ? 'stop' : 'tool_calls',
              },
            ],
            usage,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-request-id': 'target-request-fixture',
              ...(quotaHeaders && !survivor
                ? {
                    // Exercise scheduler header learning independently of the lower
                    // fetch layer's OpenAI remaining=0 retry/backoff policy.
                    'ratelimit-limit': '100',
                    'ratelimit-remaining': '0',
                    'ratelimit-reset': '2s',
                  }
                : {}),
            },
          },
        );
      } else if (url === `${gateway}/mcp`) {
        if (method === 'GET') {
          response = new Response(null, { status: 405 });
        } else if (method === 'DELETE') {
          response = new Response(null, { status: 200 });
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
          } else if (body.method === 'tools/list') {
            result = {
              tools: [
                {
                  name: toolName,
                  inputSchema: { type: 'object', properties: { item: { type: 'string' } } },
                },
              ],
            };
          } else {
            expect(body.method).toBe('tools/call');
            expect(body.params).toEqual({ name: toolName, arguments: { item: 'fixture' } });
            events.push('tool dispatched');
            toolDispatched.resolve();
            if (pendingTool) {
              await deliverTool.promise;
            }
            result = { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
          }
          response = new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              ...(protocolError && body.method === 'tools/call'
                ? { error: { code: -32603, message: text } }
                : { result }),
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
          if (body.method === 'tools/call') {
            toolBody = response;
          }
        }
      } else {
        throw new Error(`Unexpected fixture request: ${method} ${url}`);
      }
      responses.push(response);
      return response;
    });
    const raw = await loadApiProvider('openai:chat:gpt-4o-mini', {
      options: {
        config: {
          apiBaseUrl: `${gateway}/v1`,
          apiKey: 'fixture-key',
          maxRetries: 0,
          mcp: { enabled: true, servers: [{ url: `${gateway}/mcp` }] },
        },
      },
    });
    expect(raw).toBeInstanceOf(OpenAiChatCompletionProvider);
    providers.push(raw);
    const registry = new RateLimitRegistry({ maxConcurrency: 2, minConcurrency: 1 });
    registries.push(registry);
    const wrapped = wrapProviderWithRateLimiting(raw, registry);
    const release = vi.spyOn(SlotQueue.prototype, 'release');
    const retrying = vi.fn();
    registry.on('request:retrying', retrying);
    const key = getRateLimitKey(raw);
    const namespace = randomUUID();
    const call = () =>
      withCacheNamespace(namespace, () =>
        withCacheEnabled(true, () =>
          trace
            .getTracer('tool-quota-fixture')
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
    const outcome = call().then(
      (value) => ({ value, error: undefined }),
      (error: unknown) => ({ value: undefined, error }),
    );
    if (pendingTool) {
      await toolDispatched.promise;
      expect(spans.some((span) => span.name === `execute_tool ${toolName}`)).toBe(false);
      events.push('caller abort while pending');
      controller.abort(reason);
    }
    const result = await outcome;
    await policy;
    return {
      ...result,
      raw,
      wrapped,
      registry,
      key,
      release,
      retrying,
      controller,
      reason,
      events,
      spans,
      requests,
      responses,
      toolBody,
      deliverTool,
      survivor: () =>
        withCacheNamespace(namespace, () =>
          withCacheEnabled(true, () => wrapped.callApi('survivor')),
        ),
    };
  }

  it.each(['Downstream returned 429', 'Downstream rate limit exceeded', 'Tool unavailable'])(
    'preserves completed tool diagnostic without model quota: %s',
    async (text) => {
      const f = await fixture({ text });
      const message = `MCP Tool Error (lookup): ${JSON.stringify([{ type: 'text', text }])}`;
      expect(f.error).toBeUndefined();
      expect(f.value).toMatchObject({
        error: message,
        cached: false,
        tokenUsage: { prompt: 2, completion: 3, total: 5, numRequests: 1 },
        metadata: {
          errorOrigin: 'tool',
          http: { status: 200, headers: { 'x-request-id': 'target-request-fixture' } },
          toolCalls: [
            {
              id: 'tool-call-fixture',
              name: 'lookup',
              input: { item: 'fixture' },
              output: JSON.stringify([{ type: 'text', text }]),
              is_error: true,
            },
          ],
        },
      });
      expect(f.toolBody?.bodyUsed).toBe(true);
      expect(f.events).toEqual(['tool dispatched', 'tool span ended', 'caller abort']);
      expect(f.spans.find((span) => span.name === 'execute_tool lookup')?.attributes).toMatchObject(
        { 'tool.is_error': true, 'error.type': 'tool_error' },
      );
      expect(f.registry.getMetrics()[f.key]).toMatchObject({
        rateLimitHits: 0,
        maxConcurrency: 2,
        totalRequests: 1,
        failedRequests: 1,
        activeRequests: 0,
        queueDepth: 0,
        retriedRequests: 0,
      });
      expect(f.release).toHaveBeenCalledTimes(1);
      expect(f.retrying).not.toHaveBeenCalled();
      expect(await f.survivor()).toMatchObject({ output: 'survivor output' });
      expect(f.requests.filter((x) => x.url.endsWith('/chat/completions'))).toHaveLength(2);
      expect(f.requests.filter((x) => x.body?.method === 'tools/call')).toHaveLength(1);
      expect(f.release).toHaveBeenCalledTimes(2);
    },
  );

  it('retains ordinary uncancelled tool errors as output', async () => {
    const f = await fixture({ abortOnCompletion: false });
    expect(f.value?.error).toBeUndefined();
    expect(f.value?.output).toContain('Downstream service returned 429 rate limit');
    expect(f.registry.getMetrics()[f.key]).toMatchObject({
      rateLimitHits: 0,
      maxConcurrency: 2,
      completedRequests: 1,
    });
  });

  it('keeps a completed SDK error diagnostic out of target quota detection', async () => {
    const f = await fixture({ text: 'Downstream rate limit', protocolError: true });
    expect(f.error).toBeUndefined();
    expect(f.value?.error).toBe('MCP Tool Error (lookup): MCP error -32603: Downstream rate limit');
    expect(f.value?.metadata?.toolCalls).toEqual([
      {
        id: 'tool-call-fixture',
        name: 'lookup',
        input: { item: 'fixture' },
        output: 'MCP error -32603: Downstream rate limit',
        is_error: true,
      },
    ]);
    expect(f.toolBody?.bodyUsed).toBe(true);
    expect(f.events).toEqual(['tool dispatched', 'tool span ended', 'caller abort']);
    expect(f.registry.getMetrics()[f.key]).toMatchObject({
      rateLimitHits: 0,
      maxConcurrency: 2,
      failedRequests: 1,
      activeRequests: 0,
      retriedRequests: 0,
    });
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it('preserves the completed diagnostic with the scheduler disabled', async () => {
    const f = await fixture({ disabled: true });
    expect(f.value?.error).toContain('Downstream service returned 429 rate limit');
    expect(f.error).toBeUndefined();
    expect(f.registry.getMetrics()).toEqual({});
    expect(f.release).not.toHaveBeenCalled();
  });

  it('still cancels an ordinary successful tool result after its span completes', async () => {
    const f = await fixture({ isError: false });
    expect(f.error).toBe(f.reason);
    expect(f.value).toBeUndefined();
    expect(f.registry.getMetrics()[f.key]).toMatchObject({
      rateLimitHits: 0,
      failedRequests: 1,
      activeRequests: 0,
    });
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending actual SDK request without promoting its later result', async () => {
    const f = await fixture({ pendingTool: true });
    expect(f.error).toBe(f.reason);
    expect(f.value).toBeUndefined();
    expect(f.toolBody).toBeUndefined();
    expect(f.registry.getMetrics()[f.key]).toMatchObject({
      rateLimitHits: 0,
      failedRequests: 1,
      activeRequests: 0,
    });
    expect(f.release).toHaveBeenCalledTimes(1);
    f.deliverTool.resolve();
    await setImmediate();
    expect(f.requests.filter((x) => x.body?.method === 'tools/call')).toHaveLength(1);
    expect(f.retrying).not.toHaveBeenCalled();
  });

  it('still learns genuine model quota headers from a completed tool-error response', async () => {
    const f = await fixture({ text: 'Tool unavailable', quotaHeaders: true });
    expect(f.value?.error).toContain('Tool unavailable');
    const survivor = f.survivor();
    await setImmediate();
    expect(f.registry.getMetrics()[f.key]).toMatchObject({ queueDepth: 1, activeRequests: 0 });
    expect(f.requests.filter((x) => x.url.endsWith('/chat/completions'))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await survivor).toMatchObject({ output: 'survivor output' });
    expect(f.release).toHaveBeenCalledTimes(2);
  });
});
