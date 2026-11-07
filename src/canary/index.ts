import { sha256 } from '../util/createHash';

import type { ApiProvider, ProviderOptions } from '../types/providers';

function getSortedJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(getSortedJsonValue);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'function') {
    return value.toString();
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const sortedValue = getSortedJsonValue((value as Record<string, unknown>)[key]);
        if (sortedValue !== undefined) {
          acc[key] = sortedValue;
        }
        return acc;
      }, {});
  }

  return value;
}

export function getProviderId(provider: ApiProvider | ProviderOptions): string {
  if (!('id' in provider)) {
    return 'unknown';
  }

  if (typeof provider.id === 'function') {
    return provider.id() || 'unknown';
  }

  return provider.id || 'unknown';
}

/**
 * Converts a provider configuration to a stable string representation for hashing
 * We only include properties that affect the provider behavior
 *
 * @param provider The provider configuration to serialize
 * @returns A stable JSON string of the provider configuration
 */
function serializeProviderForHashing(provider: ApiProvider | ProviderOptions): string {
  const configToHash: Record<string, unknown> = {};

  configToHash.id = getProviderId(provider);

  // Include relevant configuration properties
  if ('config' in provider && provider.config) {
    configToHash.config = provider.config;
  }

  if ('transform' in provider && provider.transform) {
    configToHash.transform = provider.transform;
  }

  // Sort keys to ensure stable serialization
  return JSON.stringify(getSortedJsonValue(configToHash));
}

/**
 * Generates a deterministic hash from a provider configuration
 * This hash will be the same for the same provider configuration
 *
 * @param provider The provider configuration to hash
 * @returns A SHA-256 hash as a hex string
 */
export function generateProviderHash(provider: ApiProvider | ProviderOptions): string {
  // Convert provider to a stable JSON string representation
  const providerConfig = serializeProviderForHashing(provider);

  // Generate hash from the stable string representation
  return sha256(providerConfig);
}

/**
 * Generates a shorter hash by truncating the full SHA-256 hash
 *
 * @param provider The provider configuration to hash
 * @param length The length of the shortened hash, default is 8
 * @returns A shortened hash string
 */
export function generateShortProviderHash(
  provider: ApiProvider | ProviderOptions,
  length: number = 8,
): string {
  const fullHash = generateProviderHash(provider);
  return fullHash.substring(0, length);
}
