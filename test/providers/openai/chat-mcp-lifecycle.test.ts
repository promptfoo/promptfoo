import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../src/cache';
import logger from '../../../src/logger';
import { MCPClient } from '../../../src/providers/mcp/client';
import * as mcpUtil from '../../../src/providers/mcp/util';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { wrapProviderWithRateLimiting } from '../../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../../src/scheduler/rateLimitRegistry';
import { createDeferred, mockProcessEnv } from '../../util/utils';

import type { ProviderResponse } from '../../../src/types/providers';

function response(caller: string) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: `call-${caller}`,
                type: 'function',
                function: { name: 'lookup', arguments: JSON.stringify({ caller }) },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function observe(promise: Promise<ProviderResponse>) {
  const state: { settled: boolean; value?: ProviderResponse; error?: unknown } = { settled: false };
  const done = promise.then(
    (value) => {
      state.settled = true;
      state.value = value;
    },
    (error: unknown) => {
      state.settled = true;
      state.error = error;
    },
  );
  return { state, done };
}

// Let the public Chat/MCP promise continuations settle without releasing the held OAuth work.
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('Chat MCP caller lifetime', () => {
  let restoreEnvironment: () => void;
  let cacheWasEnabled: boolean;

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv();
    cacheWasEnabled = cache.isCacheEnabled();
    cache.disableCache();
    vi.spyOn(logger, 'error').mockImplementation(() => logger);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      const body = JSON.parse(options!.body as string);
      return response(body.messages[0].content);
    });
    vi.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined);
    vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({
      tools: [{ name: 'lookup', inputSchema: { type: 'object' } }],
    });
    vi.spyOn(Client.prototype, 'close').mockResolvedValue(undefined);
    vi.spyOn(StdioClientTransport.prototype, 'close').mockResolvedValue(undefined);
    vi.spyOn(StreamableHTTPClientTransport.prototype, 'close').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnvironment();
    if (cacheWasEnabled) {
      cache.enableCache();
    }
  });

  it.each([
    { phase: 'proactive', cancelled: 'owner' },
    { phase: 'proactive', cancelled: 'waiter' },
    { phase: 'reactive', cancelled: 'owner' },
    { phase: 'reactive', cancelled: 'waiter' },
  ])(
    'cancels the $cancelled during $phase refresh without cancelling shared setup',
    async ({ phase, cancelled }) => {
      const refreshStarted = createDeferred<void>();
      const refreshedToken = createDeferred<{ accessToken: string; expiresAt: number }>();
      const token = vi
        .spyOn(mcpUtil, 'getOAuthTokenWithExpiry')
        .mockRejectedValue(new Error('Unexpected OAuth fixture request'))
        .mockResolvedValueOnce({
          accessToken: 'initial-token',
          expiresAt: Date.now() + (phase === 'proactive' ? 30_000 : 3_600_000),
        })
        .mockImplementationOnce(() => {
          refreshStarted.resolve();
          return refreshedToken.promise;
        });
      const dispatch = vi.spyOn(Client.prototype, 'callTool').mockResolvedValue({
        content: [{ type: 'text', text: 'lookup success' }],
      });
      if (phase === 'reactive') {
        dispatch.mockRejectedValueOnce(new Error('401 Unauthorized'));
      }
      const target = new OpenAiChatCompletionProvider('fixture', {
        config: {
          apiKey: 'fixture-key',
          maxRetries: 0,
          mcp: {
            enabled: true,
            server: {
              url: 'https://mcp.fixture.test',
              auth: {
                type: 'oauth',
                grantType: 'client_credentials',
                clientId: 'fixture-client',
                clientSecret: 'fixture-secret',
                tokenUrl: 'https://auth.fixture.test/token',
              },
            },
          },
        },
      });
      const ownerController = new AbortController();
      const waiterController = new AbortController();
      const owner = observe(
        target.callApi('owner', undefined, { abortSignal: ownerController.signal }),
      );
      await refreshStarted.promise;
      const waiter = observe(
        target.callApi('waiter', undefined, { abortSignal: waiterController.signal }),
      );
      const stopped = cancelled === 'owner' ? owner : waiter;
      const survivor = cancelled === 'owner' ? waiter : owner;
      const controller = cancelled === 'owner' ? ownerController : waiterController;
      const survivingCaller = cancelled === 'owner' ? 'waiter' : 'owner';
      const initialDispatchCount = phase === 'reactive' ? 1 : 0;

      try {
        await nextTurn();
        expect(owner.state.settled).toBe(false);
        expect(waiter.state.settled).toBe(false);
        expect(token).toHaveBeenCalledTimes(2);
        expect(dispatch).toHaveBeenCalledTimes(initialDispatchCount);

        controller.abort(new Error('cancel MCP refresh wait'));
        await nextTurn();
        expect(stopped.state.settled).toBe(true);
        expect(stopped.state.error).toMatchObject({
          name: 'AbortError',
          message: 'cancel MCP refresh wait',
        });
        expect(survivor.state.settled).toBe(false);
        expect(dispatch).toHaveBeenCalledTimes(initialDispatchCount);

        refreshedToken.resolve({
          accessToken: 'refreshed-token',
          expiresAt: Date.now() + 3_600_000,
        });
        await Promise.all([owner.done, waiter.done]);
        expect(survivor.state.error).toBeUndefined();
        expect(survivor.state.value).toMatchObject({
          output: expect.stringContaining('lookup success'),
        });
        expect(dispatch).toHaveBeenCalledTimes(initialDispatchCount + 1);
        expect(dispatch.mock.calls.at(-1)?.[0]).toMatchObject({
          arguments: { caller: survivingCaller },
        });
        expect(token).toHaveBeenCalledTimes(2);
      } finally {
        refreshedToken.resolve({
          accessToken: 'refreshed-token',
          expiresAt: Date.now() + 3_600_000,
        });
        await Promise.all([owner.done, waiter.done]);
        await target.cleanup();
      }
    },
  );

  it.each(['success', 'failure'])(
    'waits for shared refresh %s during cleanup after its caller cancels',
    async (outcome) => {
      const connected: Array<{ client: Client; transport: unknown }> = [];
      vi.mocked(Client.prototype.connect).mockImplementation(async function (
        this: Client,
        transport,
      ) {
        connected.push({ client: this, transport });
      });
      vi.mocked(Client.prototype.listTools).mockResolvedValueOnce({
        tools: [{ name: 'stable-only', inputSchema: { type: 'object' } }],
      });
      const dispatch = vi.spyOn(Client.prototype, 'callTool').mockResolvedValue({ content: [] });
      const refreshStarted = createDeferred<void>();
      const refreshedToken = createDeferred<{ accessToken: string; expiresAt: number }>();
      vi.spyOn(mcpUtil, 'getOAuthTokenWithExpiry')
        .mockRejectedValue(new Error('Unexpected OAuth fixture request'))
        .mockResolvedValueOnce({ accessToken: 'initial', expiresAt: Date.now() + 30_000 })
        .mockImplementationOnce(() => {
          refreshStarted.resolve();
          return refreshedToken.promise;
        });
      let mcp!: MCPClient;
      const initialize = MCPClient.prototype.initialize;
      vi.spyOn(MCPClient.prototype, 'initialize').mockImplementation(function (this: MCPClient) {
        mcp = this;
        return initialize.call(this);
      });
      const target = new OpenAiChatCompletionProvider('fixture', {
        config: {
          apiKey: 'fixture-key',
          maxRetries: 0,
          mcp: {
            enabled: true,
            servers: [
              { name: 'stable', url: 'https://stable-mcp.fixture.test' },
              {
                name: 'oauth',
                url: 'https://oauth-mcp.fixture.test',
                auth: {
                  type: 'oauth',
                  grantType: 'client_credentials',
                  clientId: 'fixture-client',
                  clientSecret: 'fixture-secret',
                  tokenUrl: 'https://auth.fixture.test/token',
                },
              },
            ],
          },
        },
      });
      const controller = new AbortController();
      const caller = observe(
        target.callApi('fixture', undefined, { abortSignal: controller.signal }),
      );
      await refreshStarted.promise;
      controller.abort();
      await caller.done;
      let cleanupSettled = false;
      let cleanupError: unknown;
      const cleanup = target.cleanup().then(
        () => {
          cleanupSettled = true;
        },
        (error: unknown) => {
          cleanupSettled = true;
          cleanupError = error;
        },
      );
      try {
        await nextTurn();
        expect(caller.state.error).toMatchObject({ name: 'AbortError' });
        expect(cleanupSettled).toBe(false);
        expect(mcp.connectedServers).toEqual(['stable']);
        if (outcome === 'failure') {
          refreshedToken.reject(new Error('shared refresh failed'));
        } else {
          refreshedToken.resolve({ accessToken: 'refreshed', expiresAt: Date.now() + 3_600_000 });
        }
        await cleanup;
        expect(cleanupError).toBeUndefined();
        expect(connected).toHaveLength(outcome === 'success' ? 3 : 2);
        for (const connection of connected) {
          expect(
            vi
              .mocked(Client.prototype.close)
              .mock.contexts.filter((client) => client === connection.client),
          ).toHaveLength(1);
          expect(
            vi
              .mocked(StreamableHTTPClientTransport.prototype.close)
              .mock.contexts.filter((transport) => transport === connection.transport),
          ).toHaveLength(1);
        }
        expect(mcp.connectedServers).toEqual([]);
        expect(mcp.getAllTools()).toEqual([]);
        expect(dispatch).not.toHaveBeenCalled();
        expect(globalThis.fetch).toHaveBeenCalledOnce();
      } finally {
        refreshedToken.resolve({ accessToken: 'refreshed', expiresAt: Date.now() + 3_600_000 });
        await cleanup;
        await mcp.cleanup();
      }
    },
  );

  it.each(['success', 'failure'] as const)(
    'finishes cancelled startup cleanup before its late %s and closes registered resources',
    async (outcome) => {
      const connection = createDeferred<void>();
      const connecting = createDeferred<void>();
      const closed = createDeferred<void>();
      const connections: Array<{ client: Client; transport: unknown }> = [];
      vi.mocked(Client.prototype.connect).mockImplementation(function (this: Client, transport) {
        connections.push({ client: this, transport });
        if (connections.length === 1) {
          return Promise.resolve();
        }
        connecting.resolve();
        return connection.promise;
      });
      const expectedClosures = outcome === 'success' ? 2 : 1;
      vi.mocked(Client.prototype.close).mockImplementation(async () => {
        if (vi.mocked(Client.prototype.close).mock.calls.length === expectedClosures) {
          closed.resolve();
        }
      });
      let mcp!: MCPClient;
      const initialize = MCPClient.prototype.initialize;
      vi.spyOn(MCPClient.prototype, 'initialize').mockImplementation(function (this: MCPClient) {
        mcp = this;
        return initialize.call(this);
      });
      const target = new OpenAiChatCompletionProvider('fixture', {
        config: {
          apiKey: 'fixture-key',
          mcp: {
            enabled: true,
            servers: [
              { name: 'stable', command: 'fixture-mcp-stable' },
              { name: 'pending', command: 'fixture-mcp-pending' },
            ],
          },
        },
      });
      const registry = new RateLimitRegistry({ maxConcurrency: 1 });
      const wrapped = wrapProviderWithRateLimiting(target, registry);
      const controller = new AbortController();
      const reason = new Error('stop waiting for MCP startup');
      const caller = observe(
        wrapped.callApi('fixture', undefined, { abortSignal: controller.signal }),
      );
      await connecting.promise;
      controller.abort(reason);
      await caller.done;
      let cleanupSettled = false;
      let cleanupError: unknown;
      const cleanup = target.cleanup().then(
        () => {
          cleanupSettled = true;
        },
        (error: unknown) => {
          cleanupSettled = true;
          cleanupError = error;
        },
      );

      try {
        await nextTurn();
        expect(caller.state.error).toMatchObject({
          name: 'AbortError',
          message: reason.message,
          cause: reason,
        });
        expect(Object.values(registry.getMetrics())).toEqual([
          expect.objectContaining({ activeRequests: 0, failedRequests: 1 }),
        ]);
        expect(cleanupSettled).toBe(true);
        expect(cleanupError).toBeUndefined();
        expect(Client.prototype.close).not.toHaveBeenCalled();
        expect(mcp.connectedServers).toEqual(['stable']);
        await expect(target.cleanup()).resolves.toBeUndefined();

        if (outcome === 'failure') {
          connection.reject(new Error('late MCP connection failure'));
        } else {
          connection.resolve();
        }
        await closed.promise;
        await nextTurn();
        expect(cleanupError).toBeUndefined();
        expect(caller.state.error).toMatchObject({ name: 'AbortError', cause: reason });
        expect(Client.prototype.close).toHaveBeenCalledTimes(expectedClosures);
        expect(StdioClientTransport.prototype.close).toHaveBeenCalledTimes(expectedClosures);
        for (const { client, transport } of connections.slice(0, expectedClosures)) {
          expect(
            vi.mocked(Client.prototype.close).mock.contexts.filter((x) => x === client),
          ).toHaveLength(1);
          expect(
            vi
              .mocked(StdioClientTransport.prototype.close)
              .mock.contexts.filter((x) => x === transport),
          ).toHaveLength(1);
        }
        expect(mcp.connectedServers).toEqual([]);
        expect(mcp.getAllTools()).toEqual([]);
        expect(globalThis.fetch).not.toHaveBeenCalled();
      } finally {
        connection.resolve();
        await cleanup;
        await mcp.cleanup();
        registry.dispose();
      }
    },
  );

  it('keeps normal cleanup awaited after another initialization caller survives', async () => {
    const connection = createDeferred<void>();
    const connecting = createDeferred<void>();
    vi.mocked(Client.prototype.connect).mockImplementation(() => {
      connecting.resolve();
      return connection.promise;
    });
    vi.mocked(Client.prototype.listTools).mockResolvedValue({ tools: [] });
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'survived' }, finish_reason: 'stop' }],
        }),
      ),
    );
    const target = new OpenAiChatCompletionProvider('fixture', {
      config: {
        apiKey: 'fixture-key',
        mcp: { enabled: true, server: { command: 'fixture-mcp' } },
      },
    });
    const controller = new AbortController();
    const stopped = observe(
      target.callApi('cancelled', undefined, { abortSignal: controller.signal }),
    );
    await connecting.promise;
    const survivor = observe(target.callApi('survivor'));
    controller.abort('only the first caller stopped');
    await stopped.done;
    expect(stopped.state.error).toMatchObject({
      name: 'AbortError',
      cause: 'only the first caller stopped',
    });
    expect(survivor.state.settled).toBe(false);

    const closing = createDeferred<void>();
    const close = createDeferred<void>();
    vi.mocked(Client.prototype.close).mockImplementation(() => {
      closing.resolve();
      return close.promise;
    });
    let cleanup: Promise<void> | undefined;
    try {
      connection.resolve();
      await survivor.done;
      expect(survivor.state.error).toBeUndefined();
      expect(survivor.state.value).toMatchObject({ output: 'survived' });
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      let cleanupSettled = false;
      cleanup = target.cleanup().then(() => {
        cleanupSettled = true;
      });
      await closing.promise;
      await nextTurn();
      expect(cleanupSettled).toBe(false);
      close.resolve();
      await cleanup;
      expect(Client.prototype.connect).toHaveBeenCalledOnce();
      expect(Client.prototype.close).toHaveBeenCalledOnce();
      expect(StdioClientTransport.prototype.close).toHaveBeenCalledOnce();
    } finally {
      connection.resolve();
      close.resolve();
      await survivor.done;
      await cleanup;
      await target.cleanup();
    }
  });

  it('releases registered resources after partial initialization fails and preserves that error', async () => {
    const connected: Array<{ client: Client; transport: unknown }> = [];
    const connectionFailure = new Error('second MCP connection failed');
    vi.mocked(Client.prototype.connect).mockImplementation(async function (
      this: Client,
      transport,
    ) {
      if (connected.length === 1) {
        throw connectionFailure;
      }
      connected.push({ client: this, transport });
    });
    let mcp!: MCPClient;
    const initialize = MCPClient.prototype.initialize;
    vi.spyOn(MCPClient.prototype, 'initialize').mockImplementation(function (this: MCPClient) {
      mcp = this;
      return initialize.call(this);
    });
    const target = new OpenAiChatCompletionProvider('fixture', {
      config: {
        apiKey: 'fixture-key',
        mcp: {
          enabled: true,
          servers: [
            { name: 'first', command: 'fixture-mcp-first' },
            { name: 'second', command: 'fixture-mcp-second' },
          ],
        },
      },
    });
    let initializationError: unknown;
    try {
      await target.callApi('fixture');
    } catch (error) {
      initializationError = error;
    }
    expect(initializationError).toBeInstanceOf(Error);
    expect(String(initializationError)).toContain('second MCP connection failed');
    expect(mcp.connectedServers).toEqual(['first']);
    expect(mcp.hasInitialized).toBe(true);

    try {
      await expect(target.cleanup()).rejects.toBe(initializationError);
      expect(StdioClientTransport.prototype.close).toHaveBeenCalledOnce();
      expect(vi.mocked(StdioClientTransport.prototype.close).mock.contexts[0]).toBe(
        connected[0].transport,
      );
      expect(Client.prototype.close).toHaveBeenCalledOnce();
      expect(vi.mocked(Client.prototype.close).mock.contexts[0]).toBe(connected[0].client);
      expect(mcp.connectedServers).toEqual([]);
      expect(mcp.hasInitialized).toBe(false);
      expect(mcp.getAllTools()).toEqual([]);
      await expect(target.cleanup()).resolves.toBeUndefined();
      expect(Client.prototype.close).toHaveBeenCalledOnce();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      // Release fixture state even when this regression is run against the old cleanup path.
      await mcp.cleanup();
    }
  });
});
