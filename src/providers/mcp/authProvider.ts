import logger from '../../logger';
import { getOAuthToken } from './util';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

import type { MCPOAuthClientCredentialsAuth, MCPOAuthPasswordAuth } from './types';

interface TokenCacheEntry {
  tokens: OAuthTokens;
  expiresAt: number;
}

// Module-level token cache shared across provider instances
const tokenCache = new Map<string, TokenCacheEntry>();
const TOKEN_BUFFER_MS = 60000; // 60 seconds before expiry

/**
 * OAuth client provider for MCP that supports client_credentials and password grant types.
 * Implements the SDK's OAuthClientProvider interface for automatic token refresh.
 *
 * Behavior:
 * - If `tokenUrl` is configured: fetches tokens directly from that URL (bypasses OAuth discovery)
 * - If `tokenUrl` is NOT configured: returns undefined from tokens() to let SDK use OAuth discovery
 */
export class PromptfooOAuthClientProvider implements OAuthClientProvider {
  private _tokens?: OAuthTokens;
  private _clientMetadata: OAuthClientMetadata;
  private _clientInfo: OAuthClientInformationMixed;
  private _auth: MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth;
  private _cacheKey: string;
  private _tokenFetchPromise?: Promise<OAuthTokens>;
  private _useDirectTokenFetch: boolean;

  constructor(auth: MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth) {
    this._auth = auth;
    this._cacheKey = this.buildCacheKey(auth);

    // If tokenUrl is configured, fetch tokens directly; otherwise use SDK discovery
    this._useDirectTokenFetch = Boolean(auth.tokenUrl);

    if (this._useDirectTokenFetch) {
      logger.debug('[MCP Auth] Using direct token fetch with configured tokenUrl');
    } else {
      logger.debug('[MCP Auth] Using SDK OAuth discovery (no tokenUrl configured)');
    }

    // Initialize client info
    this._clientInfo = {
      client_id: auth.clientId || '',
      client_secret: auth.clientSecret,
    };

    // Initialize client metadata
    // redirect_uris is required by the schema but empty for non-interactive flows
    this._clientMetadata = {
      redirect_uris: [],
      client_name: 'promptfoo-mcp-client',
      grant_types: [auth.grantType],
      token_endpoint_auth_method: auth.clientSecret ? 'client_secret_basic' : 'none',
    };

    // Check cache for existing tokens (only relevant for direct fetch mode)
    if (this._useDirectTokenFetch) {
      const cached = tokenCache.get(this._cacheKey);
      if (cached && Date.now() + TOKEN_BUFFER_MS < cached.expiresAt) {
        this._tokens = cached.tokens;
        logger.debug('[MCP Auth] Using cached OAuth tokens');
      }
    }
  }

  private buildCacheKey(auth: MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth): string {
    const base = `${auth.tokenUrl}:${auth.grantType}:${auth.clientId || ''}`;
    if (auth.grantType === 'password') {
      return `${base}:${(auth as MCPOAuthPasswordAuth).username}`;
    }
    return base;
  }

  /**
   * Fetches a fresh token from the configured tokenUrl.
   * This bypasses the SDK's OAuth metadata discovery.
   */
  private async fetchToken(): Promise<OAuthTokens> {
    // Prevent concurrent token fetches
    if (this._tokenFetchPromise) {
      return this._tokenFetchPromise;
    }

    this._tokenFetchPromise = (async () => {
      try {
        const accessToken = await getOAuthToken(this._auth);
        const tokens: OAuthTokens = {
          access_token: accessToken,
          token_type: 'Bearer',
          // We don't have expires_in from getOAuthToken, but it's cached internally
        };
        this.saveTokens(tokens);
        return tokens;
      } finally {
        this._tokenFetchPromise = undefined;
      }
    })();

    return this._tokenFetchPromise;
  }

  // Return undefined for non-interactive flows (no redirect needed)
  get redirectUrl(): undefined {
    return undefined;
  }

  get clientMetadata(): OAuthClientMetadata {
    return this._clientMetadata;
  }

  clientInformation(): OAuthClientInformationMixed {
    return this._clientInfo;
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    this._clientInfo = info;
  }

  /**
   * Returns cached tokens if valid, otherwise fetches fresh tokens.
   *
   * Behavior:
   * - If tokenUrl is configured: fetches tokens directly and returns them
   * - If tokenUrl is NOT configured: returns undefined to let SDK use OAuth discovery
   */
  async tokens(): Promise<OAuthTokens | undefined> {
    // If not using direct token fetch, let SDK handle discovery
    if (!this._useDirectTokenFetch) {
      // Return any tokens the SDK has saved via saveTokens()
      return this._tokens;
    }

    // Check if cached tokens are still valid
    const cached = tokenCache.get(this._cacheKey);
    if (cached && Date.now() + TOKEN_BUFFER_MS < cached.expiresAt) {
      return cached.tokens;
    }

    // If we have instance tokens, check if they're still valid
    if (this._tokens) {
      const instanceCached = tokenCache.get(this._cacheKey);
      if (instanceCached && Date.now() + TOKEN_BUFFER_MS < instanceCached.expiresAt) {
        return this._tokens;
      }
    }

    // Fetch fresh tokens - this uses our configured tokenUrl directly
    try {
      return await this.fetchToken();
    } catch (error) {
      logger.error(`[MCP Auth] Failed to fetch OAuth token: ${error}`);
      return undefined;
    }
  }

  saveTokens(tokens: OAuthTokens): void {
    this._tokens = tokens;

    // Calculate expiry and cache
    const expiresIn = tokens.expires_in || 3600;
    const expiresAt = Date.now() + expiresIn * 1000;

    tokenCache.set(this._cacheKey, {
      tokens,
      expiresAt,
    });

    logger.debug('[MCP Auth] Saved OAuth tokens to cache');
  }

  // Not used for non-interactive flows - throw to indicate this is not supported
  redirectToAuthorization(_authorizationUrl: URL): void {
    throw new Error(
      'redirectToAuthorization is not supported for client_credentials/password grant flows',
    );
  }

  // Not used for non-interactive flows
  saveCodeVerifier(_codeVerifier: string): void {
    // No-op for non-interactive flows
  }

  // Not used for non-interactive flows - throw to indicate this is not supported
  codeVerifier(): string {
    throw new Error('codeVerifier is not supported for client_credentials/password grant flows');
  }

  /**
   * Prepares grant-specific parameters for the token request.
   * This is called by the SDK's fetchToken function.
   */
  prepareTokenRequest(scope?: string): URLSearchParams {
    const params = new URLSearchParams();
    params.set('grant_type', this._auth.grantType);

    if (this._auth.grantType === 'password') {
      const passwordAuth = this._auth as MCPOAuthPasswordAuth;
      params.set('username', passwordAuth.username);
      params.set('password', passwordAuth.password);
    }

    // Add scopes if provided (from parameter or config)
    const scopes = scope || this._auth.scopes?.join(' ');
    if (scopes) {
      params.set('scope', scopes);
    }

    return params;
  }

  /**
   * Invalidate cached credentials on auth failure.
   */
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier'): void {
    if (scope === 'all' || scope === 'tokens') {
      this._tokens = undefined;
      tokenCache.delete(this._cacheKey);
      logger.debug('[MCP Auth] Invalidated OAuth tokens from cache');
    }
  }
}

/**
 * Clear the OAuth token cache. Useful for testing.
 */
export function clearOAuthTokenCache(cacheKey?: string): void {
  if (cacheKey) {
    tokenCache.delete(cacheKey);
  } else {
    tokenCache.clear();
  }
}
