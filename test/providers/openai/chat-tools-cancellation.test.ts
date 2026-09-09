import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../src/cache';
import * as esm from '../../../src/esm';
import logger from '../../../src/logger';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { createDeferred, mockProcessEnv } from '../../util/utils';

import type { OpenAiCompletionOptions } from '../../../src/providers/openai/types';

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
    'rejects after an active callback settles and prevents later dispatch (%s)',
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
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await started.promise;
      controller.abort();
      result.resolve('first result');
      await rejected;
      expect(first).toHaveBeenCalledOnce();
      expect(second).not.toHaveBeenCalled();
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it.each([new Error('caller stopped callback'), 'caller stopped callback'])(
    'propagates a callback rejection with the caller reason through every fallback (%s)',
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
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError', cause: reason });
      await started.promise;
      controller.abort(reason);
      result.reject(reason);
      await rejected;
      expect(second).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it('checks after asynchronous module loading before invoking the loaded callback', async () => {
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
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await loading.promise;
    controller.abort();
    module.resolve(callback);
    await rejected;
    expect(callback).not.toHaveBeenCalled();

    await expect(target.callApi('survivor')).resolves.toMatchObject({ output: 'loaded result' });
    expect(importModule).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();
  });

  it.each(['Error', 'AbortError', 'AbortException'])(
    'preserves an unrelated callback-local %s after the caller independently aborts',
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
        error: expect.stringContaining(`${name}: independent callback failure`),
        metadata: { http: { status: 200 } },
      });
      await started.promise;
      controller.abort(new Error('independent caller cancellation'));
      result.reject(callbackError);
      await preserved;
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('independent callback failure'),
      );
      expect(second).not.toHaveBeenCalled();
    },
  );

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
    'checks after the real MCP client awaits its SDK tool request (%s)',
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
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await started.promise;
      controller.abort();
      toolResult.resolve({
        content: [{ type: 'text', text: 'first result' }],
      });
      await rejected;
      expect(callTool).toHaveBeenCalledOnce();
      await target.cleanup();
    },
  );

  it('preserves a returned MCP tool failure after caller abort and prevents later tool dispatch', async () => {
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
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(toolResponse(['first', 'second']));
    const target = provider({
      mcp: { enabled: true, servers: [{ url: 'https://mcp.fixture.test' }] },
    });
    const controller = new AbortController();
    const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
    const content = [{ type: 'text' as const, text: 'independent tool failure' }];
    const errorMessage = JSON.stringify(content);
    const preserved = expect(pending).resolves.toMatchObject({
      error: `MCP Tool Error (first): ${errorMessage}`,
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
    controller.abort(new Error('independent caller cancellation'));
    toolResult.resolve({ content, isError: true });
    await preserved;
    expect(callTool).toHaveBeenCalledOnce();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    await target.cleanup();
  });

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
    await expect(target.callApi('fixture')).resolves.toMatchObject({
      output: `MCP Tool Error (first): ${firstOutput}\nMCP Tool Result (second): ${secondOutput}`,
      metadata: {
        toolCalls: [
          { id: 'call-first', name: 'first', input: {}, output: firstOutput, is_error: true },
          { id: 'call-second', name: 'second', input: {}, output: secondOutput, is_error: false },
        ],
      },
      tokenUsage: { total: 5 },
    });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    await target.cleanup();
  });
});
