import { getEventListeners } from 'node:events';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../src/cache';
import * as esm from '../../../src/esm';
import logger from '../../../src/logger';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import * as shared from '../../../src/providers/shared';
import { createDeferred, mockProcessEnv } from '../../util/utils';

import type { OpenAiCompletionOptions } from '../../../src/providers/openai/types';

// Flush promise continuations while the callback or SDK request stays held.
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

function toolCall(name: string) {
  return { id: `call-${name}`, type: 'function', function: { name, arguments: '{}' } };
}

function toolResponse(names: string[], legacy = false) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            ...(legacy
              ? { function_call: { name: names[0], arguments: '{}' } }
              : { tool_calls: names.map(toolCall) }),
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function provider(config: OpenAiCompletionOptions) {
  return new OpenAiChatCompletionProvider('fixture', {
    config: { apiKey: 'fixture-key', maxRetries: 0, ...config },
  });
}

describe('Chat post-response callback cancellation', () => {
  let restoreEnvironment: () => void;
  let cacheWasEnabled: boolean;

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv();
    cacheWasEnabled = cache.isCacheEnabled();
    cache.disableCache();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
    vi.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnvironment();
    if (cacheWasEnabled) {
      cache.enableCache();
    }
  });

  it.each(['two tools', 'final tool', 'legacy function'])(
    'rejects while the active callback stays held and prevents later dispatch (%s)',
    async (shape) => {
      const started = createDeferred<void>();
      const result = createDeferred<string>();
      const first = vi.fn(() => {
        started.resolve();
        return result.promise;
      });
      const second = vi.fn(async () => 'second result');
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        toolResponse(
          shape === 'two tools' ? ['first', 'second'] : ['first'],
          shape === 'legacy function',
        ),
      );
      const target = provider({ functionToolCallbacks: { first, second } });
      const controller = new AbortController();
      const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
      const rejected = vi.fn();
      const resolved = vi.fn();
      const done = pending.then(resolved, rejected);
      await started.promise;
      try {
        controller.abort();
        await nextTurn();
        expect(rejected).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ name: 'AbortError' }),
        );
        expect(resolved).not.toHaveBeenCalled();
        expect(second).not.toHaveBeenCalled();
        expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      } finally {
        result.resolve('first result');
        await done;
        await nextTurn();
      }
      expect(first).toHaveBeenCalledOnce();
      expect(second).not.toHaveBeenCalled();
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it.each([new Error('caller stopped callback'), 'caller stopped callback'])(
    'propagates caller cancellation before the held callback rejects with its reason (%s)',
    async (reason) => {
      const started = createDeferred<void>();
      const result = createDeferred<string>();
      const first = vi.fn(() => {
        started.resolve();
        return result.promise;
      });
      const second = vi.fn(async () => 'second result');
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(toolResponse(['first', 'second']));
      const controller = new AbortController();
      const pending = provider({ functionToolCallbacks: { first, second } }).callApi(
        'fixture',
        undefined,
        { abortSignal: controller.signal },
      );
      const rejected = vi.fn();
      const done = pending.then(vi.fn(), rejected);
      await started.promise;
      try {
        controller.abort(reason);
        await nextTurn();
        expect(rejected).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ name: 'AbortError', cause: reason }),
        );
        expect(second).not.toHaveBeenCalled();
      } finally {
        result.reject(reason);
        await done;
        await nextTurn();
      }
      expect(rejected).toHaveBeenCalledOnce();
      expect(second).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it('rejects while callback import stays held and never invokes it for the cancelled caller', async () => {
    const loading = createDeferred<void>();
    const module = createDeferred<Function>();
    const callback = vi.fn(async () => 'loaded result');
    const importModule = vi.spyOn(esm, 'importModule').mockImplementationOnce(() => {
      loading.resolve();
      return module.promise;
    });
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(toolResponse(['loaded']))
      .mockResolvedValueOnce(toolResponse(['loaded']));
    const target = provider({ functionToolCallbacks: { loaded: 'file://cancel-callback.js' } });
    const controller = new AbortController();
    const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
    const rejected = vi.fn();
    const done = pending.then(vi.fn(), rejected);
    await loading.promise;
    try {
      controller.abort();
      await nextTurn();
      expect(rejected).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: 'AbortError' }),
      );
      expect(callback).not.toHaveBeenCalled();
    } finally {
      module.resolve(callback);
      await done;
      await nextTurn();
    }
    expect(callback).not.toHaveBeenCalled();

    await expect(target.callApi('survivor')).resolves.toMatchObject({ output: 'loaded result' });
    expect(importModule).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();
  });

  it.each(['Error', 'AbortError', 'AbortException'])(
    'preserves the completed callback-local %s fallback when the caller later aborts',
    async (name) => {
      const started = createDeferred<void>();
      const result = createDeferred<string>();
      const controller = new AbortController();
      const callbackError = Object.assign(new Error('independent callback failure'), {
        name,
        cause: new Error('callback-local operation failed'),
      });
      const first = vi.fn(() => {
        started.resolve();
        return result.promise;
      });
      const second = vi.fn(async () => 'second result');
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(toolResponse(['first', 'second']));
      const pending = provider({ functionToolCallbacks: { first, second } }).callApi(
        'fixture',
        undefined,
        { abortSignal: controller.signal },
      );
      const preserved = expect(pending).resolves.toMatchObject({
        output: [toolCall('first'), toolCall('second')],
        metadata: { http: { status: 200 } },
      });
      await started.promise;
      result.reject(callbackError);
      await preserved;
      controller.abort(new Error('independent caller cancellation'));
      await expect(pending).resolves.toMatchObject({
        output: [toolCall('first'), toolCall('second')],
      });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('independent callback failure'),
      );
      expect(second).not.toHaveBeenCalled();
    },
  );

  it('keeps caller cancellation when the held callback later fails independently', async () => {
    const started = createDeferred<void>();
    const result = createDeferred<string>();
    const first = vi.fn(() => {
      started.resolve();
      return result.promise;
    });
    const second = vi.fn(async () => 'second result');
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(toolResponse(['first', 'second']));
    const controller = new AbortController();
    const reason = new Error('caller stopped callback');
    const rejected = vi.fn();
    const resolved = vi.fn();
    const done = provider({ functionToolCallbacks: { first, second } })
      .callApi('fixture', undefined, { abortSignal: controller.signal })
      .then(resolved, rejected);
    await started.promise;
    try {
      controller.abort(reason);
      await nextTurn();
      expect(rejected).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: 'AbortError', cause: reason }),
      );
      expect(second).not.toHaveBeenCalled();
    } finally {
      result.reject(new Error('independent late callback failure'));
      await done;
      await nextTurn();
    }
    expect(rejected).toHaveBeenCalledOnce();
    expect(resolved).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('preserves ordinary callback failure fallback and successful callback output', async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(toolResponse(['first']))
      .mockResolvedValueOnce(toolResponse(['first', 'second']));
    const first = vi
      .fn()
      .mockRejectedValueOnce(new Error('ordinary callback failure'))
      .mockResolvedValueOnce('first result');
    const second = vi.fn(async () => 'second result');
    const target = provider({ functionToolCallbacks: { first, second } });
    await expect(target.callApi('fallback')).resolves.toMatchObject({
      output: [toolCall('first')],
    });
    await expect(target.callApi('success')).resolves.toMatchObject({
      output: 'first result\nsecond result',
      tokenUsage: { total: 5 },
    });
    expect(second).toHaveBeenCalledOnce();
  });

  it.each(['two tools', 'final tool'])(
    'rejects while the real MCP client SDK request stays held (%s)',
    async (shape) => {
      vi.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined);
      vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({
        tools: ['first', 'second'].map((name) => ({
          name,
          inputSchema: { type: 'object' as const },
        })),
      });
      const started = createDeferred<void>();
      const toolResult = createDeferred<{
        content: { type: 'text'; text: string }[];
        isError?: boolean;
      }>();
      const callTool = vi.spyOn(Client.prototype, 'callTool').mockImplementationOnce(() => {
        started.resolve();
        return toolResult.promise;
      });
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        toolResponse(shape === 'two tools' ? ['first', 'second'] : ['first']),
      );
      const target = provider({
        mcp: { enabled: true, servers: [{ url: 'https://mcp.fixture.test' }] },
      });
      const controller = new AbortController();
      const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
      const rejected = vi.fn();
      const resolved = vi.fn();
      const done = pending.then(resolved, rejected);
      await started.promise;
      try {
        controller.abort();
        await nextTurn();
        expect(rejected).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ name: 'AbortError' }),
        );
        expect(resolved).not.toHaveBeenCalled();
        expect(callTool).toHaveBeenCalledOnce();
        expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      } finally {
        toolResult.resolve({ content: [{ type: 'text', text: 'first result' }] });
        await done;
        await nextTurn();
        await target.cleanup();
      }
      expect(callTool).toHaveBeenCalledOnce();
    },
  );

  it.each(['returned error', 'rejection'])(
    'preserves the selected MCP %s when abort precedes its outer continuation',
    async (settlement) => {
      vi.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined);
      vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({
        tools: ['first', 'second'].map((name) => ({
          name,
          inputSchema: { type: 'object' as const },
        })),
      });
      const content = [{ type: 'text' as const, text: 'selected tool failure' }];
      const toolResult = { content, isError: true };
      const failure = new Error('selected SDK failure');
      const callTool = vi.spyOn(Client.prototype, 'callTool').mockResolvedValue({ content: [] });
      if (settlement === 'returned error') {
        callTool.mockResolvedValueOnce(toolResult);
      } else {
        callTool.mockRejectedValueOnce(failure);
      }
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(toolResponse(['first', 'second']));
      const target = provider({
        mcp: { enabled: true, servers: [{ url: 'https://mcp.fixture.test' }] },
      });
      const controller = new AbortController();
      const reason = new Error('caller stopped after SDK outcome selection');
      const selected = vi.fn();
      const realWait = shared.waitForPromiseWithAbort;
      vi.spyOn(shared, 'waitForPromiseWithAbort').mockImplementation(
        <T>(promise: PromiseLike<T>, signal?: AbortSignal | null): Promise<T> => {
          const waiting = realWait(promise, signal);
          // Return the exact real promise; abort only after its outcome is selected.
          void waiting.then(
            (value) => {
              if (value === toolResult) {
                selected(value);
                controller.abort(reason);
              }
            },
            (error: unknown) => {
              if (error === failure) {
                selected(error);
                controller.abort(reason);
              }
            },
          );
          return waiting;
        },
      );

      try {
        const response = await target.callApi('fixture', undefined, {
          abortSignal: controller.signal,
        });
        expect(selected).toHaveBeenCalledExactlyOnceWith(
          settlement === 'returned error' ? toolResult : failure,
        );
        expect(controller.signal.reason).toBe(reason);
        expect(response).toMatchObject({
          error:
            settlement === 'returned error'
              ? `MCP Tool Error (first): ${JSON.stringify(content)}`
              : expect.stringContaining('Error: selected SDK failure'),
          metadata: { http: { status: 200 } },
        });
        if (settlement === 'returned error') {
          expect(response).toMatchObject({
            tokenUsage: { total: 5 },
            metadata: {
              toolCalls: [
                {
                  id: 'call-first',
                  name: 'first',
                  input: {},
                  output: JSON.stringify(content),
                  is_error: true,
                },
              ],
            },
          });
        }
        expect(callTool).toHaveBeenCalledOnce();
        expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      } finally {
        await target.cleanup();
      }
    },
  );

  it('preserves completed MCP tool failure metadata when the caller later aborts', async () => {
    vi.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined);
    vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({
      tools: ['first', 'second'].map((name) => ({
        name,
        inputSchema: { type: 'object' as const },
      })),
    });
    const started = createDeferred<void>();
    const toolResult = createDeferred<{
      content: { type: 'text'; text: string }[];
      isError: boolean;
    }>();
    const callTool = vi.spyOn(Client.prototype, 'callTool').mockImplementationOnce(() => {
      started.resolve();
      return toolResult.promise;
    });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(toolResponse(['first']));
    const target = provider({
      mcp: { enabled: true, servers: [{ url: 'https://mcp.fixture.test' }] },
    });
    const controller = new AbortController();
    const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
    const content = [{ type: 'text' as const, text: 'independent tool failure' }];
    const errorMessage = JSON.stringify(content);
    const preserved = expect(pending).resolves.toMatchObject({
      output: `MCP Tool Error (first): ${errorMessage}`,
      tokenUsage: { total: 5 },
      metadata: {
        http: { status: 200 },
        toolCalls: [
          {
            id: 'call-first',
            name: 'first',
            input: {},
            output: errorMessage,
            is_error: true,
          },
        ],
      },
    });
    await started.promise;
    toolResult.resolve({ content, isError: true });
    await preserved;
    controller.abort(new Error('independent caller cancellation'));
    await expect(pending).resolves.toMatchObject({
      output: `MCP Tool Error (first): ${errorMessage}`,
    });
    expect(callTool).toHaveBeenCalledOnce();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    await target.cleanup();
  });

  it.each(['returned error', 'rejection'])(
    'keeps caller cancellation when the held SDK request later settles with %s',
    async (settlement) => {
      vi.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined);
      vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({
        tools: ['first', 'second'].map((name) => ({
          name,
          inputSchema: { type: 'object' as const },
        })),
      });
      const started = createDeferred<void>();
      const result = createDeferred<{
        content: { type: 'text'; text: string }[];
        isError: boolean;
      }>();
      const callTool = vi.spyOn(Client.prototype, 'callTool').mockImplementationOnce(() => {
        started.resolve();
        return result.promise;
      });
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(toolResponse(['first', 'second']));
      const target = provider({
        mcp: { enabled: true, servers: [{ url: 'https://mcp.fixture.test' }] },
      });
      const controller = new AbortController();
      const reason = 'caller stopped MCP';
      const rejected = vi.fn();
      const resolved = vi.fn();
      const done = target
        .callApi('fixture', undefined, { abortSignal: controller.signal })
        .then(resolved, rejected);
      await started.promise;
      try {
        controller.abort(reason);
        await nextTurn();
        expect(rejected).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ name: 'AbortError', cause: reason }),
        );
        expect(callTool).toHaveBeenCalledOnce();
        expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
        expect(callTool.mock.calls[0][2]?.signal).toBeUndefined();
      } finally {
        if (settlement === 'returned error') {
          result.resolve({
            content: [{ type: 'text', text: 'independent late tool failure' }],
            isError: true,
          });
        } else {
          result.reject(new Error('independent late SDK failure'));
        }
        await done;
        await nextTurn();
        await target.cleanup();
      }
      expect(rejected).toHaveBeenCalledOnce();
      expect(resolved).not.toHaveBeenCalled();
      expect(callTool).toHaveBeenCalledOnce();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it('preserves ordinary MCP tool errors, successful results and tool metadata', async () => {
    vi.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined);
    vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({
      tools: ['first', 'second'].map((name) => ({
        name,
        inputSchema: { type: 'object' as const },
      })),
    });
    vi.spyOn(Client.prototype, 'callTool')
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'ordinary failure' }],
        isError: true,
      })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'second result' }] });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(toolResponse(['first', 'second']));
    const target = provider({
      mcp: { enabled: true, servers: [{ url: 'https://mcp.fixture.test' }] },
    });
    const firstOutput = JSON.stringify([{ type: 'text', text: 'ordinary failure' }]);
    const secondOutput = JSON.stringify([{ type: 'text', text: 'second result' }]);
    const controller = new AbortController();
    await expect(
      target.callApi('fixture', undefined, { abortSignal: controller.signal }),
    ).resolves.toMatchObject({
      output: `MCP Tool Error (first): ${firstOutput}\nMCP Tool Result (second): ${secondOutput}`,
      metadata: {
        toolCalls: [
          { id: 'call-first', name: 'first', input: {}, output: firstOutput, is_error: true },
          { id: 'call-second', name: 'second', input: {}, output: secondOutput, is_error: false },
        ],
      },
      tokenUsage: { total: 5 },
    });
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    await target.cleanup();
  });
});
