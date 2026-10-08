import { afterEach, describe, expect, it, vi } from 'vitest';
import { callGradingProvider, callProviderWithContext } from '../../src/matchers/providers';
import {
  callProviderWithContext as callDelegatedProvider,
  withProviderCallExecutionContext,
  withProviderCallTracingContext,
} from '../../src/scheduler/providerCallExecutionContext';
import { ProviderGroupedCallQueue } from '../../src/scheduler/providerCallQueue';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { createMockProvider } from '../factories/provider';
import { createDeferred } from '../util/utils';

import type { ProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';
import type {
  ApiProvider,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderResponse,
  RateLimitRegistryRef,
  VarValue,
} from '../../src/types/index';

function createProvider(response: ProviderResponse = { output: 'ok' }): ApiProvider {
  return createMockProvider({ id: 'test-grader', response });
}

function createRegistry(): RateLimitRegistryRef & {
  executeSpy: ReturnType<typeof vi.fn>;
  disposeSpy: ReturnType<typeof vi.fn>;
} {
  const executeSpy = vi.fn();
  const disposeSpy = vi.fn();

  return {
    async execute(provider, callFn, options) {
      executeSpy(provider, callFn, options);
      return callFn();
    },
    dispose() {
      disposeSpy();
    },
    executeSpy,
    disposeSpy,
  };
}

describe('callProviderWithContext', () => {
  const vars: Record<string, VarValue> = { question: 'What is two plus two?' };

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('calls the provider directly without scheduler execution context', async () => {
    const response = { output: 'direct response' };
    const provider = createProvider(response);

    await expect(callProviderWithContext(provider, 'grade this', 'rubric', vars)).resolves.toBe(
      response,
    );

    expect(provider.callApi).toHaveBeenCalledWith('grade this', {
      isGrading: true,
      prompt: { raw: 'grade this', label: 'rubric' },
      vars,
    });
  });

  it('uses the scheduler execution context when available', async () => {
    const provider = createProvider();
    const registry = createRegistry();

    await withProviderCallExecutionContext({ rateLimitRegistry: registry }, () =>
      callProviderWithContext(provider, 'grade this', 'rubric', vars),
    );

    expect(registry.executeSpy).toHaveBeenCalledWith(
      provider,
      expect.any(Function),
      expect.objectContaining({
        getHeaders: expect.any(Function),
        isRateLimited: expect.any(Function),
        getRetryAfter: expect.any(Function),
      }),
    );
    expect(provider.callApi).toHaveBeenCalledWith('grade this', {
      isGrading: true,
      prompt: { raw: 'grade this', label: 'rubric' },
      vars,
    });
  });

  it('propagates abort signals from the scheduler execution context', async () => {
    const provider = createProvider();
    const registry = createRegistry();
    const abortController = new AbortController();

    await withProviderCallExecutionContext(
      { abortSignal: abortController.signal, rateLimitRegistry: registry },
      () => callProviderWithContext(provider, 'grade this', 'rubric', vars),
    );

    expect(provider.callApi).toHaveBeenCalledWith(
      'grade this',
      {
        isGrading: true,
        prompt: { raw: 'grade this', label: 'rubric' },
        vars,
      },
      { abortSignal: abortController.signal },
    );
  });

  it('traces grading providers while preserving scheduler and cancellation context', async () => {
    const provider = createProvider();
    const registry = createRegistry();
    const abortController = new AbortController();
    const traceparent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
    const originalContext = {
      isGrading: false,
      prompt: { raw: 'original input', label: 'target' },
      vars: { original: 'value' },
      evaluationId: 'evaluation-123',
      testIdx: 2,
      bustCache: true,
      traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-aaaaaaaaaaaaaaaa-01',
      tracestate: 'vendor=state',
    };
    const withProviderSpan: ProviderCallTracingContext['withProviderSpan'] = async (
      { callContext },
      invoke,
    ) => invoke({ ...callContext!, traceparent });
    const providerSpan = vi.fn(withProviderSpan);

    await withProviderCallExecutionContext(
      { abortSignal: abortController.signal, rateLimitRegistry: registry },
      () =>
        withProviderCallTracingContext(
          {
            getActiveTraceparent: () => traceparent,
            withGraderSpan: async (_options, invoke) => invoke(),
            withProviderSpan: providerSpan,
          },
          () => callProviderWithContext(provider, 'grade this', 'rubric', vars, originalContext),
        ),
    );

    expect(originalContext.isGrading).toBe(false);
    expect(registry.executeSpy).toHaveBeenCalledTimes(1);
    expect(providerSpan).toHaveBeenCalledWith(
      expect.objectContaining({ provider, role: 'grader', promptLabel: 'rubric' }),
      expect.any(Function),
    );
    expect(provider.callApi).toHaveBeenCalledWith(
      'grade this',
      {
        isGrading: true,
        prompt: { raw: 'grade this', label: 'rubric' },
        vars,
        evaluationId: 'evaluation-123',
        testIdx: 2,
        bustCache: true,
        traceparent,
        tracestate: 'vendor=state',
      },
      { abortSignal: abortController.signal },
    );
  });

  it('keeps scheduler execution context scoped to its callback', async () => {
    const provider = createProvider();
    const registry = createRegistry();

    await withProviderCallExecutionContext({ rateLimitRegistry: registry }, () =>
      callProviderWithContext(provider, 'scheduled', 'rubric', vars),
    );
    await callProviderWithContext(provider, 'direct', 'rubric', vars);

    expect(registry.executeSpy).toHaveBeenCalledTimes(1);
    expect(provider.callApi).toHaveBeenCalledTimes(2);
    expect(provider.callApi).toHaveBeenLastCalledWith('direct', {
      isGrading: true,
      prompt: { raw: 'direct', label: 'rubric' },
      vars,
    });
  });

  it('does not double schedule providers that are already rate-limit wrapped', async () => {
    const provider = createProvider();
    const wrapperRegistry = createRegistry();
    const contextRegistry = createRegistry();
    const wrappedProvider = wrapProviderWithRateLimiting(
      provider,
      wrapperRegistry as unknown as RateLimitRegistry,
    );

    await withProviderCallExecutionContext({ rateLimitRegistry: contextRegistry }, () =>
      callProviderWithContext(wrappedProvider, 'grade this', 'rubric', vars),
    );

    expect(contextRegistry.executeSpy).not.toHaveBeenCalled();
    expect(wrapperRegistry.executeSpy).toHaveBeenCalledTimes(1);
    expect(provider.callApi).toHaveBeenCalledWith(
      'grade this',
      {
        isGrading: true,
        prompt: { raw: 'grade this', label: 'rubric' },
        vars,
      },
      undefined,
    );
  });

  it.each([false, true])(
    'queues provider calls while preserving cancellation, signal=%s',
    async (withSignal) => {
      const abortSignal = withSignal ? new AbortController().signal : undefined;
      const response = { output: 'queued response' };
      const provider = createProvider(response);
      const providerCallQueue = new ProviderGroupedCallQueue();

      const promise = withProviderCallExecutionContext({ providerCallQueue, abortSignal }, () =>
        callProviderWithContext(provider, 'grade this', 'rubric', vars),
      );

      expect(provider.callApi).not.toHaveBeenCalled();
      const group = providerCallQueue.takeNextGroup();
      expect(group).toHaveLength(1);
      expect(group[0].providerId).toBe('test-grader');

      await providerCallQueue.run(group[0]);
      await expect(promise).resolves.toBe(response);
      expect(vi.mocked(provider.callApi).mock.calls[0]).toEqual([
        'grade this',
        { isGrading: true, prompt: { raw: 'grade this', label: 'rubric' }, vars },
        ...(abortSignal ? [{ abortSignal }] : []),
      ]);
    },
  );
});

describe('callGradingProvider', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it.each([false, true])('does not start cancelled grading, queued=%s', async (queued) => {
    const controller = new AbortController();
    const provider = createProvider();
    const queue = queued ? new ProviderGroupedCallQueue() : undefined;
    const invoke = vi.fn(async (): Promise<ProviderEmbeddingResponse> => ({ embedding: [1, 0] }));
    if (!queued) {
      controller.abort();
    }
    const promise = withProviderCallExecutionContext(
      { abortSignal: controller.signal, providerCallQueue: queue },
      () => callGradingProvider(provider, 'embedding', invoke),
    );
    const outcome = promise.then(
      () => 'resolved',
      (error) => error.name,
    );
    controller.abort();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(await outcome).toBe('AbortError');
    if (queue) {
      for (const job of queue.takeNextGroup()) {
        await queue.run(job);
      }
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'settles an ignored grading signal and its span, traced=%s',
    async (traced) => {
      const controller = new AbortController();
      const pending = createDeferred<ProviderResponse>();
      const provider = createProvider();
      const invoke = vi.fn(() => pending.promise);
      let spanEnded = false;
      const tracingContext: ProviderCallTracingContext = {
        getActiveTraceparent: () => undefined,
        withGraderSpan: async (_options, fn) => fn(),
        withProviderSpan: async ({ callContext }, fn) => {
          try {
            return await fn(callContext);
          } finally {
            spanEnded = true;
          }
        },
      };
      const call = () => callGradingProvider(provider, 'rubric', invoke);
      const result = withProviderCallExecutionContext({ abortSignal: controller.signal }, () =>
        traced ? withProviderCallTracingContext(tracingContext, call) : call(),
      );
      let outcome = 'pending';
      const settled = result.then(
        () => {
          outcome = 'resolved';
        },
        (error) => {
          outcome = error.name;
        },
      );
      try {
        expect(invoke).toHaveBeenCalledOnce();
        controller.abort();
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(outcome).toBe('AbortError');
        if (traced) {
          expect(spanEnded).toBe(true);
        }
      } finally {
        pending.reject(new Error('late fixture failure'));
        await settled;
      }
    },
  );

  it.each(
    [false, true].flatMap((traced) =>
      [false, true].flatMap((queued) =>
        [false, true].map((delegated) => ({ traced, queued, delegated })),
      ),
    ),
  )(
    'retains a cancelled grader request in its scheduler slot, traced=$traced queued=$queued delegated=$delegated',
    async ({ traced, queued, delegated }) => {
      const registry = new RateLimitRegistry({ maxConcurrency: 1 });
      const queue = queued ? new ProviderGroupedCallQueue() : undefined;
      const controller = new AbortController();
      const started = createDeferred<void>();
      const pending = createDeferred<ProviderResponse>();
      const provider = createProvider();
      const next = vi.fn(async () => ({ output: 'next result' }));
      let spanEnded = false;
      const tracingContext: ProviderCallTracingContext = {
        getActiveTraceparent: () => undefined,
        withGraderSpan: async (_options, fn) => fn(),
        withProviderSpan: async ({ callContext }, fn) => {
          try {
            return await fn(callContext);
          } finally {
            spanEnded = true;
          }
        },
      };
      const firstCall = () =>
        callGradingProvider(provider, 'rubric', () => {
          started.resolve();
          return delegated
            ? callDelegatedProvider(
                { id: () => 'offline-delegate', callApi: () => pending.promise },
                'benign fixture',
              )
            : pending.promise;
        });
      const first = withProviderCallExecutionContext(
        { abortSignal: controller.signal, rateLimitRegistry: registry, providerCallQueue: queue },
        () => (traced ? withProviderCallTracingContext(tracingContext, firstCall) : firstCall()),
      ).catch((error) => error.name);
      let queueSettled = false;
      const dispatch = queue?.run(queue.takeNextGroup()[0]).then(() => {
        queueSettled = true;
      });
      let second: Promise<ProviderResponse> | undefined;
      try {
        await started.promise;
        controller.abort();
        expect(await first).toBe('AbortError');
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (traced) {
          expect(spanEnded).toBe(true);
        }
        if (queued) {
          expect(queueSettled).toBe(true);
        }
        second = withProviderCallExecutionContext({ rateLimitRegistry: registry }, () =>
          callGradingProvider(provider, 'rubric', next),
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(next).not.toHaveBeenCalled();
      } finally {
        pending.resolve({ output: 'late first result' });
        await first;
        await dispatch;
        await second;
        registry.dispose();
      }
      expect(next).toHaveBeenCalledOnce();
      await expect(second).resolves.toEqual({ output: 'next result' });
    },
  );

  it('still cancels a standalone delegate when a registry is present without an owning call', async () => {
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    const controller = new AbortController();
    const pending = createDeferred<ProviderResponse>();
    const provider = { id: () => 'offline-standalone', callApi: () => pending.promise };
    const call = withProviderCallExecutionContext(
      { abortSignal: controller.signal, rateLimitRegistry: registry },
      () => callDelegatedProvider(provider, 'benign fixture'),
    ).catch((error) => error.name);
    try {
      controller.abort();
      expect(await call).toBe('AbortError');
    } finally {
      pending.resolve({ output: 'late response' });
      await call;
      registry.dispose();
    }
  });

  it('preserves a provider failure when its signal has not been cancelled', async () => {
    const error = new SyntaxError('fixture parsing failed');
    const invoke = vi.fn(async () => {
      throw error;
    });
    await expect(
      withProviderCallExecutionContext({ abortSignal: new AbortController().signal }, () =>
        callGradingProvider(createProvider(), 'rubric', invoke),
      ),
    ).rejects.toBe(error);
  });

  it('traces non-text grading calls without changing their response shape', async () => {
    const provider = createProvider();
    const response: ProviderClassificationResponse = { classification: { safe: 0.9 } };
    const traceparent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
    const providerSpan = vi.fn<ProviderCallTracingContext['withProviderSpan']>(
      async ({ callContext }, invoke) => invoke(callContext),
    );

    await expect(
      withProviderCallTracingContext(
        {
          getActiveTraceparent: () => traceparent,
          withGraderSpan: async (_options, invoke) => invoke(),
          withProviderSpan: providerSpan,
        },
        () => callGradingProvider(provider, 'classification', async () => response),
      ),
    ).resolves.toBe(response);

    expect(providerSpan).toHaveBeenCalledWith(
      expect.objectContaining({ provider, role: 'grader', promptLabel: 'classification' }),
      expect.any(Function),
    );
  });

  it('reuses rate limiting and grouped execution for embedding calls', async () => {
    const provider = createProvider();
    const registry = createRegistry();
    const providerCallQueue = new ProviderGroupedCallQueue();
    const invoke = vi.fn(
      async (): Promise<ProviderEmbeddingResponse> => ({
        embedding: [1, 0, 0],
      }),
    );

    const promise = withProviderCallExecutionContext(
      { providerCallQueue, rateLimitRegistry: registry },
      () => callGradingProvider(provider, 'similarity.embedding', invoke),
    );

    expect(invoke).not.toHaveBeenCalled();
    const [group] = providerCallQueue.takeNextGroup();
    await providerCallQueue.run(group);

    await expect(promise).resolves.toEqual({ embedding: [1, 0, 0] });
    expect(registry.executeSpy).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
