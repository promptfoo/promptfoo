/**
 * Code scan authentication utilities.
 *
 * Wraps the shared agent auth resolution and adds code-scan-specific
 * strategies: GitHub OIDC token and fork PR context.
 */

import logger from '../../logger';
import { resolveBaseAuthCredentials } from '../../util/agent/agentAuth';

import type { SocketAuthCredentials } from '../../types/codeScan';

/**
 * Resolve authentication credentials using waterfall approach:
 * 1. API key from CLI argument or config file (passed as parameter)
 * 2. PROMPTFOO_API_KEY environment variable
 * 3. API key from promptfoo auth (cloudConfig)
 * 4. GitHub OIDC token (environment variable)
 * 5. Fork PR context (for fork PRs where OIDC is unavailable)
 *
 * @param apiKey Optional API key from CLI arg or config file
 * @param forkPR Optional fork PR context for authentication
 * @returns Resolved auth credentials
 */
export function resolveAuthCredentials(
  apiKey?: string,
  forkPR?: { owner: string; repo: string; number: number },
): SocketAuthCredentials {
  // 1-3: Try shared base resolution (API key from arg, env, or cloud config)
  const baseAuth = resolveBaseAuthCredentials({ apiKey });
  if (baseAuth.apiKey) {
    return baseAuth;
  }

  // 4. GitHub OIDC token
  const oidcToken = process.env.GITHUB_OIDC_TOKEN;
  if (oidcToken) {
    logger.debug('Using GitHub OIDC token');
    return {
      oidcToken,
    };
  }

  // 5. Fork PR context (for fork PRs where OIDC is unavailable)
  if (forkPR) {
    logger.debug('Using fork PR context for authentication');
    return { forkPR };
  }

  // No auth found
  return {};
}
