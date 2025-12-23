import logger from '../../logger';
import { renderVarsInObject } from '../../util/index';
import { fetchOAuthToken, type OAuthTokenResult, TOKEN_REFRESH_BUFFER_MS } from '../../util/oauth';

import type {
  MCPApiKeyAuth,
  MCPOAuthClientCredentialsAuth,
  MCPOAuthPasswordAuth,
  MCPServerConfig,
} from './types';

export type { OAuthTokenResult };

/**
 * Render environment variables in server config auth fields.
 * Supports {{VAR_NAME}} syntax for variable substitution.
 */
export function renderAuthVars(
  server: MCPServerConfig,
  vars?: Record<string, string | object>,
): MCPServerConfig {
  if (!server.auth) {
    return server;
  }

  // Use process.env as default vars if none provided
  const renderVars = vars || (process.env as Record<string, string>);

  return {
    ...server,
    auth: renderVarsInObject(server.auth, renderVars),
  };
}

/**
 * OAuth token cache to store and reuse tokens
 */
interface OAuthTokenCache {
  accessToken: string;
  expiresAt: number;
}

const oauthTokenCache = new Map<string, OAuthTokenCache>();

/**
 * Get the cache key for an OAuth config
 */
function getOAuthCacheKey(auth: MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth): string {
  return `${auth.tokenUrl}:${auth.grantType}:${'clientId' in auth ? auth.clientId : ''}:${'username' in auth ? auth.username : ''}`;
}

/**
 * Get OAuth token with expiration info, fetching a new one if needed.
 * Requires tokenUrl to be configured - throws if not provided.
 * Caches tokens and returns cached version if still valid.
 */
export async function getOAuthTokenWithExpiry(
  auth: MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth,
): Promise<OAuthTokenResult> {
  if (!auth.tokenUrl) {
    throw new Error('tokenUrl is required for direct OAuth token fetching');
  }

  const cacheKey = getOAuthCacheKey(auth);
  const cached = oauthTokenCache.get(cacheKey);
  const now = Date.now();

  if (cached && now + TOKEN_REFRESH_BUFFER_MS < cached.expiresAt) {
    logger.debug('[MCP Auth] Using cached OAuth token');
    return { accessToken: cached.accessToken, expiresAt: cached.expiresAt };
  }

  // Use shared OAuth token fetch logic
  const result = await fetchOAuthToken({
    tokenUrl: auth.tokenUrl,
    grantType: auth.grantType,
    clientId: auth.clientId,
    clientSecret: auth.clientSecret,
    username: 'username' in auth ? auth.username : undefined,
    password: 'password' in auth ? auth.password : undefined,
    scopes: auth.scopes,
  });

  // Cache the token
  oauthTokenCache.set(cacheKey, {
    accessToken: result.accessToken,
    expiresAt: result.expiresAt,
  });

  logger.debug('[MCP Auth] Cached OAuth token');
  return result;
}

/**
 * Get OAuth token, fetching a new one if needed.
 * Requires tokenUrl to be configured - throws if not provided.
 */
export async function getOAuthToken(
  auth: MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth,
): Promise<string> {
  const result = await getOAuthTokenWithExpiry(auth);
  return result.accessToken;
}

/**
 * Get authentication headers for an MCP server configuration.
 * Returns headers for bearer, basic, and api_key (header placement) auth types.
 * For OAuth, use getOAuthToken() first then pass the token.
 * For api_key with query placement, use getAuthQueryParams() instead.
 */
export function getAuthHeaders(
  server: MCPServerConfig,
  oauthToken?: string,
): Record<string, string> {
  if (!server.auth) {
    return {};
  }

  switch (server.auth.type) {
    case 'bearer':
      if (!server.auth.token) {
        return {};
      }
      return { Authorization: `Bearer ${server.auth.token}` };

    case 'basic': {
      const credentials = Buffer.from(`${server.auth.username}:${server.auth.password}`).toString(
        'base64',
      );
      return { Authorization: `Basic ${credentials}` };
    }

    case 'api_key': {
      const apiKeyAuth = server.auth as MCPApiKeyAuth;
      const value = apiKeyAuth.value || apiKeyAuth.api_key;
      if (!value) {
        return {};
      }
      const placement = apiKeyAuth.placement || 'header';
      if (placement === 'header') {
        const keyName = apiKeyAuth.keyName || 'X-API-Key';
        return { [keyName]: value };
      }
      // Query placement is handled by getAuthQueryParams
      return {};
    }

    case 'oauth':
      if (oauthToken) {
        return { Authorization: `Bearer ${oauthToken}` };
      }
      // OAuth token should be fetched async before calling this
      logger.warn('[MCP Auth] OAuth auth configured but no token provided');
      return {};

    default:
      return {};
  }
}

/**
 * Get authentication query parameters for api_key auth with query placement.
 * Returns an object with key-value pairs to be added to the URL.
 */
export function getAuthQueryParams(server: MCPServerConfig): Record<string, string> {
  if (!server.auth || server.auth.type !== 'api_key') {
    return {};
  }

  const apiKeyAuth = server.auth as MCPApiKeyAuth;
  const value = apiKeyAuth.value || apiKeyAuth.api_key;
  if (!value) {
    return {};
  }

  const placement = apiKeyAuth.placement || 'header';
  if (placement !== 'query') {
    return {};
  }

  const keyName = apiKeyAuth.keyName || 'X-API-Key';
  return { [keyName]: value };
}

/**
 * Apply query parameters to a URL
 */
export function applyQueryParams(url: string, params: Record<string, string>): string {
  if (Object.keys(params).length === 0) {
    return url;
  }

  const urlObj = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    urlObj.searchParams.append(key, value);
  }
  return urlObj.toString();
}

/**
 * Check if auth requires async token fetching (OAuth)
 */
export function requiresAsyncAuth(server: MCPServerConfig): boolean {
  return server.auth?.type === 'oauth';
}
