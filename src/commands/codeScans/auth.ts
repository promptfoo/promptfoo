/**
 * Shared authentication utilities
 * Reusable across HTTP requests and socket.io connections
 */

import logger from '../../logger';

// Import promptfoo's cloud config for auth
let cloudConfig: { getApiKey(): string | undefined } | undefined;
try {
  // Dynamic import to avoid circular dependencies
  const cloudModule = require('../../globalConfig/cloud');
  cloudConfig = cloudModule.cloudConfig;
} catch (_error) {
  // Promptfoo auth not available - that's OK, will fall back to other methods
  // Silently fail since other auth methods are available
}

/**
 * Resolved auth credentials
 */
export interface AuthCredentials {
  apiKey?: string;
  oidcToken?: string;
  method?: 'cli_arg' | 'config_file' | 'promptfoo_auth' | 'github_oidc';
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
export function resolveAuthCredentials(apiKey?: string): AuthCredentials {
  // 1. API key from argument (CLI --api-key or config file)
  if (apiKey) {
    logger.debug('Using API key from CLI/config');
    return {
      apiKey,
      method: 'cli_arg',
    };
  }

  // 2. API key from environment variable
  const envApiKey = process.env.PROMPTFOO_API_KEY;
  if (envApiKey) {
    logger.debug('Using API key from PROMPTFOO_API_KEY env var');
    return {
      apiKey: envApiKey,
      method: 'config_file', // Use config_file method to indicate env var
    };
  }

  // 3. API key from promptfoo auth
  if (cloudConfig) {
    const storedApiKey = cloudConfig.getApiKey();
    if (storedApiKey) {
      logger.debug('Using API key from promptfoo auth');
      return {
        apiKey: storedApiKey,
        method: 'promptfoo_auth',
      };
    }
  }

  // 4. GitHub OIDC token
  const oidcToken = process.env.GITHUB_OIDC_TOKEN;
  if (oidcToken) {
    logger.debug('Using GitHub OIDC token');
    return {
      oidcToken,
      method: 'github_oidc',
    };
  }

  // No auth found
  return {};
}
