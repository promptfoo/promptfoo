import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { OpenAiRealtimeProvider } from '../../src/providers/openai/realtime';
import { TrueFoundryEmbeddingProvider } from '../../src/providers/truefoundry';
import { XAIVoiceProvider } from '../../src/providers/xai/voice';
import { createDeferred } from '../util/utils';

import type { CallApiContextParams } from '../../src/types/index';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const context = (
  handler?: (name: string, args: string) => Promise<string>,
): CallApiContextParams => ({
  prompt: { raw: 'fixture', label: 'fixture', config: { functionCallHandler: handler } },
  vars: {},
});

it('keeps TrueFoundry embedding headers request-local during overlapping calls', async () => {
  const first = createDeferred<Awaited<ReturnType<typeof fetchWithCache>>>();
  const second = createDeferred<Awaited<ReturnType<typeof fetchWithCache>>>();
  vi.mocked(fetchWithCache).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const headers = Object.freeze({ 'X-Fixture': 'configured' });
  const provider = new TrueFoundryEmbeddingProvider('fixture/embedding', {
    config: {
      apiKey: 'fixture-key',
      headers,
      metadata: { run: 'test' },
      loggingConfig: { enabled: false },
    },
  });
  const signal = new AbortController().signal;
  const firstCall = provider.callEmbeddingApi('first', context(), { abortSignal: signal });
  const secondCall = provider.callEmbeddingApi('second');
  const headersDuringCalls = provider.config.headers;
  const response = {
    data: { data: [{ embedding: [0.1] }] },
    cached: false,
    status: 200,
    statusText: 'OK',
  };
  first.resolve(response);
  await firstCall;
  second.resolve(response);
  await secondCall;
  expect(headersDuringCalls).toBe(headers);
  expect(provider.config.headers).toBe(headers);
  expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.signal).toBe(signal);
  for (const [, request] of vi.mocked(fetchWithCache).mock.calls) {
    expect(request?.headers).toMatchObject({
      'X-Fixture': 'configured',
      'X-TFY-METADATA': '{"run":"test"}',
      'X-TFY-LOGGING-CONFIG': '{"enabled":false}',
    });
  }
});

describe.each(['OpenAI', 'xAI'] as const)('%s realtime request configuration', (name) => {
  it('keeps concurrent callback overrides out of provider defaults and later calls', async () => {
    const defaultHandler = vi.fn().mockResolvedValue('default');
    const overrideHandler = vi.fn().mockResolvedValue('override');
    const provider =
      name === 'OpenAI'
        ? new OpenAiRealtimeProvider('gpt-realtime', {
            config: { apiKey: 'fixture-key', functionCallHandler: defaultHandler },
          })
        : new XAIVoiceProvider('grok-voice-think-fast-1.0', {
            config: { apiKey: 'fixture-key', functionCallHandler: defaultHandler },
          });
    const release = createDeferred<void>();
    const method = name === 'OpenAI' ? 'directWebSocketRequest' : 'webSocketRequest';
    vi.spyOn(provider as any, method).mockImplementation(async (_prompt, handler) => {
      await release.promise;
      return {
        output: await (handler as (name: string, args: string) => Promise<string>)('fixture', '{}'),
        metadata: {},
        cost: 0,
      };
    });
    const overridden = provider.callApi('first', context(overrideHandler));
    const defaulted = provider.callApi('second', context());
    release.resolve();
    expect((await overridden).output).toBe('override');
    expect((await defaulted).output).toBe('default');
    expect((await provider.callApi('third', context())).output).toBe('default');
    expect(provider.config.functionCallHandler).toBe(defaultHandler);
    expect(overrideHandler).toHaveBeenCalledOnce();
    expect(defaultHandler).toHaveBeenCalledTimes(2);
  });
});

it('does not mutate caller-owned realtime defaults at construction', () => {
  const config = Object.freeze({ apiKey: 'fixture-key' });
  const provider = new OpenAiRealtimeProvider('gpt-realtime', { config });
  expect(config).not.toHaveProperty('maintainContext');
  expect(provider.config.maintainContext).toBe(true);
});

it('uses a persistent session after a previous stateless call', async () => {
  const provider = new OpenAiRealtimeProvider('gpt-realtime', {
    config: { apiKey: 'fixture-key' },
  });
  const response = {
    output: 'fixture',
    metadata: {},
    cached: false,
    tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 1 },
  };
  const direct = vi.spyOn(provider, 'directWebSocketRequest').mockResolvedValue(response);
  const persistent = vi.spyOn(provider, 'persistentWebSocketRequest').mockResolvedValue(response);
  await provider.callApi('standalone', context());
  await provider.callApi('conversation', {
    ...context(),
    test: { metadata: { conversationId: 0 } },
  });
  expect(direct).toHaveBeenCalledOnce();
  expect(persistent).toHaveBeenCalledOnce();
  expect(provider.config.maintainContext).toBe(true);
});

it('rotates persistent sessions when conversation identity changes', async () => {
  const provider = new OpenAiRealtimeProvider('gpt-realtime', {
    config: { apiKey: 'fixture-key' },
  });
  const close = vi.fn();
  const open = vi
    .spyOn(provider as any, 'openPersistentConnection')
    .mockImplementation(async () => {
      provider.persistentConnection ??= { close } as any;
    });
  const previousItems: Array<string | null> = [];
  vi.spyOn(provider as any, 'setupMessageHandlers').mockImplementation(async (_prompt, resolve) => {
    previousItems.push(provider.previousItemId);
    provider.previousItemId = `item-${previousItems.length}`;
    (resolve as (result: { output: string; metadata: object }) => void)({
      output: 'fixture',
      metadata: {},
    });
  });
  for (const conversationId of ['first', 'first', 'second', 'first']) {
    await provider.callApi('fixture', { ...context(), test: { metadata: { conversationId } } });
  }
  expect(previousItems).toEqual([null, 'item-1', null, null]);
  expect(close).toHaveBeenCalledTimes(2);
  expect(open).toHaveBeenCalledTimes(4);
  provider.cleanup();
});
