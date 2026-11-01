import { createMockFetchResponse } from '../../mockProviderResponses';
// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { disableCache, enableCache } from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';
import { withPrivateRangeGuard } from '../../../../src/util/fetch/guardContext';

const mockedFetchWithCache = vi.mocked(cache.fetchWithCache);

const createCompletedResponse = () =>
  createMockFetchResponse({
    id: 'resp_123',
    status: 'completed',
    model: 'gpt-4o',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'hello' }],
      },
    ],
    usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
  });

const createQueuedResponse = () =>
  createMockFetchResponse({
    id: 'resp_123',
    status: 'queued',
    model: 'gpt-4o',
    output: [],
  });

describe('OpenAI responses guarded background-poll partition', () => {
  beforeEach(() => {
    mockedFetchWithCache.mockReset();
    disableCache();
  });

  afterEach(() => {
    enableCache();
  });

  it('does not let a guarded call join an unguarded in-flight background poll', async () => {
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        apiBaseUrl: 'https://api.openai.com/v1',
        background: true,
      },
    });

    // The unguarded call's poll stays in flight while the guarded one starts.
    // If the poll key had no guard-context component, the guarded call would
    // join it and receive its response without ever executing the guarded
    // transport, so a public URL that redirects into private space would go
    // unvalidated for the guarded caller.
    let pollCalls = 0;
    let releasePoll!: (value: ReturnType<typeof createCompletedResponse>) => void;
    const pollGate = new Promise<ReturnType<typeof createCompletedResponse>>((resolve) => {
      releasePoll = resolve;
    });
    mockedFetchWithCache.mockImplementation(async (url, options) => {
      const method = (options as { method?: string } | undefined)?.method;
      if (method === 'GET' && String(url).includes('resp_123')) {
        pollCalls++;
        if (pollCalls === 1) {
          return pollGate;
        }
        return createCompletedResponse();
      }
      return createQueuedResponse();
    });

    const unguarded = provider.callApi('Hello');
    await vi.waitFor(() => expect(pollCalls).toBe(1));
    const guarded = withPrivateRangeGuard(() => provider.callApi('Hello'));
    await vi.waitFor(() => expect(pollCalls).toBe(2));
    releasePoll(createCompletedResponse());

    const [unguardedResult, guardedResult] = await Promise.all([unguarded, guarded]);
    expect(unguardedResult.output).toBe('hello');
    expect(guardedResult.output).toBe('hello');
  });

  it('still coalesces two guarded background polls with each other', async () => {
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        apiBaseUrl: 'https://api.openai.com/v1',
        background: true,
      },
    });

    let pollCalls = 0;
    let releasePoll!: (value: ReturnType<typeof createCompletedResponse>) => void;
    const pollGate = new Promise<ReturnType<typeof createCompletedResponse>>((resolve) => {
      releasePoll = resolve;
    });
    mockedFetchWithCache.mockImplementation(async (url, options) => {
      const method = (options as { method?: string } | undefined)?.method;
      if (method === 'GET' && String(url).includes('resp_123')) {
        pollCalls++;
        if (pollCalls === 1) {
          return pollGate;
        }
        return createCompletedResponse();
      }
      return createQueuedResponse();
    });

    const first = withPrivateRangeGuard(() => provider.callApi('Hello'));
    await vi.waitFor(() => expect(pollCalls).toBe(1));
    const second = withPrivateRangeGuard(() => provider.callApi('Hello'));
    // Two creates plus one shared poll: the second call joins the first.
    await vi.waitFor(() => expect(mockedFetchWithCache).toHaveBeenCalledTimes(3));
    releasePoll(createCompletedResponse());

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(pollCalls).toBe(1);
    expect(firstResult.output).toBe('hello');
    expect(secondResult.output).toBe('hello');
  });
});
