/**
 * Shared authentication utilities
 * Reusable across HTTP requests and socket.io connections
 */

import logger from '../../logger';
import type { SocketAuthCredentials } from '../../types/codeScan';

// Lazy-loaded cloud config to avoid top-level await (required for CJS/SEA builds)
let cloudConfig: { getApiKey(): string | undefined } | undefined;
let cloudConfigLoaded = false;

async function loadCloudConfig(): Promise<void> {
  if (cloudConfigLoaded) {
    return;
  }
  cloudConfigLoaded = true;
  try {
    // Dynamic import to avoid circular dependencies
    const cloudModule = await import('../../globalConfig/cloud');
    cloudConfig = cloudModule.cloudConfig;
  } catch (_error) {
    // Promptfoo auth not available - that's OK, will fall back to other methods
    // Silently fail since other auth methods are available
  }
}

/**
 * Resolve authentication credentials using waterfall approach:
 * 1. API key from CLI argument or config file (passed as parameter)
 * 2. PROMPTFOO_API_KEY environment variable
 * 3. API key from promptfoo auth (cloudConfig)
 * 4. GitHub OIDC token (environment variable)
 *
 * @param apiKey Optional API key from CLI arg or config file
 * @returns Resolved auth credentials
 */
export async function resolveAuthCredentials(apiKey?: string): Promise<SocketAuthCredentials> {
  // Load cloud config lazily on first call
  await loadCloudConfig();
  // 1. API key from argument (CLI --api-key or config file)
  if (apiKey) {
    logger.debug('Using API key from CLI/config');
    return { apiKey };
  }

  // 2. API key from environment variable
  const envApiKey = process.env.PROMPTFOO_API_KEY;
  if (envApiKey) {
    logger.debug('Using API key from PROMPTFOO_API_KEY env var');
    return {
      apiKey: envApiKey,
    };
  }

  // 3. API key from promptfoo auth
  if (cloudConfig) {
    const storedApiKey = cloudConfig.getApiKey();
    if (storedApiKey) {
      logger.debug('Using API key from promptfoo auth');
      return {
        apiKey: storedApiKey,
      };
    }
  }

  // 4. GitHub OIDC token
  const oidcToken = process.env.GITHUB_OIDC_TOKEN;
  if (oidcToken) {
    logger.debug('Using GitHub OIDC token');
    return {
      oidcToken,
    };
  }

  // No auth found
  return {};
}
