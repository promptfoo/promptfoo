import {
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
  getErrorTokenUsage,
} from '../util/tokenUsageUtils';

import type { ApiProvider, TokenUsage } from '../types/index';

const generationUsageContext = Symbol('generationUsageContext');

type GenerationUsageResponse = { tokenUsage?: Partial<TokenUsage>; cached?: boolean };
type GenerationUsageRecorder = (response: GenerationUsageResponse) => void;
interface GenerationUsageContext {
  record: GenerationUsageRecorder;
  abortSignal?: AbortSignal;
  calls?: Set<Promise<unknown>>;
}
type TrackedGenerationProvider = ApiProvider & {
  [generationUsageContext]?: GenerationUsageContext;
};
const recordedGenerationErrors = new WeakMap<object, WeakSet<GenerationUsageRecorder>>();

function trackProvider<T extends ApiProvider>(provider: T, context: GenerationUsageContext): T {
  const { record, abortSignal } = context;
  const callApi = provider.callApi.bind(provider);
  const trackedCallApi: ApiProvider['callApi'] = async (...args) => {
    const signal =
      abortSignal && args[2]?.abortSignal
        ? AbortSignal.any([abortSignal, args[2].abortSignal])
        : abortSignal;
    signal?.throwIfAborted();
    let call;
    try {
      call = signal
        ? callApi(args[0], args[1], { ...args[2], abortSignal: signal })
        : callApi(...args);
      context.calls?.add(call);
      const response = await call;
      record(response);
      return response;
    } catch (error) {
      record({ tokenUsage: getErrorTokenUsage(error) });
      throw error;
    } finally {
      if (call) {
        context.calls?.delete(call);
      }
    }
  };
  trackedCallApi.label = provider.callApi.label;

  return new Proxy(provider, {
    get(target, property) {
      if (property === 'callApi') {
        return trackedCallApi;
      }
      if (property === generationUsageContext) {
        return context;
      }

      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Observe generation usage and prevent new calls after synthesis is cancelled. */
export function trackGenerationTokenUsage<T extends ApiProvider>(
  provider: T,
  tokenUsage: TokenUsage,
  abortSignal?: AbortSignal,
  calls?: Set<Promise<unknown>>,
): T {
  return trackProvider(provider, {
    abortSignal,
    calls,
    record: (response) => {
      accumulateResponseTokenUsage(
        tokenUsage,
        response.cached
          ? {
              ...response,
              tokenUsage: {
                ...response.tokenUsage,
                incurredTokenUsage: createEmptyTokenUsage(),
              },
            }
          : response,
      );
    },
  });
}

/** Attach a specialized generation provider to its parent's accounting scope. */
export function trackAdditionalGenerationProvider<T extends ApiProvider>(
  provider: T,
  parent: ApiProvider,
): T {
  const context = (parent as TrackedGenerationProvider)[generationUsageContext];
  return context ? trackProvider(provider, context) : provider;
}

/** Record remote generation that bypassed the configured provider's callApi method. */
export function recordGenerationTokenUsage(
  provider: ApiProvider,
  response: GenerationUsageResponse,
): void {
  (provider as TrackedGenerationProvider)[generationUsageContext]?.record(response);
}

/** Preserve usage reported by a failed remote generation request. */
export function recordFailedGenerationTokenUsage(provider: ApiProvider, error: unknown): void {
  const tokenUsage = getErrorTokenUsage(error);
  const record = (provider as TrackedGenerationProvider)[generationUsageContext]?.record;
  if (!tokenUsage || !record) {
    return;
  }

  if (error && typeof error === 'object') {
    const recorders = recordedGenerationErrors.get(error) ?? new WeakSet<GenerationUsageRecorder>();
    if (recorders.has(record)) {
      return;
    }
    recorders.add(record);
    recordedGenerationErrors.set(error, recorders);
  }

  record({ tokenUsage });
}
