// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';
import { HttpRateLimitError } from '../../../../src/util/fetch/errors';
import { fetchWithRetries } from '../../../../src/util/fetch/index';
import { setOpenAiEnv } from './setup';

describe('OpenAiResponsesProvider request building', () => {
  it('should format and call the responses API correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      object: 'response',
      created_at: 1234567890,
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          id: 'msg_abc123',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'This is a test response',
            },
          ],
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
      },
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    const result = await provider.callApi('Test prompt');

    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('/responses'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
          'X-OpenAI-Originator': 'promptfoo',
        }),
      }),
      expect.any(Number),
      'json',
      undefined,
      undefined,
    );

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('This is a test response');
    expect(result.tokenUsage?.total).toBe(30);
  });

  it('should let lowercase Authorization replace the default Responses credential', async () => {
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: { status: 'completed', output: [], usage: null },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'default-key', headers: { authorization: 'Bearer gateway-key' } },
    });

    await provider.callApi('Use the gateway credential');

    const headers = new Headers(vi.mocked(cache.fetchWithCache).mock.calls[0]![1]!.headers as any);
    expect(headers.get('authorization')).toBe('Bearer gateway-key');
  });

  it('should poll a queued background response until it is ready to grade', async () => {
    const updateCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(cache.fetchWithCache)
      .mockResolvedValueOnce({
        data: { id: 'resp_background', status: 'queued', output: [], usage: null },
        cached: false,
        status: 200,
        statusText: 'OK',
        updateCache,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'resp_background',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Background result' }],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
    const provider = new OpenAiResponsesProvider('gpt-5.5', {
      config: { apiKey: 'test-key', background: true },
    });

    const result = await provider.callApi('A long task');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Background result');
    expect(updateCache).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'resp_background', status: 'completed' }),
      200,
      'OK',
      undefined,
    );
    expect(cache.fetchWithCache).toHaveBeenNthCalledWith(
      2,
      'https://api.openai.com/v1/responses/resp_background',
      expect.objectContaining({ method: 'GET' }),
      expect.any(Number),
      'json',
      true,
      undefined,
    );
  });

  it('should honor the eval timeout for a background response on a standard model', async () => {
    setOpenAiEnv({ PROMPTFOO_EVAL_TIMEOUT_MS: '600000' });
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: { id: 'resp_background', status: 'completed', output: [], usage: null },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const provider = new OpenAiResponsesProvider('gpt-5.6', {
      config: { apiKey: 'test-key', background: true },
    });

    await provider.callApi('A long task');

    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('/responses'),
      expect.objectContaining({ method: 'POST' }),
      600000,
      'json',
      undefined,
      undefined,
    );
  });

  it('should persist a usable incomplete background response in the cache', async () => {
    const updateCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(cache.fetchWithCache)
      .mockResolvedValueOnce({
        data: { id: 'resp_background', status: 'queued', output: [], usage: null },
        cached: false,
        status: 200,
        statusText: 'OK',
        updateCache,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'resp_background',
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          output: [
            {
              type: 'message',
              role: 'assistant',
              status: 'incomplete',
              content: [{ type: 'output_text', text: 'Partial but usable output' }],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true },
    });

    const result = await provider.callApi('A long task');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Partial but usable output');
    expect(updateCache).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'resp_background', status: 'incomplete' }),
      200,
      'OK',
      undefined,
    );
  });

  it('should bill a completed background job resumed from a queued cache entry', async () => {
    const updateCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(cache.fetchWithCache)
      .mockResolvedValueOnce({
        data: { id: 'resp_background', status: 'queued', output: [], usage: null },
        cached: true,
        status: 200,
        statusText: 'OK',
        updateCache,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'resp_background',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Recovered and billable result' }],
            },
          ],
          usage: { input_tokens: 1000, output_tokens: 1000, total_tokens: 2000 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true },
    });

    const result = await provider.callApi('Recover this task');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Recovered and billable result');
    expect(result.cached).toBe(false);
    expect(result.cost).toBeGreaterThan(0);
    expect(updateCache).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'resp_background', status: 'completed' }),
      200,
      'OK',
      undefined,
    );
  });

  it('should coalesce and bill concurrent consumers of the same background response once', async () => {
    let creates = 0;
    let polls = 0;
    let creation: Promise<any> | undefined;
    const updateCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(cache.fetchWithCache).mockImplementation(async (url, options) => {
      if (String(url).endsWith('/responses') && options?.method === 'POST') {
        if (!creation) {
          creates++;
          creation = new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  data: { id: 'resp_shared', status: 'queued', output: [], usage: null },
                  cached: false,
                  status: 200,
                  statusText: 'OK',
                  updateCache,
                }),
              5,
            );
          });
        }
        return creation;
      }
      if (String(url).endsWith('/responses/resp_shared') && options?.method === 'GET') {
        polls++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          data: {
            id: 'resp_shared',
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Shared background result' }],
              },
            ],
            usage: { input_tokens: 1000, output_tokens: 1000, total_tokens: 2000 },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        };
      }
      throw new Error(`Unexpected request: ${options?.method} ${String(url)}`);
    });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true },
    });

    const results = await Promise.all([
      provider.callApi('Share this task', undefined, { abortSignal: new AbortController().signal }),
      provider.callApi('Share this task', undefined, { abortSignal: new AbortController().signal }),
    ]);

    expect(creates).toBe(1);
    expect(polls).toBe(1);
    expect(results.map((result) => result.output)).toEqual([
      'Shared background result',
      'Shared background result',
    ]);
    expect(results.filter((result) => result.cached === false)).toHaveLength(1);
    expect(results.filter((result) => result.cached === true)).toHaveLength(1);
    expect(results.filter((result) => (result.cost ?? 0) > 0)).toHaveLength(1);
    expect(results.filter((result) => result.cost === 0)).toHaveLength(1);
  });

  it('should keep a shared background job alive when only one subscriber aborts', async () => {
    let polls = 0;
    let creation: Promise<any> | undefined;
    let notifyPoll: (() => void) | undefined;
    const pollStarted = new Promise<void>((resolve) => {
      notifyPoll = resolve;
    });
    vi.mocked(cache.fetchWithCache).mockImplementation(async (url, options) => {
      if (String(url).endsWith('/responses') && options?.method === 'POST') {
        creation ??= Promise.resolve({
          data: { id: 'resp_shared_abort', status: 'queued', output: [], usage: null },
          cached: false,
          status: 200,
          statusText: 'OK',
        });
        return creation;
      }
      if (String(url).endsWith('/responses/resp_shared_abort') && options?.method === 'GET') {
        polls++;
        notifyPoll?.();
        await new Promise((resolve) => setTimeout(resolve, 15));
        return {
          data: {
            id: 'resp_shared_abort',
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Completed for remaining subscriber' }],
              },
            ],
            usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        };
      }
      throw new Error(`Unexpected request: ${options?.method} ${String(url)}`);
    });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true },
    });
    const first = new AbortController();
    const second = new AbortController();
    const pending = Promise.allSettled([
      provider.callApi('Shared cancellable task', undefined, { abortSignal: first.signal }),
      provider.callApi('Shared cancellable task', undefined, { abortSignal: second.signal }),
    ]);
    await pollStarted;
    first.abort(new Error('first subscriber cancelled'));
    const results = await pending;

    expect(polls).toBe(1);
    expect(results[0]).toMatchObject({
      status: 'rejected',
      reason: { name: 'AbortError', message: 'first subscriber cancelled' },
    });
    expect(results[1]).toMatchObject({
      status: 'fulfilled',
      value: { output: 'Completed for remaining subscriber' },
    });
    expect(cache.fetchWithCache).not.toHaveBeenCalledWith(
      expect.stringContaining('/responses/resp_shared_abort/cancel'),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should keep a shared background creation alive when one subscriber aborts before acceptance', async () => {
    let resolveCreation: ((value: any) => void) | undefined;
    const creation = new Promise<any>((resolve) => {
      resolveCreation = resolve;
    });
    let polls = 0;
    vi.mocked(cache.fetchWithCache).mockImplementation(async (url, options) => {
      if (String(url).endsWith('/responses') && options?.method === 'POST') {
        return creation;
      }
      if (String(url).endsWith('/responses/resp_shared_creation') && options?.method === 'GET') {
        polls++;
        return {
          data: {
            id: 'resp_shared_creation',
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Accepted for remaining subscriber' }],
              },
            ],
            usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        };
      }
      if (String(url).endsWith('/responses/resp_shared_creation/cancel')) {
        return { data: { status: 'cancelled' }, cached: false, status: 200, statusText: 'OK' };
      }
      throw new Error(`Unexpected request: ${options?.method} ${String(url)}`);
    });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true },
    });
    const first = new AbortController();
    const second = new AbortController();
    const pending = Promise.allSettled([
      provider.callApi('Shared pending creation', undefined, { abortSignal: first.signal }),
      provider.callApi('Shared pending creation', undefined, { abortSignal: second.signal }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    first.abort(new Error('first subscriber cancelled during creation'));
    resolveCreation?.({
      data: { id: 'resp_shared_creation', status: 'queued', output: [], usage: null },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const results = await pending;

    expect(polls).toBe(1);
    expect(results[0]).toMatchObject({
      status: 'rejected',
      reason: { name: 'AbortError', message: 'first subscriber cancelled during creation' },
    });
    expect(results[1]).toMatchObject({
      status: 'fulfilled',
      value: { output: 'Accepted for remaining subscriber' },
    });
    expect(cache.fetchWithCache).not.toHaveBeenCalledWith(
      expect.stringContaining('/responses/resp_shared_creation/cancel'),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should isolate identical background creations across repeat cache namespaces', async () => {
    let creates = 0;
    vi.mocked(cache.fetchWithCache).mockImplementation(async (url, options) => {
      if (String(url).endsWith('/responses') && options?.method === 'POST') {
        const id = `resp_repeat_${++creates}`;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return {
          data: { id, status: 'queued', output: [], usage: null },
          cached: false,
          status: 200,
          statusText: 'OK',
        };
      }
      if (String(url).includes('/responses/resp_repeat_') && options?.method === 'GET') {
        const id = String(url).split('/').at(-1);
        return {
          data: {
            id,
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: `Completed ${id}` }],
              },
            ],
            usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        };
      }
      throw new Error(`Unexpected request: ${options?.method} ${String(url)}`);
    });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true },
    });

    const results = await Promise.all([
      cache.withCacheNamespace('repeat:0', () =>
        provider.callApi('Repeated background task', undefined, {
          abortSignal: new AbortController().signal,
        }),
      ),
      cache.withCacheNamespace('repeat:1', () =>
        provider.callApi('Repeated background task', undefined, {
          abortSignal: new AbortController().signal,
        }),
      ),
    ]);

    expect(creates).toBe(2);
    expect(results.map((result) => result.output)).toEqual([
      'Completed resp_repeat_1',
      'Completed resp_repeat_2',
    ]);
  });

  it('should return a clear error and evict a cancelled background response', async () => {
    const deleteFromCache = vi.fn().mockResolvedValue(undefined);
    const updateCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(cache.fetchWithCache)
      .mockResolvedValueOnce({
        data: { id: 'resp_cancelled', status: 'queued', output: [], usage: null },
        cached: false,
        status: 200,
        statusText: 'OK',
        deleteFromCache,
        updateCache,
      })
      .mockResolvedValueOnce({
        data: { id: 'resp_cancelled', status: 'cancelled', error: null, output: [], usage: null },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true },
    });

    const result = await provider.callApi('Cancel this task');

    expect(result.error).toBe('Background response resp_cancelled was cancelled.');
    expect(deleteFromCache).toHaveBeenCalledOnce();
    expect(updateCache).not.toHaveBeenCalled();
  });

  it('should evict a background response cancelled during creation', async () => {
    const deleteFromCache = vi.fn().mockResolvedValue(undefined);
    const updateCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
      data: { id: 'resp_cancelled', status: 'cancelled', error: null, output: [], usage: null },
      cached: false,
      status: 200,
      statusText: 'OK',
      deleteFromCache,
      updateCache,
    });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true },
    });

    const result = await provider.callApi('Cancel this task immediately');

    expect(result.error).toBe('Background response resp_cancelled was cancelled.');
    expect(deleteFromCache).toHaveBeenCalledOnce();
    expect(updateCache).not.toHaveBeenCalled();
  });

  it('should not create a background response for an already-aborted eval', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true },
    });

    await expect(
      provider.callApi('Cancelled task', undefined, { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(cache.fetchWithCache).not.toHaveBeenCalled();
  });

  it('should normalize a pre-aborted custom Responses reason to AbortError', async () => {
    const controller = new AbortController();
    controller.abort(new Error('caller cancelled before dispatch'));
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true },
    });

    await expect(
      provider.callApi('Cancelled task', undefined, { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError', message: 'caller cancelled before dispatch' });
    expect(cache.fetchWithCache).not.toHaveBeenCalled();
  });

  it('should keep background creation alive and forward the eval abort signal to polling', async () => {
    const controller = new AbortController();
    vi.mocked(cache.fetchWithCache)
      .mockResolvedValueOnce({
        data: { id: 'resp_cancellable', status: 'queued', output: [], usage: null },
        cached: false,
        status: 200,
        statusText: 'OK',
      })
      .mockResolvedValueOnce({
        data: {
          id: 'resp_cancellable',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Completed before cancellation' }],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true },
    });

    const result = await provider.callApi('Cancellable task', undefined, {
      abortSignal: controller.signal,
    });

    expect(result.error).toBeUndefined();
    expect(cache.fetchWithCache).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/responses'),
      expect.objectContaining({ method: 'POST' }),
      expect.any(Number),
      'json',
      undefined,
      undefined,
    );
    expect(cache.fetchWithCache).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/responses/resp_cancellable'),
      expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) }),
      expect.any(Number),
      'json',
      true,
      undefined,
    );
    expect(vi.mocked(cache.fetchWithCache).mock.calls[0]![1]).not.toHaveProperty('signal');
  });

  it('should cancel and evict an upstream background response when the eval is aborted', async () => {
    const controller = new AbortController();
    const deleteFromCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(cache.fetchWithCache)
      .mockResolvedValueOnce({
        data: { id: 'resp_cancellable', status: 'queued', output: [], usage: null },
        cached: false,
        status: 200,
        statusText: 'OK',
        deleteFromCache,
      })
      .mockImplementationOnce(async () => {
        controller.abort();
        throw new DOMException('The operation was aborted.', 'AbortError');
      })
      .mockResolvedValueOnce({
        data: { id: 'resp_cancellable', status: 'cancelled', output: [], usage: null },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true },
    });

    await expect(
      provider.callApi('Cancel the upstream task', undefined, { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(cache.fetchWithCache).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/responses/resp_cancellable/cancel'),
      expect.objectContaining({ method: 'POST' }),
      expect.any(Number),
      'json',
      true,
      0,
    );
    expect(deleteFromCache).toHaveBeenCalledOnce();
  });

  it('should cancel an accepted background job when creation is aborted before the response arrives', async () => {
    const controller = new AbortController();
    const deleteFromCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(cache.fetchWithCache).mockImplementation(async (url, options) => {
      if (String(url).endsWith('/responses') && options?.method === 'POST') {
        return await new Promise<any>((resolve, reject) => {
          setTimeout(
            () =>
              resolve({
                data: { id: 'resp_accepted', status: 'queued', output: [], usage: null },
                cached: false,
                status: 200,
                statusText: 'OK',
                deleteFromCache,
              }),
            20,
          );
          options.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
            once: true,
          });
        });
      }
      if (String(url).endsWith('/responses/resp_accepted/cancel')) {
        return { data: {}, cached: false, status: 200, statusText: 'OK' };
      }
      throw new Error(`Unexpected request: ${options?.method} ${String(url)}`);
    });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true, maxRetries: 0 },
    });

    const pending = provider.callApi('Accept and then cancel', undefined, {
      abortSignal: controller.signal,
    });
    setTimeout(() => controller.abort(new Error('caller cancelled creation')), 5);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('/responses/resp_accepted/cancel'),
      expect.objectContaining({ method: 'POST' }),
      expect.any(Number),
      'json',
      true,
      0,
    );
    expect(deleteFromCache).toHaveBeenCalledOnce();
  });

  it('should bound polling retries by the overall background deadline', async () => {
    setOpenAiEnv({ PROMPTFOO_EVAL_TIMEOUT_MS: '20' });
    const deleteFromCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(cache.fetchWithCache).mockImplementation(async (url, options) => {
      if (String(url).endsWith('/responses') && options?.method === 'POST') {
        return {
          data: { id: 'resp_deadline', status: 'queued', output: [], usage: null },
          cached: false,
          status: 200,
          statusText: 'OK',
          deleteFromCache,
        };
      }
      if (String(url).endsWith('/responses/resp_deadline/cancel')) {
        return { data: {}, cached: false, status: 200, statusText: 'OK' };
      }
      return await new Promise<any>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
          once: true,
        });
      });
    });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true, maxRetries: 3 },
    });

    const result = await Promise.race([
      provider.callApi('Bound the polling deadline'),
      new Promise<'unbounded'>((resolve) => setTimeout(() => resolve('unbounded'), 150)),
    ]);

    expect(result).not.toBe('unbounded');
    expect((result as any).error).toContain(
      'Background response resp_deadline timed out after 20ms.',
    );
    expect(deleteFromCache).toHaveBeenCalledOnce();
  });

  it('should cancel and evict an upstream background response when polling times out', async () => {
    setOpenAiEnv({ PROMPTFOO_EVAL_TIMEOUT_MS: '10' });
    const deleteFromCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(cache.fetchWithCache)
      .mockResolvedValueOnce({
        data: { id: 'resp_timeout', status: 'queued', output: [], usage: null },
        cached: false,
        status: 200,
        statusText: 'OK',
        deleteFromCache,
      })
      .mockResolvedValueOnce({
        data: { id: 'resp_timeout', status: 'in_progress', output: [], usage: null },
        cached: false,
        status: 200,
        statusText: 'OK',
      })
      .mockResolvedValueOnce({
        data: { id: 'resp_timeout', status: 'cancelled', output: [], usage: null },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true },
    });

    const result = await provider.callApi('Time out the upstream task');

    expect(result.error).toContain('Background response resp_timeout timed out after 10ms.');
    expect(cache.fetchWithCache).toHaveBeenLastCalledWith(
      expect.stringContaining('/responses/resp_timeout/cancel'),
      expect.objectContaining({ method: 'POST' }),
      expect.any(Number),
      'json',
      true,
      0,
    );
    expect(deleteFromCache).toHaveBeenCalledOnce();
  });

  it('should cancel and evict an upstream background response after a permanent polling failure', async () => {
    const deleteFromCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(cache.fetchWithCache)
      .mockResolvedValueOnce({
        data: { id: 'resp_forbidden', status: 'queued', output: [], usage: null },
        cached: true,
        status: 200,
        statusText: 'OK',
        deleteFromCache,
      })
      .mockResolvedValueOnce({
        data: { error: { message: 'Response retrieval is forbidden' } },
        cached: false,
        status: 403,
        statusText: 'Forbidden',
      })
      .mockResolvedValueOnce({
        data: { id: 'resp_forbidden', status: 'cancelled', output: [], usage: null },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true },
    });

    const result = await provider.callApi('Stop the inaccessible task');

    expect(result.error).toContain('403 Forbidden');
    expect(cache.fetchWithCache).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/responses/resp_forbidden/cancel'),
      expect.objectContaining({ method: 'POST' }),
      expect.any(Number),
      'json',
      true,
      0,
    );
    expect(deleteFromCache).toHaveBeenCalledOnce();
  });

  it('should transparently replace a cached queued background response when its upstream ID has expired', async () => {
    const deleteFromCache = vi.fn().mockResolvedValue(undefined);
    const updateCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(cache.fetchWithCache)
      .mockResolvedValueOnce({
        data: { id: 'resp_expired', status: 'queued', output: [], usage: null },
        cached: true,
        status: 200,
        statusText: 'OK',
        deleteFromCache,
        updateCache,
      })
      .mockResolvedValueOnce({
        data: { error: { message: 'Response not found' } },
        cached: false,
        status: 404,
        statusText: 'Not Found',
      })
      .mockResolvedValueOnce({
        data: { id: 'resp_retried', status: 'queued', output: [], usage: null },
        cached: false,
        status: 200,
        statusText: 'OK',
      })
      .mockResolvedValueOnce({
        data: {
          id: 'resp_retried',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Recovered background result' }],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
    const provider = new OpenAiResponsesProvider('gpt-5.5', {
      config: { apiKey: 'test-key', background: true },
    });

    const result = await provider.callApi('A long task');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Recovered background result');
    expect(result.cached).toBe(false);
    expect(deleteFromCache).toHaveBeenCalledOnce();
    expect(updateCache).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'resp_retried', status: 'completed' }),
      200,
      'OK',
      undefined,
    );
    expect(cache.fetchWithCache).toHaveBeenNthCalledWith(
      3,
      'https://api.openai.com/v1/responses',
      expect.objectContaining({ method: 'POST' }),
      expect.any(Number),
      'json',
      false,
      undefined,
    );
  });

  it('should preserve a cached background job when polling fails transiently', async () => {
    const deleteFromCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(cache.fetchWithCache)
      .mockResolvedValueOnce({
        data: { id: 'resp_background', status: 'queued', output: [], usage: null },
        cached: true,
        status: 200,
        statusText: 'OK',
        deleteFromCache,
      })
      .mockResolvedValueOnce({
        data: { error: { message: 'Temporary retrieval outage' } },
        cached: false,
        status: 503,
        statusText: 'Service Unavailable',
      })
      .mockResolvedValueOnce({
        data: { id: 'resp_background', status: 'queued', output: [], usage: null },
        cached: true,
        status: 200,
        statusText: 'OK',
        deleteFromCache,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'resp_background',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Recovered background result' }],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
    const provider = new OpenAiResponsesProvider('gpt-5.6', {
      config: { apiKey: 'test-key', background: true },
    });

    const first = await provider.callApi('A long task');
    const second = await provider.callApi('A long task');

    expect(first.error).toContain('503 Service Unavailable');
    expect(second.error).toBeUndefined();
    expect(second.output).toBe('Recovered background result');
    expect(second.cached).toBe(false);
    expect(deleteFromCache).not.toHaveBeenCalled();
    expect(cache.fetchWithCache).toHaveBeenNthCalledWith(
      4,
      'https://api.openai.com/v1/responses/resp_background',
      expect.objectContaining({ method: 'GET' }),
      expect.any(Number),
      'json',
      true,
      undefined,
    );
  });

  it('should preserve a cached background job when the polling request throws', async () => {
    const deleteFromCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(cache.fetchWithCache)
      .mockResolvedValueOnce({
        data: { id: 'resp_background', status: 'queued', output: [], usage: null },
        cached: true,
        status: 200,
        statusText: 'OK',
        deleteFromCache,
      })
      .mockRejectedValueOnce(new Error('Temporary network failure'));
    const provider = new OpenAiResponsesProvider('gpt-5.6', {
      config: { apiKey: 'test-key', background: true },
    });

    const result = await provider.callApi('A long task');

    expect(result.error).toContain('Temporary network failure');
    expect(deleteFromCache).not.toHaveBeenCalled();
  });

  it('should preserve Retry-After metadata when background polling exhausts retries', async () => {
    const deleteFromCache = vi.fn().mockResolvedValue(undefined);
    vi.mocked(cache.fetchWithCache)
      .mockResolvedValueOnce({
        data: { id: 'resp_rate_limited', status: 'queued', output: [], usage: null },
        cached: true,
        status: 200,
        statusText: 'OK',
        deleteFromCache,
      })
      .mockRejectedValueOnce(
        new HttpRateLimitError({
          status: 429,
          statusText: 'Too Many Requests',
          code: 'rate_limit_exceeded',
          retryAfterMs: 120000,
          headers: { 'retry-after': '120' },
        }),
      );
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true },
    });

    const result = await provider.callApi('Poll later');

    expect(result.error).toContain('Rate limit exceeded');
    expect(result.metadata).toEqual({
      rateLimitKind: 'rate_limit',
      http: {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'retry-after': '120' },
      },
    });
    expect(deleteFromCache).not.toHaveBeenCalled();
  });

  it('should honor a prompt-level retry limit when creating a background response', async () => {
    vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
      data: {
        id: 'resp_no_retry',
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Completed once' }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true, maxRetries: 2 },
    });

    await provider.callApi('Create this once', {
      prompt: { raw: 'Create this once', label: 'no-retry', config: { maxRetries: 0 } },
      vars: {},
    } as any);

    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('/responses'),
      expect.objectContaining({ method: 'POST' }),
      expect.any(Number),
      'json',
      undefined,
      0,
    );
  });

  it('should consume a completed streamed background response', async () => {
    vi.mocked(fetchWithRetries).mockResolvedValueOnce(
      new Response(
        `data: ${JSON.stringify({
          type: 'response.completed',
          response: {
            id: 'resp_stream_background',
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Streamed background result' }],
              },
            ],
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          },
        })}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true, stream: true, maxRetries: 0 },
    });

    const result = await provider.callApi('Stream the background task');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Streamed background result');
    expect(result.cached).toBe(false);
    expect(fetchWithRetries).toHaveBeenCalledWith(
      expect.stringContaining('/responses'),
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('"stream":true') }),
      expect.any(Number),
      0,
    );
  });

  it('should cancel a streamed background request when the eval is aborted', async () => {
    const controller = new AbortController();
    let streamStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      streamStarted = resolve;
    });
    vi.mocked(fetchWithRetries).mockImplementationOnce(async (_url, options) => {
      const signal = options?.signal;
      const stream = new ReadableStream({
        start(streamController) {
          streamController.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({
                type: 'response.created',
                response: { id: 'resp_stream_background', status: 'in_progress' },
              })}\n\n`,
            ),
          );
          signal?.addEventListener('abort', () => {
            streamController.error(new DOMException('The operation was aborted.', 'AbortError'));
          });
          streamStarted?.();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });
    vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
      data: { id: 'resp_stream_background', status: 'cancelled', output: [], usage: null },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true, stream: true },
    });

    const result = provider.callApi('Cancel this streamed background task', undefined, {
      abortSignal: controller.signal,
    });
    await started;
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]?.body as string)).toMatchObject({
      background: true,
      stream: true,
    });
    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('/responses/resp_stream_background/cancel'),
      expect.objectContaining({ method: 'POST' }),
      expect.any(Number),
      'json',
      true,
      0,
    );
  });

  it('should cancel an accepted background response when its stream disconnects', async () => {
    vi.mocked(fetchWithRetries).mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({
                  type: 'response.created',
                  response: { id: 'resp_stream_disconnect', status: 'in_progress' },
                })}\n\n`,
              ),
            );
            setTimeout(() => controller.error(new TypeError('socket terminated')), 0);
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
    vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
      data: { status: 'cancelled' },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true, stream: true, maxRetries: 0 },
    });

    const result = await provider.callApi('Disconnect the stream');

    expect(result.error).toContain('socket terminated');
    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('/responses/resp_stream_disconnect/cancel'),
      expect.objectContaining({ method: 'POST' }),
      expect.any(Number),
      'json',
      true,
      0,
    );
  });

  it('should cancel a streamed background request when it times out after response creation', async () => {
    setOpenAiEnv({ PROMPTFOO_EVAL_TIMEOUT_MS: '20' });
    vi.mocked(fetchWithRetries).mockImplementationOnce(async (_url, options) => {
      const signal = options?.signal;
      const stream = new ReadableStream({
        start(streamController) {
          streamController.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({
                type: 'response.created',
                response: { id: 'resp_stream_timeout', status: 'in_progress' },
              })}\n\n`,
            ),
          );
          signal?.addEventListener('abort', () => {
            streamController.error(new DOMException('The operation was aborted.', 'AbortError'));
          });
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });
    vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
      data: { id: 'resp_stream_timeout', status: 'cancelled', output: [], usage: null },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true, stream: true },
    });

    const result = await provider.callApi('Time out this streamed background task');

    expect(result.error).toContain('OpenAI streaming response timed out after 20ms');
    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('/responses/resp_stream_timeout/cancel'),
      expect.objectContaining({ method: 'POST' }),
      expect.any(Number),
      'json',
      true,
      0,
    );
  });

  it('should handle system prompts correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response with system prompt',
            },
          ],
        },
      ],
      usage: { input_tokens: 15, output_tokens: 10, total_tokens: 25 },
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        instructions: 'You are a helpful assistant',
      },
    });

    await provider.callApi('Test prompt');

    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"instructions":"You are a helpful assistant"'),
      }),
      expect.any(Number),
      'json',
      undefined,
      undefined,
    );
  });

  it('should handle temperature and other parameters correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response with custom parameters',
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        temperature: 0.7,
        top_p: 0.9,
        max_completion_tokens: 1000,
      },
    });

    await provider.callApi('Test prompt');

    const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.temperature).toBe(0.7);
    expect(body.top_p).toBe(0.9);
    expect(body.max_output_tokens).toBeDefined();
  });

  it('should correctly send temperature: 0 in the request body', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Response' }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    // Test that temperature: 0 is correctly sent (not filtered out by falsy check)
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        temperature: 0,
      },
    });

    await provider.callApi('Test prompt');

    const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    // temperature: 0 should be present in the request body
    expect(body.temperature).toBe(0);
    expect('temperature' in body).toBe(true);
  });

  it('should omit default temperature and max_output_tokens when omitDefaults is true', async () => {
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        omitDefaults: true,
      },
    });

    const { body } = await provider.getOpenAiBody('Test prompt');

    expect(body.temperature).toBeUndefined();
    expect('temperature' in body).toBe(false);
    expect(body.max_output_tokens).toBeUndefined();
    expect('max_output_tokens' in body).toBe(false);
  });

  it('should use env defaults with omitDefaults when OPENAI env vars are set', async () => {
    setOpenAiEnv({
      OPENAI_TEMPERATURE: '0.5',
      OPENAI_MAX_TOKENS: '2048',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        omitDefaults: true,
      },
    });

    const { body } = await provider.getOpenAiBody('Test prompt');

    expect(body.temperature).toBe(0.5);
    expect(body.max_output_tokens).toBe(2048);
  });

  it('should correctly send max_output_tokens: 0 in the request body when explicitly set', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Response' }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    // Test that max_output_tokens: 0 is correctly sent (not filtered out by falsy check)
    // Note: While max_output_tokens: 0 is impractical, it should still be sent if explicitly configured
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        max_output_tokens: 0,
      },
    });

    await provider.callApi('Test prompt');

    const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    // max_output_tokens: 0 should be present in the request body
    expect(body.max_output_tokens).toBe(0);
    expect('max_output_tokens' in body).toBe(true);
  });

  it('should strip max_tokens from passthrough for the responses API', async () => {
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        max_output_tokens: 512,
        passthrough: { max_tokens: 16000 },
      },
    });

    const { body } = await provider.getOpenAiBody('Test prompt');

    expect(body).not.toHaveProperty('max_tokens');
    expect(body.max_output_tokens).toBe(512);
  });

  it('should forward prompt caching and include options', async () => {
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        prompt_cache_key: 'shared-prefix',
        prompt_cache_retention: '24h',
        include: ['web_search_call.results', 'reasoning.encrypted_content'],
      },
    });

    const { body } = await provider.getOpenAiBody('Test prompt');
    const { body: gpt56Body } = await new OpenAiResponsesProvider('gpt-5.6', {
      config: { apiKey: 'test-key', prompt_cache_options: { mode: 'explicit', ttl: '30m' } },
    }).getOpenAiBody('Test prompt');

    expect(body.prompt_cache_key).toBe('shared-prefix');
    expect(body.prompt_cache_retention).toBe('24h');
    expect(body.include).toEqual(['web_search_call.results', 'reasoning.encrypted_content']);
    expect(gpt56Body.prompt_cache_options).toEqual({ mode: 'explicit', ttl: '30m' });
  });

  it('should handle store parameter correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Stored response',
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        store: true,
      },
    });

    await provider.callApi('Test prompt');

    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"store":true'),
      }),
      expect.any(Number),
      'json',
      undefined,
      undefined,
    );
  });

  it('should handle various structured inputs correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response to structured input',
            },
          ],
        },
      ],
      usage: { input_tokens: 15, output_tokens: 10, total_tokens: 25 },
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    const structuredInput = JSON.stringify([
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' },
    ]);

    await provider.callApi(structuredInput);

    const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.input).toBeDefined();

    const inputStr = JSON.stringify(body.input);
    expect(inputStr).toContain('You are a helpful assistant');
    expect(inputStr).toContain('Hello');
  });

  it('should format JSON schema correctly in request body', async () => {
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: {
        id: 'resp_abc123',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: '{"result": "success"}',
              },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const config = {
      apiKey: 'test-key',
      response_format: {
        type: 'json_schema' as const,
        json_schema: {
          name: 'TestSchema',
          strict: true,
          schema: {
            type: 'object' as const,
            properties: {
              result: { type: 'string' },
            },
            required: ['result'],
            additionalProperties: false,
          },
        },
      },
    } as any;

    const provider = new OpenAiResponsesProvider('gpt-4o', { config });
    await provider.callApi('Test prompt');

    expect(vi.mocked(cache.fetchWithCache).mock.calls.length).toBeGreaterThan(0);

    const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
    expect(mockCall).toBeDefined();

    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.name).toBe('TestSchema');
    expect(body.text.format.schema).toBeDefined();
    expect(body.text.format.strict).toBe(true);
  });

  it('should handle JSON object prompt correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response to object input',
            },
          ],
        },
      ],
      usage: { input_tokens: 15, output_tokens: 10, total_tokens: 25 },
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    const objectInput = JSON.stringify({ query: 'What is the weather?', context: 'San Francisco' });
    await provider.callApi(objectInput);

    const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.input).toEqual(objectInput);
  });
});
