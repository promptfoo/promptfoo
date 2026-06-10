import { getProviderIds } from '../providers/index';
import { getCloudDatabaseId, isCloudProvider } from '../util/cloud';
import { getCloudTargetIdFromTargetIds } from './remoteGenerationContext';

import type { UnifiedConfig } from '../types/index';
import type { RedteamGenerationContext } from './types';

// Keep provider-registry-aware extraction separate from remoteGenerationContext.ts.
// Provider implementations import that leaf module while this adapter is only used
// during config resolution, preventing the provider registry from importing itself.
type ProviderConfigLike = Partial<UnifiedConfig>['providers'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getCloudTargetIdFromProviderId(providerId: unknown): string | undefined {
  return typeof providerId === 'string' && isCloudProvider(providerId)
    ? getCloudDatabaseId(providerId)
    : undefined;
}

function getLinkedCloudTargetId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const config = isRecord(value.config) ? value.config : value;
  return getCloudTargetIdFromProviderId(config.linkedTargetId);
}

export function getProviderTargetIds(providers: ProviderConfigLike): string[] {
  if (!providers) {
    return [];
  }

  const providerList = Array.isArray(providers) ? providers : [providers];
  return providerList.flatMap((provider) => {
    if (typeof provider === 'string') {
      return [provider];
    }
    if (!isRecord(provider)) {
      return [];
    }
    if (typeof provider.id === 'string') {
      return [provider.id];
    }

    try {
      return getProviderIds([provider]);
    } catch {
      return [];
    }
  });
}

export function getCloudTargetIdFromProviders(providers: ProviderConfigLike): string | undefined {
  if (!providers) {
    return undefined;
  }

  const providerList = Array.isArray(providers) ? providers : [providers];
  for (const provider of providerList) {
    const directCloudTargetId = getCloudTargetIdFromProviderId(provider);
    if (directCloudTargetId) {
      return directCloudTargetId;
    }
    if (!isRecord(provider)) {
      continue;
    }

    const linkedCloudTargetId = getLinkedCloudTargetId(provider);
    if (linkedCloudTargetId) {
      return linkedCloudTargetId;
    }

    const idCloudTargetId = getCloudTargetIdFromProviderId(provider.id);
    if (idCloudTargetId) {
      return idCloudTargetId;
    }

    for (const [providerId, providerConfig] of Object.entries(provider)) {
      const keyCloudTargetId = getCloudTargetIdFromProviderId(providerId);
      if (keyCloudTargetId) {
        return keyCloudTargetId;
      }

      const mappedLinkedCloudTargetId = getLinkedCloudTargetId(providerConfig);
      if (mappedLinkedCloudTargetId) {
        return mappedLinkedCloudTargetId;
      }
    }
  }

  return undefined;
}

export function getRedteamGenerationContextFromProviders(
  providers: ProviderConfigLike,
): RedteamGenerationContext {
  const providerTargetIds = getProviderTargetIds(providers);
  return {
    providerTargetIds,
    cloudTargetId:
      getCloudTargetIdFromProviders(providers) ?? getCloudTargetIdFromTargetIds(providerTargetIds),
  };
}
