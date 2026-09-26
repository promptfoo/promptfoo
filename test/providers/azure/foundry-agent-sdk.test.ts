import { getEventListeners } from 'node:events';

import { AIProjectClient } from '@azure/ai-projects';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureFoundryAgentProvider } from '../../../src/providers/azure/foundry-agent';

vi.mock('../../../src/cache', () => ({ isCacheEnabled: () => false }));
vi.mock('../../../src/logger');

const projectUrl = 'https://fixture.services.ai.azure.com/api/projects/test';
const agent = { id: 'agent_id', name: 'test-agent' };
const responseBody = {
  id: 'response_id',
  status: 'completed',
  model: 'gpt-4.1',
  output: [
    {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'ok', annotations: [] }],
    },
  ],
  usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
};
const response = () => Response.json(responseBody);
const failure = (status: number, headers: Record<string, string> = {}, code = 'fixture_error') =>
  Response.json({ error: { code, message: 'fixture failure' } }, { status, headers });

// Use the actual project client and its bundled OpenAI SDK. Only HTTP and agent
// lookup are mocked, so SDK listeners, retry timers and errors remain exercised.
describe('Foundry SDK cancellation and retries', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: AIProjectClient;

  function provider(config: Record<string, unknown> = {}) {
    const instance = new AzureFoundryAgentProvider('test-agent', {
      config: { projectUrl, ...config },
    });
    vi.spyOn(instance as any, 'initializeClient').mockResolvedValue(client);
    return instance;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    fetchMock = vi.fn().mockImplementation(async () => response());
    vi.stubGlobal('fetch', fetchMock);
    client = new AIProjectClient(projectUrl, {
      getToken: async () => ({
        token: 'synthetic-fixture-token',
        expiresOnTimestamp: Date.now() + 86400000,
      }),
    });
    vi.spyOn(client.agents, 'get').mockResolvedValue(agent as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('releases SDK listeners across successful calls sharing a caller signal', async () => {
    const controller = new AbortController();
    const instance = provider();
    for (let i = 0; i < 12; i++) {
      expect(
        await instance.callApi('hello', undefined, { abortSignal: controller.signal }),
      ).toMatchObject({ output: 'ok' });
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    }
    expect(controller.signal.aborted).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(12);
    expect(fetchMock.mock.calls.every(([, options]) => options.signal.aborted)).toBe(true);
  });

  it.each<Record<string, string>>([{ 'retry-after-ms': '60000' }, { 'retry-after': '60' }])(
    'cancels a long retry wait without retained timers or another request (%j)',
    async (headers) => {
      fetchMock.mockResolvedValueOnce(failure(429, headers, 'rate_limit_exceeded'));
      const controller = new AbortController();
      const instance = provider({ retryOptions: { maxRetries: 1 } });
      const pending = instance.callApi('hello', undefined, { abortSignal: controller.signal });
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(1);

      controller.abort();
      await rejected;

      expect(vi.getTimerCount()).toBe(0);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(60000);
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it('preserves agent reference and logical turn accounting across a recovered retry', async () => {
    fetchMock.mockResolvedValueOnce(failure(503, { 'retry-after-ms': '0' }));
    const pending = provider({ retryOptions: { maxRetries: 1 } }).callApi('hello');
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result).toMatchObject({
      output: 'ok',
      tokenUsage: { total: 15, numRequests: 1 },
      metadata: { transportRetries: 1, usageIncomplete: true, costIncomplete: true },
    });
    expect(result.cost).toBeUndefined();
    expect(result.metadata?.knownCost).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchMock.mock.calls) {
      expect(JSON.parse(options.body)).toMatchObject({
        agent_reference: { name: 'test-agent', type: 'agent_reference' },
      });
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['connection', 'timeout'])('retries the bundled SDK %s error class', async (kind) => {
    if (kind === 'connection') {
      fetchMock.mockRejectedValueOnce(new TypeError('fixture connection failure'));
    } else {
      fetchMock.mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener(
              'abort',
              () => reject(new DOMException('fixture timeout', 'AbortError')),
              { once: true },
            );
          }),
      );
    }
    const pending = provider({ timeoutMs: 10, retryOptions: { maxRetries: 1 } }).callApi('hello');
    await vi.runAllTimersAsync();

    expect(await pending).toMatchObject({
      output: 'ok',
      tokenUsage: { numRequests: 1 },
      metadata: { transportRetries: 1 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [400, { 'x-should-retry': 'true', 'retry-after-ms': '0' }, 'fixture_error', 2],
    [503, { 'x-should-retry': 'false' }, 'fixture_error', 1],
    [401, {}, 'fixture_error', 1],
    [429, { 'x-should-retry': 'true' }, 'insufficient_quota', 1],
  ] as const)(
    'applies retry hints and hard-quota precedence for status %s (%j)',
    async (status, headers, code, attempts) => {
      fetchMock.mockResolvedValueOnce(failure(status, headers, code));
      const pending = provider({ retryOptions: { maxRetries: 1 } }).callApi('hello');
      await vi.runAllTimersAsync();
      const result = await pending;
      expect(fetchMock).toHaveBeenCalledTimes(attempts);
      if (attempts === 2) {
        expect(result.output).toBe('ok');
      } else {
        expect(result.error).toBeDefined();
        expect(result.metadata?.transportRetries).toBeUndefined();
      }
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('does not retry throttling without advancing to the server deadline', async () => {
    const retryDate = new Date(Date.now() + 60000).toUTCString();
    fetchMock.mockResolvedValueOnce(
      failure(429, { 'retry-after': retryDate }, 'rate_limit_exceeded'),
    );
    const pending = provider({ retryOptions: { maxRetries: 1 } }).callApi('hello');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(59000);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ output: 'ok', metadata: { transportRetries: 1 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts pending credential acquisition without allowing a late token to start HTTP', async () => {
    let resolveToken!: (token: { token: string; expiresOnTimestamp: number }) => void;
    const token = new Promise<{ token: string; expiresOnTimestamp: number }>((resolve) => {
      resolveToken = resolve;
    });
    const getToken = vi.fn().mockReturnValue(token);
    client = new AIProjectClient(projectUrl, { getToken });
    vi.spyOn(client.agents, 'get').mockResolvedValue(agent as any);
    const controller = new AbortController();
    const pending = provider().callApi('hello', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    expect(getToken).toHaveBeenCalledOnce();
    controller.abort();
    await rejected;
    resolveToken({ token: 'late-fixture-token', expiresOnTimestamp: Date.now() + 86400000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the public client retry default and stops at its configured limit', async () => {
    const getClient = client.getOpenAIClient.bind(client);
    vi.spyOn(client, 'getOpenAIClient').mockImplementation(() => getClient({ maxRetries: 1 }));
    fetchMock.mockImplementation(async () => failure(503, { 'retry-after-ms': '0' }));
    const pending = provider().callApi('hello');
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result.error).toContain('503');
    expect(result.tokenUsage?.numRequests).toBe(1);
    expect(result.metadata?.transportRetries).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lets an explicit zero retry limit override the client default', async () => {
    fetchMock.mockResolvedValueOnce(failure(503, { 'retry-after-ms': '60000' }));
    const result = await provider({ retryOptions: { maxRetries: 0 } }).callApi('hello');
    expect(result.error).toContain('503');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
