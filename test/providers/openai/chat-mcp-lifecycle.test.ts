import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../src/cache';
import logger from '../../../src/logger';
import { MCPClient } from '../../../src/providers/mcp/client';
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
    { timing: 'cancelled wrapped', outcome: 'success', preAborted: false },
    { timing: 'cancelled wrapped', outcome: 'failure', preAborted: false },
    { timing: 'pre-aborted raw', outcome: 'success', preAborted: true },
    { timing: 'pre-aborted raw', outcome: 'failure', preAborted: true },
  ])(
    'finishes $timing startup cleanup before its late $outcome and closes registered resources',
    async ({ outcome, preAborted }) => {
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
      // The stable connection and the late startup attempt both own resources.
      const expectedClosures = 2;
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
      if (preAborted) {
        await connecting.promise;
        controller.abort(reason);
      }
      const caller = observe(
        (preAborted ? target : wrapped).callApi('fixture', undefined, {
          abortSignal: controller.signal,
        }),
      );
      if (!preAborted) {
        await connecting.promise;
        controller.abort(reason);
      }
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
        expect(Object.values(registry.getMetrics())).toEqual(
          preAborted ? [] : [expect.objectContaining({ activeRequests: 0, failedRequests: 1 })],
        );
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
        for (const { client, transport } of connections) {
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

  it('awaits initialized MCP cleanup after a later pre-aborted caller', async () => {
    vi.mocked(Client.prototype.listTools).mockResolvedValue({ tools: [] });
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { message: { role: 'assistant', content: 'initialized' }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const closing = createDeferred<void>();
    const close = createDeferred<void>();
    vi.mocked(Client.prototype.close).mockImplementation(() => {
      closing.resolve();
      return close.promise;
    });
    // Keep the original MCP cleanup promise observable even if Chat detaches it.
    const mcpCleanup = vi.spyOn(MCPClient.prototype, 'cleanup');
    const target = new OpenAiChatCompletionProvider('fixture', {
      config: {
        apiKey: 'fixture-key',
        maxRetries: 0,
        mcp: { enabled: true, server: { command: 'fixture-mcp' } },
      },
    });
    const controller = new AbortController();
    const reason = Object.assign(new Error('second caller was already cancelled'), {
      name: 'AbortError',
    });
    let cleanup: Promise<void> | undefined;
    let cleanupSettled = false;
    let cleanupError: unknown;

    try {
      await expect(target.callApi('first')).resolves.toMatchObject({ output: 'initialized' });
      expect(Client.prototype.connect).toHaveBeenCalledOnce();
      expect(Client.prototype.listTools).toHaveBeenCalledOnce();
      expect(globalThis.fetch).toHaveBeenCalledOnce();

      controller.abort(reason);
      const stopped = observe(
        target.callApi('second', undefined, { abortSignal: controller.signal }),
      );
      await stopped.done;
      expect(stopped.state.error).toBe(reason);
      expect(stopped.state.value).toBeUndefined();
      expect(globalThis.fetch).toHaveBeenCalledOnce();

      cleanup = target.cleanup().then(
        () => {
          cleanupSettled = true;
        },
        (error: unknown) => {
          cleanupSettled = true;
          cleanupError = error;
        },
      );
      await closing.promise;
      await nextTurn();
      expect(cleanupSettled).toBe(false);
      expect(cleanupError).toBeUndefined();
      expect(mcpCleanup).toHaveBeenCalledOnce();
      expect(Client.prototype.close).toHaveBeenCalledOnce();
      expect(StdioClientTransport.prototype.close).toHaveBeenCalledOnce();

      close.resolve();
      await cleanup;
      expect(cleanupSettled).toBe(true);
      expect(cleanupError).toBeUndefined();
      const cleanedClient = mcpCleanup.mock.contexts[0];
      if (!(cleanedClient instanceof MCPClient)) {
        throw new Error('Expected the original MCP client cleanup receiver');
      }
      expect(cleanedClient.connectedServers).toEqual([]);
      expect(cleanedClient.getAllTools()).toEqual([]);
      await expect(target.cleanup()).resolves.toBeUndefined();
      expect(mcpCleanup).toHaveBeenCalledOnce();
      expect(Client.prototype.connect).toHaveBeenCalledOnce();
      expect(Client.prototype.close).toHaveBeenCalledOnce();
      expect(StdioClientTransport.prototype.close).toHaveBeenCalledOnce();
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(stopped.state.error).toBe(reason);
    } finally {
      close.resolve();
      await cleanup;
      // Join the real closure even when the old public cleanup returned too soon.
      await mcpCleanup.mock.results[0]?.value;
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
      connected.push({ client: this, transport });
      if (connected.length === 2) {
        throw connectionFailure;
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
      expect(StdioClientTransport.prototype.close).toHaveBeenCalledTimes(2);
      expect(Client.prototype.close).toHaveBeenCalledTimes(2);
      for (const { client, transport } of connected) {
        expect(
          vi.mocked(Client.prototype.close).mock.contexts.filter((value) => value === client),
        ).toHaveLength(1);
        expect(
          vi
            .mocked(StdioClientTransport.prototype.close)
            .mock.contexts.filter((value) => value === transport),
        ).toHaveLength(1);
      }
      expect(mcp.connectedServers).toEqual([]);
      expect(mcp.hasInitialized).toBe(false);
      expect(mcp.getAllTools()).toEqual([]);
      await expect(target.cleanup()).resolves.toBeUndefined();
      expect(Client.prototype.close).toHaveBeenCalledTimes(2);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      // Release fixture state even when this regression is run against the old cleanup path.
      await mcp.cleanup();
    }
  });
});
