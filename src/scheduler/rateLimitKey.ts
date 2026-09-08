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
  if (typeof config.apiKey === 'string' && config.apiKey.length > 4) {
    relevantConfig.apiKeyTail = config.apiKey.slice(-4);
  }

  // Base URL / custom host differentiation (Ollama, LiteLLM, LocalAI, OpenAI-compatible)
  const baseUrl = config.apiBaseUrl || config.baseUrl || config.apiHost || config.host;
  if (typeof baseUrl === 'string' && baseUrl.length > 0) {
    relevantConfig.baseUrl = baseUrl;
  }

  // Region / location differentiation (AWS Bedrock, Google Vertex AI, Azure)
  const region = config.region || config.location;
  if (typeof region === 'string' && region.length > 0) {
    relevantConfig.region = region;
  }

  // Organization differentiation (OpenAI, Anthropic)
  const org = config.organization || config.orgId;
  if (typeof org === 'string' && org.length > 0) {
    relevantConfig.organization = org;
  }

  // Project differentiation (Google Cloud Vertex AI)
  const project = config.projectId || config.project;
  if (typeof project === 'string' && project.length > 0) {
    relevantConfig.projectId = project;
  }

  // Azure deployment & resource differentiation
  if (typeof config.deploymentName === 'string' && config.deploymentName.length > 0) {
    relevantConfig.deploymentName = config.deploymentName;
  }
  if (typeof config.resourceName === 'string' && config.resourceName.length > 0) {
    relevantConfig.resourceName = config.resourceName;
  }

  // Account differentiation (Cloudflare Workers AI, AWS)
  const account = config.account || config.accountId;
  if (typeof account === 'string' && account.length > 0) {
    relevantConfig.account = account;
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
