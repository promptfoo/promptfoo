import { getProviderIds } from '../providers/index';
import { getCloudDatabaseId, isCloudProvider } from '../util/cloud';

import type { UnifiedConfig } from '../types/index';
import type { RedteamGenerationContext } from './types';

export type { RedteamGenerationContext } from './types';

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
  const linkedTargetId = config.linkedTargetId;
  return getCloudTargetIdFromProviderId(linkedTargetId);
}

export function remoteGenerationContextPayload(contextOrCloudTargetId?: unknown): {
  targetId?: string;
} {
  const cloudTargetId =
    typeof contextOrCloudTargetId === 'string'
      ? contextOrCloudTargetId
      : isRecord(contextOrCloudTargetId) && typeof contextOrCloudTargetId.cloudTargetId === 'string'
        ? contextOrCloudTargetId.cloudTargetId
        : undefined;

  return cloudTargetId ? { targetId: cloudTargetId } : {};
}

export function getCloudTargetIdFromTargetIds(targetIds: string[]): string | undefined {
  for (const targetId of targetIds) {
    const cloudTargetId = getCloudTargetIdFromProviderId(targetId);
    if (cloudTargetId) {
      return cloudTargetId;
    }
  }
  return undefined;
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

export function resolveRedteamGenerationContext({
  cloudTargetDatabaseId,
  redteamGenerationContext,
  targetIds,
}: {
  cloudTargetDatabaseId?: string;
  redteamGenerationContext?: RedteamGenerationContext;
  targetIds?: string[];
}): RedteamGenerationContext {
  const providerTargetIds = redteamGenerationContext?.providerTargetIds ?? targetIds ?? [];
  return {
    providerTargetIds,
    cloudTargetId:
      redteamGenerationContext?.cloudTargetId ??
      cloudTargetDatabaseId ??
      getCloudTargetIdFromTargetIds(providerTargetIds),
  };
}
