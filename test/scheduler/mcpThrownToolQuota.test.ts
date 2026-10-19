import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { MCPClient } from '../../src/providers/mcp/client';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { createDeferred } from '../util/utils';

// MCP transport/OAuth behavior is covered by the MCP suite. Exercise its public
// thrown-error boundary here, with a real model response and scheduler queue.
describe('thrown MCP tool errors and model quota', () => {
  const registries: RateLimitRegistry[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'false');
    vi.spyOn(MCPClient.prototype, 'initialize').mockResolvedValue();
    vi.spyOn(MCPClient.prototype, 'cleanup').mockResolvedValue();
    vi.spyOn(MCPClient.prototype, 'getAllTools').mockReturnValue([
      { name: 'lookup', description: 'fixture', inputSchema: { type: 'object' } },
    ]);
  });
  afterEach(() => {
    registries.splice(0).forEach((registry) => registry.dispose());
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it.each([
    { cancel: true, disabled: false, quota: false, message: 'downstream unavailable' },
    {
      cancel: true,
      disabled: false,
      quota: false,
      message: 'downstream rate limit service unavailable',
    },
    { cancel: true, disabled: true, quota: false, message: 'downstream unavailable' },
    { cancel: true, disabled: false, quota: true, message: 'downstream unavailable' },
    { cancel: false, disabled: false, quota: false, message: 'downstream unavailable' },
  ])('preserves tool failure accounting: %j', async ({ cancel, disabled, quota, message }) => {
    vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', String(disabled));
    const controller = new AbortController();
    const started = createDeferred<void>();
    const finish = createDeferred<void>();
    const tool = vi.spyOn(MCPClient.prototype, 'callTool').mockImplementation(async () => {
      started.resolve();
      await finish.promise;
      if (cancel) {
        controller.abort(new Error('caller stopped at tool completion'));
      }
      throw new Error(message);
    });
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      const survivor = body.messages[0].content === 'survivor';
      return new Response(
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
                        id: 'tool-call',
                        type: 'function',
                        function: { name: 'lookup', arguments: '{}' },
                      },
                    ],
                  },
              finish_reason: survivor ? 'stop' : 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            ...(quota && !survivor
              ? { 'ratelimit-limit': '100', 'ratelimit-remaining': '0', 'ratelimit-reset': '2s' }
              : {}),
          },
        },
      );
    });
    const raw = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: {
        apiBaseUrl: `https://${randomUUID()}.fixture.test/v1`,
        apiKey: 'fixture-key',
        cost: 0.25,
        maxRetries: 0,
        mcp: { enabled: true, servers: [{ url: 'https://mcp.fixture.test' }] },
      },
    });
    const registry = new RateLimitRegistry({ maxConcurrency: 1, minConcurrency: 1 });
    registries.push(registry);
    const wrapped = wrapProviderWithRateLimiting(raw, registry);
    const retrying = vi.fn();
    registry.on('request:retrying', retrying);
    try {
      await withCacheEnabled(false, async () => {
        const first = wrapped.callApi('fixture', undefined, { abortSignal: controller.signal });
        await started.promise;
        const survivor = disabled ? undefined : wrapped.callApi('survivor');
        finish.resolve();
        const result = await first;
        expect(result).toMatchObject({
          tokenUsage: { prompt: 2, completion: 3, total: 5, numRequests: 1 },
          cost: 1.25,
          cached: false,
        });
        expect(tool).toHaveBeenCalledOnce();
        expect(retrying).not.toHaveBeenCalled();
        if (cancel) {
          expect(result.error).toContain(message);
          expect(result.metadata).toMatchObject({ errorOrigin: 'tool', http: { status: 200 } });
        } else {
          expect(result.error).toBeUndefined();
          expect(result.output).toBe(`MCP Tool Error (lookup): Error: ${message}`);
        }
        if (survivor) {
          if (quota) {
            expect(fetch).toHaveBeenCalledOnce();
            await vi.advanceTimersByTimeAsync(1999);
            expect(fetch).toHaveBeenCalledOnce();
            await vi.advanceTimersByTimeAsync(1);
          }
          await expect(survivor).resolves.toMatchObject({ output: 'survivor output' });
          expect(fetch).toHaveBeenCalledTimes(2);
          expect(Object.values(registry.getMetrics())[0]).toMatchObject({
            activeRequests: 0,
            queueDepth: 0,
            retriedRequests: 0,
          });
        }
      });
    } finally {
      finish.resolve();
      await raw.cleanup();
    }
  });
});
