/**
 * GitHub OIDC Authentication
 *
 * Handles OIDC token generation for server authentication
 */

import * as core from '@actions/core';

/**
 * Get GitHub OIDC token for authenticating with the scan server
 * @param audience The audience for the OIDC token (scan server URL)
 * @returns OIDC token
 */
export async function getGitHubOIDCToken(audience: string): Promise<string> {
  try {
    const token = await core.getIDToken(audience);
    return token;
  } catch (error) {
    throw new Error(
      `Failed to get GitHub OIDC token: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
