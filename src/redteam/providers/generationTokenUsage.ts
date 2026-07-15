import { BaseTokenUsageSchema } from '../../types/shared';
import { accumulateResponseTokenUsage, getErrorTokenUsage } from '../../util/tokenUsageUtils';

import type { ApiProvider } from '../../types/index';
import type { TokenUsage } from '../../types/shared';

const trackedGenerationErrors = new WeakMap<object, WeakSet<TokenUsage>>();

export const GENERATION_TOKEN_USAGE_TRACKED = Symbol.for(
  'promptfoo.redteam.generationTokenUsageTracked',
);

export function isGenerationTokenUsageTracked(provider: ApiProvider): boolean {
  return Boolean(
    (provider as ApiProvider & { [GENERATION_TOKEN_USAGE_TRACKED]?: boolean })[
      GENERATION_TOKEN_USAGE_TRACKED
    ],
  );
}

type GenerationTokenUsageTracker =
  | ((response: { tokenUsage?: unknown; cached?: boolean }) => void)
  | undefined;

export function getGenerationErrorTokenUsage(error: unknown): TokenUsage | undefined {
  return getErrorTokenUsage(error);
}

export async function trackGenerationFetch<T extends { data?: unknown; cached?: boolean }>(
  operation: () => Promise<T>,
  trackTokenUsage: GenerationTokenUsageTracker,
): Promise<T> {
  let response: T;
  try {
    response = await operation();
  } catch (error) {
    trackTokenUsage?.({ tokenUsage: getErrorTokenUsage(error), cached: false });
    throw error;
  }

  trackTokenUsage?.({
    tokenUsage: (response.data as { tokenUsage?: unknown } | undefined)?.tokenUsage,
    cached: response.cached,
  });
  return response;
}

export function trackGenerationResponseTokenUsage(
  tokenUsage: TokenUsage,
  response: { tokenUsage?: unknown; cached?: boolean },
): void {
  let cached = false;
  try {
    cached = Boolean(response.cached);
  } catch {
    cached = false;
  }

  let responseTokenUsage: TokenUsage | undefined;
  try {
    const parsedTokenUsage = BaseTokenUsageSchema.safeParse(response.tokenUsage);
    responseTokenUsage = parsedTokenUsage.success ? parsedTokenUsage.data : undefined;
  } catch {
    responseTokenUsage = undefined;
  }

  if (cached && responseTokenUsage) {
    const cachedTotal = Math.max(
      responseTokenUsage.cached ?? 0,
      responseTokenUsage.total ??
        (responseTokenUsage.prompt ?? 0) + (responseTokenUsage.completion ?? 0),
    );
    responseTokenUsage = {
      ...responseTokenUsage,
      cached: cachedTotal,
      completion: 0,
      numRequests: 0,
      prompt: 0,
      total: cachedTotal,
    };
  }

  accumulateResponseTokenUsage(
    tokenUsage,
    { tokenUsage: responseTokenUsage },
    { countAsRequest: false },
  );
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
  Object.defineProperty(trackedProvider, GENERATION_TOKEN_USAGE_TRACKED, {
    configurable: true,
    enumerable: true,
    value: true,
  });

  return new Proxy(trackedProvider, {
    get(_target, property) {
      if (property === GENERATION_TOKEN_USAGE_TRACKED) {
        return true;
      }
      if (property === 'callApi') {
        return trackedCallApi;
      }

      const value = Reflect.get(provider, property, provider);
      return typeof value === 'function' ? value.bind(provider) : value;
    },
  });
}
