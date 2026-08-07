import { getCloudTargetIdFromTargetIds } from './remoteGenerationContext';

import type { RedteamGenerationContext } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getCloudTargetIdFromProviderId(providerId: unknown): string | undefined {
  return typeof providerId === 'string' ? getCloudTargetIdFromTargetIds([providerId]) : undefined;
}

function getLinkedCloudTargetId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const config = isRecord(value.config) ? value.config : value;
  return getCloudTargetIdFromProviderId(config.linkedTargetId);
}

export function getCloudTargetIdFromProviders(providers: unknown): string | undefined {
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
  providers: unknown,
  providerTargetIds: string[],
): RedteamGenerationContext {
  return {
    providerTargetIds,
    cloudTargetId:
      getCloudTargetIdFromProviders(providers) ?? getCloudTargetIdFromTargetIds(providerTargetIds),
  };
}
