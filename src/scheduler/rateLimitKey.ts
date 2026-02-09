import { createHash } from 'crypto';

import type { ApiProvider } from '../types/providers';

/**
 * Generate a rate limit key that identifies a unique rate limit pool.
 * Same provider with different API keys/regions get different keys.
 */
export function getRateLimitKey(provider: ApiProvider): string {
  const providerId = provider.id();

  // Extract config that affects rate limiting
  const config = provider.config || {};
  const relevantConfig: Record<string, string> = {};

  // Use last 4 chars of API key for differentiation (safe partial identifier)
  if (config.apiKey && config.apiKey.length > 4) {
    relevantConfig.apiKeyTail = config.apiKey.slice(-4);
  }
  if (config.apiBaseUrl) {
    relevantConfig.apiBaseUrl = config.apiBaseUrl;
  }
  if (config.region) {
    relevantConfig.region = config.region;
  }
  if (config.organization) {
    relevantConfig.organization = config.organization;
  }

  // Filter out undefined values and create stable hash
  const configParts = Object.entries(relevantConfig)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');

  if (configParts) {
    // Use 12 hex chars (48 bits) for low collision probability
    return `${providerId}[${hashString(configParts)}]`;
  }

  return providerId;
}

/**
 * Hash a string using SHA-256.
 * Returns first 12 chars of hex digest (48 bits).
 */
function hashString(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}
