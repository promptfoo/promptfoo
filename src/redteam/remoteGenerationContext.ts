import type { RedteamGenerationContext } from './types';

export type { RedteamGenerationContext } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function getCloudTargetIdFromProviderId(providerId: unknown): string | undefined {
  const prefix = 'promptfoo://provider/';
  return typeof providerId === 'string' && providerId.startsWith(prefix)
    ? providerId.slice(prefix.length)
    : undefined;
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
