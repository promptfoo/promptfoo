import { BaseTokenUsageSchema } from '../types/shared';
import {
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
  getErrorTokenUsage,
} from '../util/tokenUsageUtils';

import type { ApiProvider, TokenUsage } from '../types/index';

const generationUsageRecorder = Symbol('generationUsageRecorder');

type GenerationUsageResponse = { tokenUsage?: unknown; cached?: boolean };
type TrackedGenerationProvider = ApiProvider & {
  [generationUsageRecorder]?: TokenUsage;
};
const recordedGenerationErrors = new WeakMap<object, WeakSet<TokenUsage>>();

function trackProvider<T extends ApiProvider>(provider: T, tokenUsage: TokenUsage): T {
  const callApi = provider.callApi.bind(provider);
  const trackedCallApi: ApiProvider['callApi'] = async (...args) => {
    try {
      const response = await callApi(...args);
      trackGenerationResponseTokenUsage(tokenUsage, response);
      return response;
    } catch (error) {
      trackGenerationErrorTokenUsage(tokenUsage, error);
      throw error;
    }
  };
  trackedCallApi.label = provider.callApi.label;

  return new Proxy(Object.create(provider) as T, {
    get(_target, property) {
      if (property === 'callApi') {
        return trackedCallApi;
      }
      if (property === generationUsageRecorder) {
        return tokenUsage;
      }

      const value = Reflect.get(provider, property, provider);
      return typeof value === 'function' ? value.bind(provider) : value;
    },
  });
}

/** Observe generation provider calls without changing provider behavior. */
export function trackGenerationTokenUsage<T extends ApiProvider>(
  provider: T,
  tokenUsage: TokenUsage,
): T {
  return trackProvider(provider, tokenUsage);
}

/** Attach a specialized generation provider to its parent's accounting scope. */
export function trackAdditionalGenerationProvider<T extends ApiProvider>(
  provider: T,
  parent: ApiProvider,
): T {
  const tokenUsage = (parent as TrackedGenerationProvider)[generationUsageRecorder];
  return tokenUsage ? trackProvider(provider, tokenUsage) : provider;
}

/** Record remote generation that bypassed the configured provider's callApi method. */
export function recordGenerationTokenUsage(
  provider: ApiProvider,
  response: GenerationUsageResponse,
): void {
  const tokenUsage = (provider as TrackedGenerationProvider)[generationUsageRecorder];
  if (tokenUsage) {
    trackGenerationResponseTokenUsage(tokenUsage, response);
  }
}

/** Preserve usage reported by a failed remote generation request. */
export function recordFailedGenerationTokenUsage(provider: ApiProvider, error: unknown): void {
  const tokenUsage = (provider as TrackedGenerationProvider)[generationUsageRecorder];
  if (tokenUsage) {
    trackGenerationErrorTokenUsage(tokenUsage, error, false);
  }
}

/** Optional provider telemetry must not turn a successful generation into a failure. */
export function trackGenerationResponseTokenUsage(
  tokenUsage: TokenUsage,
  response: GenerationUsageResponse,
): void {
  let cached = false;
  let reportedUsage: TokenUsage | undefined;
  try {
    cached = response.cached === true;
  } catch {
    // Custom providers may expose optional telemetry through getters.
  }
  try {
    const parsed = BaseTokenUsageSchema.safeParse(response.tokenUsage);
    reportedUsage = parsed.success ? parsed.data : undefined;
  } catch {
    // Keep the generation result when optional telemetry cannot be read.
  }
  accumulateResponseTokenUsage(tokenUsage, {
    cached,
    tokenUsage: cached
      ? { ...reportedUsage, incurredTokenUsage: createEmptyTokenUsage() }
      : reportedUsage,
  });
}

export function trackGenerationErrorTokenUsage(
  tokenUsage: TokenUsage,
  error: unknown,
  isRequest = true,
): void {
  const errorTokenUsage = getErrorTokenUsage(error);
  if (!errorTokenUsage && !isRequest) {
    return;
  }

  if (error && typeof error === 'object') {
    const usages = recordedGenerationErrors.get(error) ?? new WeakSet<TokenUsage>();
    // Outer error handlers must not repeat recorded usage. Separate provider
    // calls still count when a provider reuses the same Error instance.
    if (!isRequest && usages.has(tokenUsage)) {
      return;
    }
    usages.add(tokenUsage);
    recordedGenerationErrors.set(error, usages);
  }

  trackGenerationResponseTokenUsage(tokenUsage, { tokenUsage: errorTokenUsage });
}
