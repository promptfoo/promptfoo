import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SageMakerCompletionProvider,
  SageMakerEmbeddingProvider,
} from '../../src/providers/sagemaker';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';

import type { CallApiOptionsParams } from '../../src/types/providers';

const { send, cacheGet, isCacheEnabled, runtime, command } = vi.hoisted(() => ({
  send: vi.fn(),
  cacheGet: vi.fn(),
  isCacheEnabled: vi.fn(),
  runtime: vi.fn(),
  command: vi.fn(),
}));
vi.mock('../../src/cache', () => ({
  isCacheEnabled,
  getCache: () => ({ get: cacheGet, set: vi.fn() }),
}));
vi.mock('@aws-sdk/client-sagemaker-runtime', () => ({
  SageMakerRuntimeClient: runtime,
  InvokeEndpointCommand: command,
}));

const cases = [
  [
    'completion',
    (delay: number, options?: CallApiOptionsParams) =>
      new SageMakerCompletionProvider('offline-endpoint', {
        delay,
        config: { region: 'us-east-1', modelType: 'custom' },
      }).callApi('hello', undefined, options),
  ],
  [
    'embedding',
    (delay: number, options?: CallApiOptionsParams) =>
      new SageMakerEmbeddingProvider('offline-endpoint', {
        delay,
        config: { region: 'us-east-1', modelType: 'custom' },
      }).callEmbeddingApi('hello', undefined, options),
  ],
] as const;

describe('SageMaker cancellation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    runtime.mockImplementation(function () {
      return { send };
    });
    command.mockImplementation(function (input) {
      return input;
    });
    isCacheEnabled.mockReturnValue(false);
    send.mockResolvedValue({
      Body: new TextEncoder().encode(JSON.stringify({ output: 'ok', embedding: [1, 0] })),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it.each(cases)(
    '%s rejects an already-cancelled call before cache or SDK work',
    async (_kind, call) => {
      const controller = new AbortController();
      controller.abort();
      isCacheEnabled.mockReturnValue(true);
      const result = call(0, { abortSignal: controller.signal });
      await expect(result).rejects.toMatchObject({ name: 'AbortError' });
      expect(send).not.toHaveBeenCalled();
      expect(cacheGet).not.toHaveBeenCalled();
    },
  );

  it.each(cases)('%s cancels its own delay before dispatching a request', async (_kind, call) => {
    const controller = new AbortController();
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const result = withProviderCallExecutionContext({ abortSignal: controller.signal }, () =>
      call(10_000),
    );
    const settled = result.catch((error: Error) => error);
    await vi.waitFor(() => expect(timeout.mock.calls.some(([, ms]) => ms === 10_000)).toBe(true));
    controller.abort();
    await vi.runAllTimersAsync();
    expect(await settled).toBeInstanceOf(Error);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(cases)('%s forwards cancellation to an in-flight AWS request', async (_kind, call) => {
    const controller = new AbortController();
    let observedAbort = false;
    send.mockImplementation(
      (_command, options) =>
        new Promise((_resolve, reject) => {
          options?.abortSignal.addEventListener(
            'abort',
            () => {
              observedAbort = true;
              reject(new DOMException('AWS request aborted', 'AbortError'));
            },
            { once: true },
          );
        }),
    );
    const result = call(0, { abortSignal: controller.signal }).catch((error: Error) => error);
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0][1]).toEqual({ abortSignal: controller.signal });
    controller.abort();
    expect(await result).toMatchObject({ name: 'AbortError' });
    expect(observedAbort).toBe(true);
  });

  it.each(cases)(
    '%s combines caller cancellation with its evaluation context',
    async (_kind, call) => {
      const evaluation = new AbortController();
      const caller = new AbortController();
      send.mockImplementation(
        (_command, options) =>
          new Promise((_resolve, reject) => {
            options?.abortSignal.addEventListener(
              'abort',
              () => reject(options.abortSignal.reason),
              { once: true },
            );
          }),
      );
      const result = withProviderCallExecutionContext({ abortSignal: evaluation.signal }, () =>
        call(0, { abortSignal: caller.signal }),
      ).catch((error: Error) => error);
      await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
      expect(send.mock.calls[0][1]?.abortSignal).toBeInstanceOf(AbortSignal);
      evaluation.abort();
      expect(await result).toMatchObject({ name: 'AbortError' });
      expect(caller.signal.aborted).toBe(false);
    },
  );

  it.each(cases)(
    '%s keeps the existing SDK send contract without a signal',
    async (_kind, call) => {
      expect(await call(0)).not.toHaveProperty('error');
      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0]).toHaveLength(1);
    },
  );
});
