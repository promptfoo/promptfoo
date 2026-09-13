import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenRouterProvider } from '../../src/providers/openrouter';
import { SnowflakeCortexProvider } from '../../src/providers/snowflake';
import { withFetchRetryContext } from '../../src/util/fetch/retryContext';
import { createDeferred, mockProcessEnv } from '../util/utils';

const errorPayload = { error: { message: 'upstream unavailable', code: 'server_error' } };
const successPayload = {
  choices: [{ message: { role: 'assistant', content: 'fixture output' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
};
const responseHeaders = { 'content-type': 'application/json', 'x-request-id': 'completed-fixture' };
const context = { prompt: { raw: 'fixture', label: 'fixture' }, vars: {}, bustCache: true };
const providerOptions = {
  config: {
    apiBaseUrl: 'https://completed-http.fixture.test/v1',
    apiKey: 'fixture-key',
    maxRetries: 0,
  },
};

describe.each([
  { name: 'Chat', type: OpenAiChatCompletionProvider, hasHttpMetadata: true },
  { name: 'OpenRouter', type: OpenRouterProvider, hasHttpMetadata: false },
  { name: 'Snowflake', type: SnowflakeCortexProvider, hasHttpMetadata: false },
])('$name completed HTTP response cancellation', ({ type, hasHttpMetadata }) => {
  let restoreEnvironment: () => void;
  let target: OpenAiChatCompletionProvider;

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv();
    target = new type('fixture-model', providerOptions);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
  });

  afterEach(async () => {
    await target.cleanup();
    vi.restoreAllMocks();
    restoreEnvironment();
  });

  it.each([false, true])(
    'preserves a fully read 503 response when abort after body completion is %s',
    async (abortAfterBody) => {
      const controller = new AbortController();
      const events: string[] = [];
      const response = new Response(JSON.stringify(errorPayload), {
        status: 503,
        statusText: 'Service Unavailable',
        headers: responseHeaders,
      });
      const read = response.text.bind(response);
      // Only the transport fixture is replaced. The real Response body completes
      // before cancellation, then the real cache/fetch/provider stack resumes.
      response.text = async () => {
        const text = await read();
        events.push('body complete');
        if (abortAfterBody) {
          controller.abort(new Error('caller stopped after completed HTTP failure'));
          events.push('caller aborted');
        }
        return text;
      };
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(response);

      const result = await withFetchRetryContext(0, () =>
        target.callApi('fixture', context, { abortSignal: controller.signal }),
      );

      expect(result).toEqual({
        error: `API error: 503 Service Unavailable\n${JSON.stringify(errorPayload)}`,
        ...(hasHttpMetadata
          ? {
              metadata: {
                http: { status: 503, statusText: 'Service Unavailable', headers: responseHeaders },
              },
            }
          : {}),
      });
      expect(events).toEqual(
        abortAfterBody ? ['body complete', 'caller aborted'] : ['body complete'],
      );
      expect(response.bodyUsed).toBe(true);
      expect(controller.signal.aborted).toBe(abortAfterBody);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
    },
  );

  it.each(['AbortError', 'AbortException'])(
    'still rejects a completed 200 response with the caller %s identity',
    async (name) => {
      const controller = new AbortController();
      const reason = Object.assign(new Error('caller stopped after HTTP success'), { name });
      const response = new Response(JSON.stringify(successPayload), { status: 200 });
      const read = response.text.bind(response);
      response.text = async () => {
        const text = await read();
        controller.abort(reason);
        return text;
      };
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(response);

      await expect(
        withFetchRetryContext(0, () =>
          target.callApi('fixture', context, { abortSignal: controller.signal }),
        ),
      ).rejects.toBe(reason);
      expect(response.bodyUsed).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
    },
  );

  it('still cancels an incomplete body without resubmitting the request', async () => {
    const reading = createDeferred<void>();
    const controller = new AbortController();
    const reason = new DOMException('caller stopped during body reading', 'AbortError');
    vi.mocked(globalThis.fetch).mockImplementationOnce(async (_url, options) => {
      const response = new Response(
        new ReadableStream({
          start(stream) {
            options!.signal!.addEventListener('abort', () => stream.error(reason), { once: true });
          },
        }),
        { status: 200 },
      );
      const read = response.text.bind(response);
      response.text = () => {
        reading.resolve();
        return read();
      };
      return response;
    });
    const pending = withFetchRetryContext(0, () =>
      target.callApi('fixture', context, { abortSignal: controller.signal }),
    );
    const rejected = expect(pending).rejects.toBe(reason);
    await reading.promise;
    controller.abort(reason);
    await rejected;
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});

describe('Chat completed HTTP refusal', () => {
  let restoreEnvironment: () => void;

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnvironment();
  });

  it.each([false, true])(
    'preserves the existing refusal shape after body abort=%s',
    async (abort) => {
      const controller = new AbortController();
      const payload = { error: { code: 'invalid_prompt', message: 'upstream rejected input' } };
      const response = new Response(JSON.stringify(payload), {
        status: 400,
        statusText: 'Bad Request',
        headers: responseHeaders,
      });
      const read = response.text.bind(response);
      response.text = async () => {
        const text = await read();
        if (abort) {
          controller.abort(new Error('caller stopped after completed refusal'));
        }
        return text;
      };
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(response);
      const target = new OpenAiChatCompletionProvider('fixture-model', providerOptions);
      try {
        const result = await target.callApi('fixture', context, { abortSignal: controller.signal });
        expect(result).toEqual({
          output: `API error: 400 Bad Request\n${JSON.stringify(payload)}`,
          tokenUsage: undefined,
          cached: false,
          latencyMs: expect.any(Number),
          isRefusal: true,
          guardrails: { flagged: true, flaggedInput: true },
          metadata: { http: { status: 400, statusText: 'Bad Request', headers: responseHeaders } },
        });
        expect(controller.signal.aborted).toBe(abort);
        expect(response.bodyUsed).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledOnce();
      } finally {
        await target.cleanup();
      }
    },
  );
});
