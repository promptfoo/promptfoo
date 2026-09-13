import { getEventListeners } from 'node:events';

import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { expect, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { createDeferred } from './utils';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';

import type { ProviderResponse } from '../../src/types/providers';

/** Real target/cache/tool-span boundary shared by the finite strategy continuation tests. */
export function createSelectedToolErrorTarget(
  successesBeforeError = 0,
  callbackOutcome: 'error' | 'success' = 'error',
) {
  const controller = new AbortController();
  const completion = createDeferred<void>();
  const callbackStarted = createDeferred<void>();
  const finishCallback = createDeferred<void>();
  const events: string[] = [];
  const failure = Object.freeze(new Error('Completed lookup service returned 429 rate limit'));
  const reason = Object.freeze(
    Object.assign(new Error('caller observed completed tool'), {
      name: 'AbortError',
    }),
  );
  const spans: { aborted: boolean; status: unknown }[] = [];
  const processor: SpanProcessor = {
    onStart() {},
    onEnd(span) {
      if (span.name === 'execute_tool lookup') {
        spans.push({ aborted: controller.signal.aborted, status: span.status });
        events.push('tool completed');
        completion.resolve();
      }
    },
    async forceFlush() {},
    async shutdown() {},
  };
  const tracerProvider = new NodeTracerProvider({ spanProcessors: [processor] });
  tracerProvider.register();
  const policy = completion.promise.then(() => {
    events.push('caller abort');
    controller.abort(reason);
  });
  let holdCallback = false;
  const callback = vi.fn(async () => {
    expect(trace.getActiveSpan()?.isRecording()).toBe(true);
    expect(controller.signal.aborted).toBe(false);
    callbackStarted.resolve();
    if (holdCallback) {
      await finishCallback.promise;
    }
    if (callbackOutcome === 'success') {
      events.push('tool success');
      return 'Hello from the callback';
    }
    events.push('independent tool failure');
    throw failure;
  });
  const target = new OpenAiChatCompletionProvider('gpt-4o-mini', {
    config: {
      apiBaseUrl: 'https://completed-tool.fixture.test/v1',
      apiKey: 'fixture-key',
      maxRetries: 0,
      functionToolCallbacks: { lookup: callback },
    },
  });
  const calls = vi.spyOn(target, 'callApi');
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    expect(url).toBe('https://completed-tool.fixture.test/v1/chat/completions');
    const ordinary = fetch.mock.calls.length <= successesBeforeError;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: ordinary
              ? { role: 'assistant', content: 'Please provide the example reference number.' }
              : {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'lookup-call',
                      type: 'function',
                      function: { name: 'lookup', arguments: '{}' },
                    },
                  ],
                },
            finish_reason: ordinary ? 'stop' : 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });

  return {
    target,
    controller,
    reason,
    callbackStarted: callbackStarted.promise,
    holdCallback() {
      holdCallback = true;
    },
    finishCallback() {
      finishCallback.resolve();
    },
    async run<T>(call: () => Promise<T>): Promise<T> {
      return withCacheEnabled(false, () =>
        trace
          .getTracer('completed-tool-test')
          .startActiveSpan('application caller', async (span) => {
            try {
              return await call();
            } finally {
              span.end();
            }
          }),
      );
    },
    async expectSelected(result: ProviderResponse) {
      expect(
        callback.mock.calls.length,
        JSON.stringify({
          error: result.error,
          events,
          targetCalls: calls.mock.calls.length,
          fetchCalls: fetch.mock.calls.length,
        }),
      ).toBe(1);
      expect(events).toContain('tool completed');
      await policy;
      const completed = (await calls.mock.results.at(-1)!.value) as ProviderResponse;
      expect(completed.error).toContain(failure.message);
      expect(completed.metadata?.errorOrigin).toBe('tool');
      expect(result.error).toBe(completed.error);
      expect(result.metadata?.errorOrigin).toBe('tool');
      expect(result.tokenUsage).toMatchObject({
        total: 5 * (successesBeforeError + 1),
        numRequests: successesBeforeError + 1,
      });
      expect(result.metadata).not.toHaveProperty('http');
      expect(result.metadata).not.toHaveProperty('headers');
      expect(fetch).toHaveBeenCalledTimes(successesBeforeError + 1);
      expect(callback).toHaveBeenCalledOnce();
      expect(calls).toHaveBeenCalledTimes(successesBeforeError + 1);
      expect(events).toEqual(['independent tool failure', 'tool completed', 'caller abort']);
      expect(spans).toEqual([
        { aborted: false, status: { code: SpanStatusCode.ERROR, message: failure.message } },
      ]);
      expect(controller.signal.reason).toBe(reason);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    },
    async cleanup() {
      controller.abort(reason);
      finishCallback.resolve();
      await Promise.allSettled(
        calls.mock.results.filter((r) => r.type === 'return').map((r) => r.value),
      );
      completion.resolve();
      await policy;
      await target.cleanup();
      await tracerProvider.shutdown();
      trace.disable();
      context.disable();
      propagation.disable();
      fetch.mockRestore();
      calls.mockRestore();
    },
  };
}

/** Real Chat entry and shared-catch fixture; no completed response or tool is fabricated. */
export function createPredispatchAbortTarget(reason: Error | string, cancelOnEntry = true) {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  const controller = new AbortController();
  const descriptors =
    reason instanceof Error ? Object.getOwnPropertyDescriptors(reason) : undefined;
  const events: string[] = [];
  const target = new OpenAiChatCompletionProvider('gpt-4o-mini', {
    config: {
      apiBaseUrl: 'https://predispatch-abort.fixture.test/v1',
      apiKey: 'fixture-key',
      maxRetries: 0,
    },
  });
  function cancel() {
    events.push('caller abort');
    controller.abort(reason);
  }
  const originalCall = target.callApi.bind(target);
  const calls = vi.spyOn(target, 'callApi').mockImplementation((...args) => {
    events.push('target entered');
    if (cancelOnEntry) {
      cancel();
    }
    // Preserve the actual receiver, arguments and promise. Chat owns the rejection.
    return originalCall(...args);
  });
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Unexpected target HTTP'));
  return {
    target,
    controller,
    events,
    cancel,
    run<T>(call: () => Promise<T>) {
      return withCacheEnabled(false, call).then(
        (value) => ({ value, error: undefined }),
        (error: unknown) => ({ value: undefined, error }),
      );
    },
    async expectRejected(outcome: { value: unknown; error: unknown }) {
      expect(calls).toHaveBeenCalledOnce();
      expect(fetch).not.toHaveBeenCalled();
      const entry = await calls.mock.results[0].value.then(
        (value: ProviderResponse) => ({ value, error: undefined }),
        (error: unknown) => ({ value: undefined, error }),
      );
      expect(entry.value).toBeUndefined();
      if (reason instanceof Error) {
        expect(entry.error).toBe(reason);
        expect(Object.getOwnPropertyDescriptors(reason)).toEqual(descriptors);
      } else {
        expect(entry.error).toMatchObject({ name: 'AbortError', message: reason, cause: reason });
      }
      // A response with tokenUsage.numRequests=1 is not an acceptable cancellation.
      expect(outcome.value, JSON.stringify(outcome.value)).toBeUndefined();
      expect(outcome.error).toBe(entry.error);
      expect(controller.signal.reason).toBe(reason);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    },
    async cleanup() {
      controller.abort();
      await target.cleanup();
      calls.mockRestore();
      fetch.mockRestore();
      vi.useRealTimers();
    },
  };
}
