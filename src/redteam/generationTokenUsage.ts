import { accumulateResponseTokenUsage, getErrorTokenUsage } from '../util/tokenUsageUtils';

import type { ApiProvider, TokenUsage } from '../types/index';

const generationUsageRecorder = Symbol('generationUsageRecorder');

type GenerationUsageResponse = { tokenUsage?: Partial<TokenUsage>; cached?: boolean };
type GenerationUsageRecorder = (response: GenerationUsageResponse) => void;
type TrackedGenerationProvider = ApiProvider & {
  [generationUsageRecorder]?: GenerationUsageRecorder;
};

function trackProvider<T extends ApiProvider>(provider: T, record: GenerationUsageRecorder): T {
  const callApi = provider.callApi.bind(provider);
  const trackedCallApi: ApiProvider['callApi'] = async (...args) => {
    try {
      const response = await callApi(...args);
      record(response);
      return response;
    } catch (error) {
      record({ tokenUsage: getErrorTokenUsage(error) });
      throw error;
    }
  };
  trackedCallApi.label = provider.callApi.label;

  return new Proxy(provider, {
    get(target, property) {
      if (property === 'callApi') {
        return trackedCallApi;
      }
      if (property === generationUsageRecorder) {
        return record;
      }

      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Observe generation provider calls without changing provider behavior. */
export function trackGenerationTokenUsage<T extends ApiProvider>(
  provider: T,
  tokenUsage: TokenUsage,
): T {
  return trackProvider(provider, (response) => {
    if (!response.cached) {
      accumulateResponseTokenUsage(tokenUsage, response);
    }
  });
}

/** Attach a specialized generation provider to its parent's accounting scope. */
export function trackAdditionalGenerationProvider<T extends ApiProvider>(
  provider: T,
  parent: ApiProvider,
): T {
  const record = (parent as TrackedGenerationProvider)[generationUsageRecorder];
  return record ? trackProvider(provider, record) : provider;
}

/** Record remote generation that bypassed the configured provider's callApi method. */
export function recordGenerationTokenUsage(
  provider: ApiProvider,
  response: GenerationUsageResponse,
): void {
  (provider as TrackedGenerationProvider)[generationUsageRecorder]?.(response);
}
