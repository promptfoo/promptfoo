import { BaseTokenUsageSchema } from '../../types/shared';
import { accumulateResponseTokenUsage, getErrorTokenUsage } from '../../util/tokenUsageUtils';

import type { ApiProvider } from '../../types/index';
import type { TokenUsage } from '../../types/shared';

const trackedGenerationErrors = new WeakMap<object, WeakSet<TokenUsage>>();

export function trackGenerationResponseTokenUsage(
  tokenUsage: TokenUsage,
  response: { tokenUsage?: unknown; cached?: boolean },
): void {
  let responseTokenUsage: TokenUsage | undefined;
  try {
    const parsedTokenUsage = BaseTokenUsageSchema.safeParse(response.tokenUsage);
    responseTokenUsage = parsedTokenUsage.success ? parsedTokenUsage.data : undefined;
  } catch {
    responseTokenUsage = undefined;
  }

  accumulateResponseTokenUsage(
    tokenUsage,
    { tokenUsage: responseTokenUsage },
    { countAsRequest: false },
  );
  let cached = false;
  try {
    cached = Boolean(response.cached);
  } catch {
    cached = false;
  }
  tokenUsage.numRequests ??= 0;
  if (!cached) {
    tokenUsage.numRequests =
      (tokenUsage.numRequests ?? 0) + Math.max(1, responseTokenUsage?.numRequests ?? 0);
  }
}

export function trackGenerationErrorTokenUsage(
  tokenUsage: TokenUsage,
  error: unknown,
  countUnmetered = true,
): void {
  const errorTokenUsage = getErrorTokenUsage(error);
  if (!errorTokenUsage && !countUnmetered) {
    return;
  }

  if (error && typeof error === 'object') {
    const trackedUsages = trackedGenerationErrors.get(error) ?? new WeakSet<TokenUsage>();
    if (trackedUsages.has(tokenUsage)) {
      return;
    }
    trackedUsages.add(tokenUsage);
    trackedGenerationErrors.set(error, trackedUsages);
  }

  trackGenerationResponseTokenUsage(tokenUsage, {
    tokenUsage: errorTokenUsage,
    cached: false,
  });
}

export function trackGenerationTokenUsage(
  provider: ApiProvider,
  tokenUsage: TokenUsage,
): ApiProvider {
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

  const trackedProvider = Object.create(provider) as ApiProvider;
  Object.defineProperty(trackedProvider, 'callApi', {
    configurable: true,
    value: trackedCallApi,
    writable: true,
  });

  return new Proxy(trackedProvider, {
    get(_target, property) {
      if (property === 'callApi') {
        return trackedCallApi;
      }

      const value = Reflect.get(provider, property, provider);
      return typeof value === 'function' ? value.bind(provider) : value;
    },
  });
}
