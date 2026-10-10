import { createApiKeyOptions, createStreamingOptions } from '../../../factories/literalFixtures';
import { createMockFetchResponse } from '../../mockProviderResponses';
// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import { handleFinishReason } from '../../../../src/assertions/finishReason';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';
import { extractProviderResponseAttributes } from '../../../../src/tracing/genaiTracer';
import { fetchWithRetries } from '../../../../src/util/fetch/index';
import { mockProcessEnv } from '../../../util/utils';

import type { AssertionParams } from '../../../../src/types/index';

describe('OpenAiResponsesProvider HTTP metadata', () => {
  it('should include HTTP metadata in response', async () => {
    const mockHeaders = {
      'content-type': 'application/json',
      'x-request-id': 'test-request-123',
      'x-litellm-model-group': 'gpt-4o',
    };
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          id: 'msg_abc123',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Test response' }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: mockHeaders,
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', createApiKeyOptions());

    const result = await provider.callApi('Test prompt');

    expect(result.metadata).toBeDefined();
    expect(result.metadata?.http).toBeDefined();
    expect(result.metadata?.http?.status).toBe(200);
    expect(result.metadata?.http?.statusText).toBe('OK');
    expect(result.metadata?.http?.headers).toEqual(mockHeaders);
    expect(result.metadata?.responseStatus).toBe('completed');
    expect(result.metadata?.incompleteReason).toBeUndefined();
    expect(result.finishReason).toBeUndefined();
    expect(result.output).toBe('Test response');
  });

  it.each([
    { cached: false, stream: false },
    { cached: true, stream: false },
    { cached: false, stream: true },
  ])(
    'should expose length-limited output (cached: $cached, stream: $stream)',
    async ({ cached, stream }) => {
      const mockApiResponse = {
        id: 'resp_incomplete',
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            id: 'msg_incomplete',
            status: 'incomplete',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Partial answer' }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      };
      if (stream) {
        vi.mocked(fetchWithRetries).mockResolvedValue(
          new Response(
            `event: response.incomplete\ndata: ${JSON.stringify({ type: 'response.incomplete', response: mockApiResponse })}\n\n`,
            { headers: { 'content-type': 'text/event-stream' } },
          ),
        );
      } else {
        vi.mocked(cache.fetchWithCache).mockResolvedValue({
          data: mockApiResponse,
          cached,
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
        });
      }
      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: { apiKey: 'test-key', stream },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Partial answer');
      expect(result.raw).toEqual(mockApiResponse);
      expect(result.finishReason).toBe('length');
      expect(result.metadata).toMatchObject({
        responseStatus: 'incomplete',
        incompleteReason: 'max_output_tokens',
        http: { status: 200 },
      });
      expect(result.tokenUsage).toEqual(
        cached
          ? { cached: 30, total: 30, numRequests: 1 }
          : { prompt: 10, completion: 20, total: 30, numRequests: 1 },
      );
      expect(extractProviderResponseAttributes(result).finishReasons).toEqual(['length']);
      expect(
        handleFinishReason({
          assertion: { type: 'finish-reason', value: 'length' },
          providerResponse: result,
        } as AssertionParams),
      ).toMatchObject({ pass: true, score: 1 });
    },
  );

  it('should include HTTP metadata in error response', async () => {
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: { error: { message: 'Rate limit exceeded' } },
      cached: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'retry-after': '60' },
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', createApiKeyOptions());

    const result = await provider.callApi('Test prompt');

    expect(result.error).toBeDefined();
    expect(result.metadata?.http?.status).toBe(429);
    expect(result.metadata?.http?.statusText).toBe('Too Many Requests');
    expect(result.metadata?.http?.headers).toEqual({ 'retry-after': '60' });
  });

  it('should handle truncation information correctly', async () => {
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
              text: 'Truncated response',
            },
          ],
        },
      ],
      truncation: {
        tokens_truncated: 100,
        tokens_remaining: 200,
        token_limit: 4096,
      },
      usage: { input_tokens: 3896, output_tokens: 100, total_tokens: 3996 },
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue(createMockFetchResponse(mockApiResponse));

    const provider = new OpenAiResponsesProvider('gpt-4o', createApiKeyOptions());

    const result = await provider.callApi('Very long prompt that would be truncated');

    expect(result.raw).toHaveProperty('truncation');
    expect(result.raw.truncation.tokens_truncated).toBe(100);
  });

  it('should handle streaming responses correctly', async () => {
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
              text: 'Streaming response',
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    vi.mocked(fetchWithRetries).mockResolvedValue(
      new Response(
        `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: mockApiResponse })}\n\ndata: [DONE]\n\n`,
        { status: 200, statusText: 'OK', headers: { 'content-type': 'text/event-stream' } },
      ),
    );

    const provider = new OpenAiResponsesProvider('gpt-4o', createStreamingOptions());

    const result = await provider.callApi('Test prompt');

    expect(fetchWithRetries).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"stream":true'),
      }),
      expect.any(Number),
      undefined,
    );
    expect(result.output).toBe('Streaming response');
  });

  it.each([false, true])(
    'aborts the transport after a parser error with background=%s',
    async (background) => {
      let signal: AbortSignal | null | undefined;
      let finishResponse = () => {};
      let loggingRead: Promise<string> | undefined;
      const cancellationSignals: boolean[] = [];
      const closeTransport = vi.fn(() => finishResponse());
      vi.mocked(cache.fetchWithCache).mockImplementation(async () => {
        cancellationSignals.push(signal?.aborted === true);
        return { data: { status: 'cancelled' }, cached: false, status: 200, statusText: 'OK' };
      });
      vi.mocked(fetchWithRetries).mockImplementation(async (_url, options) => {
        signal = options?.signal;
        const response = new Response(
          new ReadableStream({
            start(controller) {
              let closed = false;
              finishResponse = () => {
                if (!closed) {
                  closed = true;
                  controller.close();
                }
              };
              controller.enqueue(
                new TextEncoder().encode(
                  (background
                    ? 'data: {"type":"response.created","response":{"id":"resp_fixture","status":"in_progress"}}\n\n'
                    : '') + 'data: {"type":"error","message":"fixture failure"}\n\n',
                ),
              );
            },
          }),
        );
        signal?.addEventListener('abort', closeTransport, { once: true });
        loggingRead = response.clone().text();
        return response;
      });

      try {
        const result = await new OpenAiResponsesProvider('gpt-4o', {
          config: { apiKey: 'test-key', stream: true, background },
        }).callApi('Test prompt');
        expect(result.error).toContain('fixture failure');
        expect(result.error).not.toContain('timed out');
        expect(signal?.aborted).toBe(true);
        expect(closeTransport).toHaveBeenCalledOnce();
        expect(cancellationSignals).toEqual(background ? [true] : []);
      } finally {
        signal?.removeEventListener('abort', closeTransport);
        finishResponse();
        await loggingRead;
      }
    },
  );

  it('times out and cancels a response body that stalls after headers', async () => {
    vi.useFakeTimers();
    const restoreEnv = mockProcessEnv({ REQUEST_TIMEOUT_MS: '20' });
    const cancel = vi.fn();
    vi.mocked(fetchWithRetries).mockResolvedValue(new Response(new ReadableStream({ cancel })));
    try {
      const pending = new OpenAiResponsesProvider('gpt-4o', {
        config: { apiKey: 'test-key', stream: true },
      }).callApi('Test prompt');
      await vi.runAllTimersAsync();
      const result = await pending;
      expect(result.error).toContain('OpenAI streaming response timed out after 20ms');
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
      restoreEnv();
    }
  });

  it('cancels an open response body when the eval is cancelled', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    let started!: () => void;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.mocked(fetchWithRetries).mockResolvedValue(
      new Response(
        new ReadableStream(
          {
            pull() {
              started();
            },
            cancel,
          },
          { highWaterMark: 0 },
        ),
      ),
    );
    const pending = new OpenAiResponsesProvider('gpt-4o', {
      config: { apiKey: 'test-key', stream: true },
    }).callApi('Cancellable stream', undefined, { abortSignal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await reading;
    controller.abort();
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
  });
});
