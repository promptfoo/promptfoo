import { isCustomTelemetryProviderIdentifier } from '../util/telemetryIdentifiers';

import type { ApiProvider } from '../types/index';

export function computeModelInfo(providers: ApiProvider[]): {
  ids: string[];
  isComparison: boolean;
  hasCustom: boolean;
} {
  return computeModelInfoFromIds(providers.map((provider) => provider.id()));
}

export function computeModelInfoFromIds(providerIds: string[]): {
  ids: string[];
  isComparison: boolean;
  hasCustom: boolean;
} {
  const uniqueIds = new Set(providerIds);
  const ids = Array.from(uniqueIds).sort();

  // It's a comparison if there are multiple providers with different IDs
  const isComparison = uniqueIds.size > 1;

  const hasCustom = providerIds.some(isCustomTelemetryProviderIdentifier);

  return { ids, isComparison, hasCustom };
}
