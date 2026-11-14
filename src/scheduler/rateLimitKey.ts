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

  if (typeof config.apiKey === 'string' && config.apiKey) {
    relevantConfig.apiKey = config.apiKey;
  }

  const routing = provider.getRateLimitContext?.() ?? {
    baseUrl: config.apiBaseUrl || config.baseUrl || config.apiHost || config.host,
    region: config.region || config.location,
    organization: config.organization || config.orgId,
    projectId: config.projectId || config.project,
    deploymentName: config.deploymentName,
    resourceName: config.resourceName,
    account: config.account || config.accountId,
  };
  for (const [field, value] of Object.entries(routing)) {
    if (typeof value === 'string' && value) {
      relevantConfig[field] = value;
    }
  }

  const configParts = Object.entries(relevantConfig).sort(([a], [b]) => a.localeCompare(b));
  if (configParts.length > 0) {
    // Encode boundaries before hashing so a value containing separators cannot mimic a field.
    const digest = createHash('sha256').update(JSON.stringify(configParts)).digest('hex');
    return `${providerId}[${digest.slice(0, 12)}]`;
  }

  return providerId;
}
