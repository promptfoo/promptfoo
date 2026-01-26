import { createHash } from 'crypto';

import type { ApiProvider } from '../types/providers';

/**
 * Generate a rate limit key that identifies a unique rate limit pool.
 * Same provider with different API keys/regions get different keys.
 *
 * Uses SHA-256 for cryptographically secure hashing of secrets.
 */
export function getRateLimitKey(provider: ApiProvider): string {
  const providerId = provider.id();

  // Extract config that affects rate limiting
  const config = provider.config || {};
  const relevantConfig: Record<string, string> = {};

  // Create identifier from API key (for rate limit grouping, not auth)
  if (config.apiKey) {
    relevantConfig.apiKey = createKeyIdentifier(config.apiKey);
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
    return `${providerId}[${hashString(configParts).slice(0, 12)}]`;
  }

  return providerId;
}

/**
 * Create an identifier from a secret value for rate limit grouping.
 * Uses SHA-256 to create a non-reversible fingerprint (NOT for authentication).
 * Returns first 16 chars of hex digest (64 bits) for collision resistance.
 */
function createKeyIdentifier(value: string): string {
  // lgtm[js/insufficient-password-hash] - This is for grouping rate limits, NOT password storage
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/**
 * Hash a string using SHA-256.
 * Returns first 12 chars of hex digest (48 bits).
 */
function hashString(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}
