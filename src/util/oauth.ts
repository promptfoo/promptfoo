import logger from '../logger';
import { isPrivateRangeGuardContextActive } from './fetch/guardContext';
import { fetchWithProxy } from './fetch/index';
import { assertUrlResolvesPublic } from './privateNetwork';

/**
 * Buffer time before token expiry to trigger proactive refresh (60 seconds)
 */
export const TOKEN_REFRESH_BUFFER_MS = 60000;

/**
 * Configuration for OAuth token requests.
 * Values should already be rendered/resolved (no templates).
 */
export interface OAuthTokenConfig {
  signal?: AbortSignal;
  tokenUrl: string;
  /** Discovered endpoints must not redirect configured credentials elsewhere. */
  redirect?: RequestRedirect;
  grantType: 'client_credentials' | 'password';
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  scopes?: string[];
}

/**
 * Result of an OAuth token fetch
 */
export interface OAuthTokenResult {
  accessToken: string;
  expiresAt: number;
}

/**
 * Fetch an OAuth token from a token endpoint.
 * Handles both client_credentials and password grant types.
 *
 * @param config - OAuth configuration with rendered/resolved values
 * @returns Token and expiration timestamp
 */
export async function fetchOAuthToken(config: OAuthTokenConfig): Promise<OAuthTokenResult> {
  const now = Date.now();

  // Inside a guarded server route, the token endpoint is a caller-supplied
  // target the provider preflight never sees: it validates only server.url,
  // and the guarded fetch validates redirect hops, not the initial URL. A
  // public server.url paired with a private tokenUrl would otherwise post
  // client credentials to private space unchecked. Validate the effective
  // endpoint here, before any credentials are sent: callers render
  // templates before reaching this point, so the check sees the URL that
  // is actually fetched. Outside the guard this is skipped, so eval
  // behavior is unchanged.
  if (isPrivateRangeGuardContextActive()) {
    await assertUrlResolvesPublic(config.tokenUrl);
  }

  logger.debug('[OAuth] Fetching new token');

  const tokenRequestBody = new URLSearchParams();
  tokenRequestBody.append('grant_type', config.grantType);

  if (config.clientId) {
    tokenRequestBody.append('client_id', config.clientId);
  }
  if (config.clientSecret) {
    tokenRequestBody.append('client_secret', config.clientSecret);
  }

  if (config.grantType === 'password') {
    if (config.username) {
      tokenRequestBody.append('username', config.username);
    }
    if (config.password) {
      tokenRequestBody.append('password', config.password);
    }
  }

  if (config.scopes && config.scopes.length > 0) {
    tokenRequestBody.append('scope', config.scopes.join(' '));
  }

  const response = await fetchWithProxy(config.tokenUrl, {
    signal: config.signal,
    method: 'POST',
    redirect: config.redirect,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenRequestBody.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OAuth token request failed with status ${response.status} ${response.statusText}: ${errorText}`,
    );
  }

  const tokenData = await response.json();

  if (!tokenData.access_token) {
    throw new Error('OAuth token response missing access_token');
  }

  const expiresInSeconds = tokenData.expires_in || 3600;
  const expiresAt = now + expiresInSeconds * 1000;

  logger.debug('[OAuth] Successfully fetched token');

  return {
    accessToken: tokenData.access_token,
    expiresAt,
  };
}
