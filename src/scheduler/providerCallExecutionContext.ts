import { AsyncLocalStorage } from 'node:async_hooks';

import cliState from '../cliState';
import { sleep, sleepWithAbort } from '../util/time';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
  RateLimitRegistryRef,
} from '../types/index';
import type { ProviderCallQueue } from './providerCallQueue';

/**
 * Runtime-only scheduler context for provider calls made below the evaluator.
 *
 * This keeps scheduler internals out of CallApiContextParams, which providers
 * can inspect, while still letting matcher helpers reuse the evaluator's
 * cancellation and rate-limit orchestration.
 */
export interface ProviderCallExecutionContext {
  abortSignal?: AbortSignal;
  /** Evaluation-local pacing for this target, without changing a reusable provider. */
  providerDelay?: {
    provider: ApiProvider;
    delay: number | undefined;
    /** Stable target identity when an invocation uses a temporary provider wrapper. */
    queueKey?: ApiProvider;
  };
  providerCallQueue?: ProviderCallQueue;
  rateLimitRegistry?: RateLimitRegistryRef;
}

interface TracedProviderCallOptions {
  provider: ApiProvider;
  callContext?: CallApiContextParams;
  operationName?: 'embeddings';
  role?: 'target' | 'grader';
  promptLabel?: string;
  evalId?: string;
  testIndex?: number;
}

interface TracedGraderOptions {
  graderId: string;
  traceparent?: string;
  evalId?: string;
  testIndex?: number;
}

/** Runtime-only instrumentation hooks injected by the evaluator for one traced execution. */
export interface ProviderCallTracingContext {
  getActiveTraceparent: () => string | undefined;
  testIndex?: number;
  withGraderSpan: <T>(options: TracedGraderOptions, fn: () => Promise<T>) => Promise<T>;
  withProviderSpan: (
    options: TracedProviderCallOptions,
    fn: (callContext: CallApiContextParams | undefined) => Promise<ProviderResponse>,
  ) => Promise<ProviderResponse>;
}

const providerCallExecutionContext = new AsyncLocalStorage<ProviderCallExecutionContext>();
const providerCallTracingContext = new AsyncLocalStorage<ProviderCallTracingContext>();

export function getProviderCallExecutionContext(): ProviderCallExecutionContext | undefined {
  return providerCallExecutionContext.getStore();
}

/** Resolve an explicit provider delay or the delay for its active invocation. */
export function getProviderDelay(provider?: ApiProvider): number | undefined {
  if (!provider) {
    return undefined;
  }
  const scopedDelay = getProviderCallExecutionContext()?.providerDelay;
  return provider.delay ?? (scopedDelay?.provider === provider ? scopedDelay.delay : undefined);
}

export function withProviderCallExecutionContext<T>(
  context: ProviderCallExecutionContext,
  fn: () => Promise<T>,
): Promise<T> {
  return providerCallExecutionContext.run(context, fn);
}

export function getProviderCallTracingContext(): ProviderCallTracingContext | undefined {
  return providerCallTracingContext.getStore();
}

export function withProviderCallTracingContext<T>(
  tracingContext: ProviderCallTracingContext,
  fn: () => Promise<T>,
): Promise<T> {
  return providerCallTracingContext.run(tracingContext, fn);
}

const providerCallQueues = new WeakMap<object, WeakMap<ApiProvider, Promise<void>>>();

function providerAbortError(): DOMException {
  return new DOMException('Provider call cancelled', 'AbortError');
}

function waitForProviderCall(
  result: Promise<ProviderResponse>,
  signal?: AbortSignal,
): Promise<ProviderResponse> {
  if (!signal) {
    return result;
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(providerAbortError());
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
    result
      .then(resolve, (error) => reject(signal.aborted ? providerAbortError() : error))
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Invoke a delegated provider with the current tracing, pacing, and cancellation context. */
export async function callProviderWithContext(
  provider: ApiProvider,
  prompt: string,
  context?: CallApiContextParams,
  options?: CallApiOptionsParams,
): Promise<ProviderResponse> {
  const executionContext = getProviderCallExecutionContext();
  const signal =
    options?.abortSignal && executionContext?.abortSignal
      ? AbortSignal.any([options.abortSignal, executionContext.abortSignal])
      : (options?.abortSignal ?? executionContext?.abortSignal);
  const callOptions = signal ? { ...options, abortSignal: signal } : options;
  const delay = getProviderDelay(provider);
  const handlesDelay = provider.handlesOwnDelay && provider.delay != null;
  const invoke = async () => {
    if (signal?.aborted) {
      throw providerAbortError();
    }
    const tracingContext = getProviderCallTracingContext();
    const response = tracingContext
      ? await tracingContext.withProviderSpan(
          { provider, callContext: context },
          async (callContext) => provider.callApi(prompt, callContext, callOptions),
        )
      : await provider.callApi(prompt, context, callOptions);
    if (!response.cached && !handlesDelay && delay && delay > 0) {
      await (signal ? sleepWithAbort(delay, signal) : sleep(delay));
    }
    return response;
  };

  if (!delay || delay <= 0) {
    return waitForProviderCall(invoke(), signal);
  }

  const scopedDelay = executionContext?.providerDelay;
  const queueKey =
    scopedDelay?.provider === provider ? (scopedDelay.queueKey ?? provider) : provider;
  const scope = executionContext?.rateLimitRegistry ?? cliState.envScope ?? queueKey;
  let queues = providerCallQueues.get(scope);
  if (!queues) {
    queues = new WeakMap();
    providerCallQueues.set(scope, queues);
  }
  const result = (queues.get(queueKey) ?? Promise.resolve()).then(invoke);
  const tail = result.then(
    () => {},
    () => {},
  );
  queues.set(queueKey, tail);
  void tail.then(() => {
    if (queues.get(queueKey) === tail) {
      queues.delete(queueKey);
    }
  });
  return waitForProviderCall(result, signal);
}
