import { getProcessEnv } from '../../envars';
import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import { renderVarsInObject } from '../../util/index';
import { fetchOAuthToken, type OAuthTokenResult, TOKEN_REFRESH_BUFFER_MS } from '../../util/oauth';
import {
  isCredentialHeader,
  isSecretEnvVarName,
  looksLikeSecret,
  normalizeFieldName,
  REDACTED,
  sanitizeObject,
  sanitizeUrlForLogging,
} from '../../util/sanitizer';
import { waitForPromiseWithAbort } from '../shared';
import { normalizeRenderedOAuthScopes } from './auth';

import type { VarValue } from '../../types/shared';
import type {
  MCPApiKeyAuth,
  MCPOAuthClientCredentialsAuth,
  MCPOAuthPasswordAuth,
  MCPServerConfig,
  MCPToolResult,
} from './types';

export type { OAuthTokenResult };

const MAX_TOOL_DEPTH = 64;
const OMITTED_TOOL_DATA = '[MCP tool data omitted: it could not be sanitized]';

function isCredentialContainer(name: string, headers: boolean): boolean {
  if (headers && isCredentialHeader(name, '')) {
    return true;
  }
  const compact = normalizeFieldName(name);
  if (
    /^(?:token(?:usages?|counts?|budgets?|settings|ids)|passwordpolic(?:y|ies)|signaturealgorithms?|cookiesettings)$/.test(
      compact,
    )
  ) {
    return false;
  }
  // Ignore public words, preserving credential compounds such as authorAccessToken.
  const credentialWords = name
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b(?:authors?|tokeni[sz]ers?)\b/gi, '');
  // A credential map can contain secrets in its keys as well as its values.
  return (
    isSecretEnvVarName(name) ||
    /(?:password|passwd|passphrase|pwd|secret|credential|dsn|jwt|clientassertion|token|auth|cookie|bearer|session|signature|(?:api|access|subscription|private|signing|encryption|cert|virtual)key)/.test(
      normalizeFieldName(credentialWords),
    )
  );
}

// A form or a credential assignment can carry secrets under an ordinary argument
// name. SQL predicates and other comparisons also use '='.
function hasOpaqueAssignment(text: string): boolean {
  if (!text.includes('=')) {
    return false;
  }
  if (/(?:^|[?&#;])\s*[^\s=?&#;]+=/.test(text)) {
    return true;
  }
  for (const [, label] of text.matchAll(/(?:^|\s)([^\s=]+)\s*=/g)) {
    if (isCredentialContainer(label, true)) {
      return true;
    }
  }
  return false;
}

// Omit opaque encodings, forms and URL parameters before a logger can normalize
// them. Nested URL/form/JSON decoders can disagree about which layer owns a secret.
function isOpaque(text: string): boolean {
  // URL parsers discard leading whitespace and embedded ASCII control characters.
  const url = text.replace(/\p{Cc}/gu, '').trim();
  return (
    looksLikeSecret(text) ||
    hasOpaqueAssignment(text) ||
    /(?:^|[^\w-])eyJ[\w-]*\.[\w-]+\.[\w-]+/.test(text) ||
    /%[\da-f]{2}|\b(?:basic|bearer)\s+\S/i.test(text) ||
    (text.includes('@') && /[:/\\]/.test(text)) ||
    (/^[a-z][a-z\d+.-]*:/i.test(url) &&
      (!/^https?:\/\//i.test(url) || /[?#]/.test(url) || sanitizeUrlForLogging(url) !== text))
  );
}

/** Keep nested public arguments while omitting credentials from saved results and traces. */
export function sanitizeMcpToolData<T>(value: T): T | typeof OMITTED_TOOL_DATA {
  let budget = 4 * 1024 * 1024;
  const visit = (item: unknown, depth: number, headers = false): unknown => {
    if (depth >= MAX_TOOL_DEPTH) {
      return '[...]';
    }
    budget -= 64 + (typeof item === 'string' ? item.length : 0);
    if (budget < 0) {
      throw new Error('MCP tool data too large');
    }
    if (typeof item === 'string') {
      if (/^\s*[[{"]/.test(item)) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(item);
        } catch {
          return REDACTED;
        }
        return JSON.stringify(visit(parsed, depth + 1, headers));
      }
      return isOpaque(item) || (headers && isCredentialHeader('', item)) ? REDACTED : item;
    }
    if (Array.isArray(item)) {
      if (
        item.length === 2 &&
        typeof item[0] === 'string' &&
        isCredentialContainer(item[0], headers)
      ) {
        return REDACTED;
      }
      return item.map((child) => visit(child, depth + 1, headers));
    }
    if (!item || typeof item !== 'object') {
      return typeof item === 'function' ? REDACTED : item;
    }
    const entries = Object.entries(item);
    const headerEntry =
      headers || entries.some(([key, value]) => key === 'in' && value === 'header');
    // Header lists and form entries commonly identify a credential via a name
    // or key and put the credential itself in an otherwise innocuous sibling.
    if (
      entries.some(([key]) =>
        /(?:values?$|^(?:val|data|content|text|raw|default|examples?|const|enum|schema)$)/i.test(
          key,
        ),
      ) &&
      entries.some(
        ([key, label]) =>
          /^(?:name|key|field|header|parameter)$/i.test(key) &&
          typeof label === 'string' &&
          (isOpaque(label) ||
            isCredentialContainer(label, headerEntry || key.toLowerCase() === 'header')),
      )
    ) {
      return REDACTED;
    }
    return Object.fromEntries(
      entries.flatMap(([key, child]) => {
        budget -= key.length + 64;
        if (budget < 0) {
          throw new Error('MCP tool data too large');
        }
        if (key.includes('=') || isOpaque(key) || /^\s*[[{"]/.test(key)) {
          return [];
        }
        const fieldName = normalizeFieldName(key);
        const count =
          typeof child === 'number' &&
          /^(?:(?:max|min)(?:output|completion)?|prompt|completion|input|output|total|cached)tokens$/.test(
            fieldName,
          );
        const sensitive =
          child != null &&
          typeof child !== 'boolean' &&
          !count &&
          isCredentialContainer(key, headers);
        const childHeaders = headers || /headers?(?:map|list)?$/.test(fieldName);
        return [[key, sensitive ? REDACTED : visit(child, depth + 1, childHeaders)]];
      }),
    );
  };

  try {
    return sanitizeObject(visit(value, 0), {
      context: 'MCP tool data',
      sanitizeUrls: true,
      maxDepth: MAX_TOOL_DEPTH,
      throwOnError: true,
    });
  } catch {
    // Getter and serializer errors can themselves contain input credentials.
    return OMITTED_TOOL_DATA;
  }
}

export function normalizeMcpToolContent(
  content: unknown,
  onUnknownContent?: (part: object) => void,
): string {
  if (content == null) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object') {
          if ('text' in part && (part as { text?: unknown }).text != null) {
            return String((part as { text: unknown }).text);
          }
          if ('json' in part) {
            return JSON.stringify((part as { json: unknown }).json);
          }
          if ('data' in part) {
            return JSON.stringify((part as { data: unknown }).data);
          }
          onUnknownContent?.(part);
          return JSON.stringify(part);
        }
        return String(part);
      })
      .join('\n');
  }
  return JSON.stringify(content);
}

export function isMcpToolNameFilter(tools: unknown): tools is string | string[] {
  const isPlainToolName = (tool: unknown): tool is string =>
    typeof tool === 'string' && !tool.startsWith('file://');

  return (
    isPlainToolName(tools) || (Array.isArray(tools) && tools.every((tool) => isPlainToolName(tool)))
  );
}

/**
 * Returns true when an MCP tool call surfaced a failure: either the SDK call
 * threw (`error` is set) or the tool resolved with a protocol-level
 * `isError: true` result.
 */
export function isMcpErrorResult(result: MCPToolResult): boolean {
  return Boolean(result.error || result.isError);
}

/**
 * Resolve a human-readable message for a failed MCP tool call. Prefers the
 * thrown-error message, falls back to the tool's own error content, and finally
 * to a generic message for tools that signal `isError` without any detail.
 */
export function getMcpErrorMessage(result: MCPToolResult): string {
  return result.error || result.content || 'Tool returned an error result';
}

/**
 * Render environment variables in server config auth fields.
 * Supports {{VAR_NAME}} syntax for variable substitution.
 */
export function renderAuthVars(
  server: MCPServerConfig,
  vars?: Record<string, VarValue>,
): MCPServerConfig {
  if (!server.auth) {
    return server;
  }

  // Use process.env as default vars if none provided
  const renderVars = vars || (getProcessEnv() as Record<string, string>);

  return {
    ...server,
    auth: renderVarsInObject(server.auth, renderVars),
  };
}

interface OAuthTokenCache extends OAuthTokenResult {
  refreshAt: number;
}

const oauthTokenCache = new Map<string, OAuthTokenCache>();

/**
 * Get the cache key for an OAuth config
 */
function getOAuthCacheKey(
  auth: MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth,
  tokenUrl: string,
): string {
  return `${tokenUrl}:${auth.grantType}:${'clientId' in auth ? auth.clientId : ''}:${'username' in auth ? auth.username : ''}:${normalizeRenderedOAuthScopes(auth.scopes)?.join(' ') ?? ''}`;
}

// Cache for discovered token endpoints
const tokenEndpointCache = new Map<string, string>();

function isValidTokenEndpoint(tokenEndpoint: string, serverUrl: URL): boolean {
  try {
    const parsedUrl = new URL(tokenEndpoint);
    return (
      (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') &&
      parsedUrl.origin === serverUrl.origin &&
      !parsedUrl.username &&
      !parsedUrl.password
    );
  } catch {
    return false;
  }
}

/**
 * Discover the OAuth token endpoint from the server's well-known metadata.
 * Follows RFC 8414 OAuth 2.0 Authorization Server Metadata.
 * Only requires token_endpoint from the response (unlike SDK which requires authorization_endpoint).
 */
export async function discoverTokenEndpoint(
  serverUrl: string,
  signal?: AbortSignal,
): Promise<string> {
  // Check cache first
  const cached = tokenEndpointCache.get(serverUrl);
  if (cached) {
    return cached;
  }

  const url = new URL(serverUrl);
  const baseUrl = `${url.protocol}//${url.host}`;

  // Try different well-known paths in order of preference
  // 1. Path-appended: /path/.well-known/oauth-authorization-server (common for Keycloak, etc.)
  // 2. RFC 8414 path-aware: /.well-known/oauth-authorization-server/path
  // 3. Root level: /.well-known/oauth-authorization-server
  const discoveryUrls = [];

  const pathname = url.pathname.replace(/\/+$/, '');
  if (pathname) {
    // Path-appended style (e.g., Keycloak: /realms/test/.well-known/oauth-authorization-server)
    discoveryUrls.push(`${baseUrl}${pathname}/.well-known/oauth-authorization-server`);
    // RFC 8414 path-aware style
    discoveryUrls.push(`${baseUrl}/.well-known/oauth-authorization-server${pathname}`);
  }
  // Root level discovery
  discoveryUrls.push(`${baseUrl}/.well-known/oauth-authorization-server`);

  for (const discoveryUrl of discoveryUrls) {
    try {
      logger.debug(`[MCP Auth] Trying OAuth discovery at ${discoveryUrl}`);
      const response = await fetchWithProxy(discoveryUrl, {
        redirect: 'error',
        ...(signal && { signal }),
      });

      if (!response.ok) {
        logger.debug(`[MCP Auth] Discovery failed at ${discoveryUrl}: ${response.status}`);
        continue;
      }

      const metadata = (await response.json()) as { token_endpoint?: string };
      if (metadata.token_endpoint && isValidTokenEndpoint(metadata.token_endpoint, url)) {
        logger.debug(`[MCP Auth] Discovered token endpoint: ${metadata.token_endpoint}`);
        tokenEndpointCache.set(serverUrl, metadata.token_endpoint);
        return metadata.token_endpoint;
      }

      logger.debug(`[MCP Auth] No valid token_endpoint in metadata from ${discoveryUrl}`);
    } catch (error) {
      signal?.throwIfAborted();
      logger.debug(`[MCP Auth] Error fetching ${discoveryUrl}: ${error}`);
    }
  }

  throw new Error(
    `Failed to discover OAuth token endpoint for ${serverUrl}. ` +
      `Please configure tokenUrl explicitly in the auth config.`,
  );
}

// In-flight token requests, so concurrent callers share one token fetch
const pendingTokenRequests = new Map<
  string,
  {
    controller: AbortController;
    promise: Promise<OAuthTokenResult>;
    waiters: number;
  }
>();

/** Reuse a valid token, discover its endpoint if needed, and replace rejected tokens. */
export async function getOAuthTokenWithExpiry(
  auth: MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth,
  serverUrl?: string,
  rejectedToken?: string,
  signal?: AbortSignal,
): Promise<OAuthTokenResult> {
  signal?.throwIfAborted();
  // Use configured tokenUrl or discover it
  let tokenUrl = auth.tokenUrl;
  if (!tokenUrl) {
    if (!serverUrl) {
      throw new Error('Either tokenUrl or serverUrl is required for OAuth token fetching');
    }
    tokenUrl = await discoverTokenEndpoint(serverUrl, signal);
  }

  const cacheKey = getOAuthCacheKey(auth, tokenUrl);
  const cached = oauthTokenCache.get(cacheKey);
  if (cached && cached.accessToken !== rejectedToken && Date.now() < cached.refreshAt) {
    return { accessToken: cached.accessToken, expiresAt: cached.expiresAt };
  }

  let pending = pendingTokenRequests.get(cacheKey);
  if (!pending || pending.controller.signal.aborted) {
    const controller = new AbortController();
    const promise = fetchOAuthToken({
      signal: controller.signal,
      tokenUrl,
      // Credentials must not follow a redirect away from a discovered endpoint
      redirect: auth.tokenUrl ? undefined : 'error',
      grantType: auth.grantType,
      clientId: auth.clientId,
      clientSecret: auth.clientSecret,
      username: 'username' in auth ? auth.username : undefined,
      password: 'password' in auth ? auth.password : undefined,
      scopes: normalizeRenderedOAuthScopes(auth.scopes),
    })
      .then((result) => {
        controller.signal.throwIfAborted();
        // Keep short-lived tokens usable instead of refreshing them on every request.
        const remainingMs = Math.max(0, result.expiresAt - Date.now());
        oauthTokenCache.set(cacheKey, {
          ...result,
          refreshAt: result.expiresAt - Math.min(TOKEN_REFRESH_BUFFER_MS, remainingMs / 2),
        });
        logger.debug('[MCP Auth] Cached OAuth token');
        return result;
      })
      .finally(() => {
        if (pendingTokenRequests.get(cacheKey)?.controller === controller) {
          pendingTokenRequests.delete(cacheKey);
        }
      });
    pending = { controller, promise, waiters: 0 };
    pendingTokenRequests.set(cacheKey, pending);
  }
  pending.waiters++;
  try {
    return await waitForPromiseWithAbort(pending.promise, signal);
  } finally {
    pending.waiters--;
    if (pending.waiters === 0) {
      pending.controller.abort();
    }
  }
}

/**
 * Get authentication headers for an MCP server configuration.
 * Returns headers for bearer, basic, and api_key (header placement) auth types.
 * For OAuth, fetch a token with getOAuthTokenWithExpiry() first and pass it in.
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
