import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import { renderVarsInObject } from '../../util/index';
import type {
  MCPApiKeyAuth,
  MCPOAuthClientCredentialsAuth,
  MCPOAuthPasswordAuth,
  MCPServerConfig,
} from './types';

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
 * Get OAuth token, fetching a new one if needed
 */
export async function getOAuthToken(
  auth: MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth,
): Promise<string> {
  const cacheKey = `${auth.tokenUrl}:${auth.grantType}:${'clientId' in auth ? auth.clientId : ''}:${'username' in auth ? auth.username : ''}`;
  const cached = oauthTokenCache.get(cacheKey);
  const now = Date.now();
  const TOKEN_BUFFER_MS = 60000; // 60 second buffer before expiry

  if (cached && now + TOKEN_BUFFER_MS < cached.expiresAt) {
    logger.debug('[MCP Auth] Using cached OAuth token');
    return cached.accessToken;
  }

  logger.debug('[MCP Auth] Fetching new OAuth token');

  const tokenRequestBody = new URLSearchParams();
  tokenRequestBody.append('grant_type', auth.grantType);

  if (auth.clientId) {
    tokenRequestBody.append('client_id', auth.clientId);
  }
  if (auth.clientSecret) {
    tokenRequestBody.append('client_secret', auth.clientSecret);
  }

  if (auth.grantType === 'password' && 'username' in auth) {
    tokenRequestBody.append('username', auth.username);
    tokenRequestBody.append('password', auth.password);
  }

  if (auth.scopes && auth.scopes.length > 0) {
    tokenRequestBody.append('scope', auth.scopes.join(' '));
  }

  const response = await fetchWithProxy(auth.tokenUrl, {
    method: 'POST',
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

  // Cache the token
  const expiresInSeconds = tokenData.expires_in || 3600;
  oauthTokenCache.set(cacheKey, {
    accessToken: tokenData.access_token,
    expiresAt: now + expiresInSeconds * 1000,
  });

  logger.debug('[MCP Auth] Successfully fetched OAuth token');
  return tokenData.access_token;
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
      const credentials = Buffer.from(
        `${server.auth.username}:${server.auth.password}`,
      ).toString('base64');
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
