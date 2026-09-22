import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import {
  applyQueryParams,
  discoverTokenEndpoint,
  getAuthHeaders,
  getAuthQueryParams,
  getMcpErrorMessage,
  getOAuthTokenWithExpiry,
  isMcpErrorResult,
  isMcpToolNameFilter,
  renderAuthVars,
} from '../../../src/providers/mcp/util';

import type {
  MCPOAuthClientCredentialsAuth,
  MCPServerConfig,
} from '../../../src/providers/mcp/types';

// Mock fetchWithProxy for discovery tests
const mockFetch = vi.fn();

it('resolves MCP auth from file defaults unless explicit vars replace them', () => {
  const server: MCPServerConfig = { auth: { type: 'bearer', token: '{{MCP_TOKEN}}' } };
  cliState.withEnvFileOverrides({ MCP_TOKEN: 'file-token' }, () => {
    expect(renderAuthVars(server).auth).toEqual({ type: 'bearer', token: 'file-token' });
    expect(renderAuthVars(server, { MCP_TOKEN: 'explicit-token' }).auth).toEqual({
      type: 'bearer',
      token: 'explicit-token',
    });
  });
});
vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: (...args: unknown[]) => mockFetch(...args),
}));

describe('isMcpToolNameFilter', () => {
  it('identifies plain tool names as MCP filters', () => {
    expect(isMcpToolNameFilter('search_companies')).toBe(true);
    expect(isMcpToolNameFilter(['search_companies', 'list_industries'])).toBe(true);
  });

  it('does not classify file loaders or object tool definitions as MCP filters', () => {
    expect(isMcpToolNameFilter('file://tools.json')).toBe(false);
    expect(isMcpToolNameFilter(['file://tools.json'])).toBe(false);
    expect(isMcpToolNameFilter([{ type: 'function', function: { name: 'lookup' } }])).toBe(false);
  });
});

describe('isMcpErrorResult', () => {
  it('flags results with a thrown SDK error', () => {
    expect(isMcpErrorResult({ content: '', error: 'connection lost' })).toBe(true);
  });

  it('flags results with a protocol-level isError flag', () => {
    expect(isMcpErrorResult({ content: 'Path traversal not allowed', isError: true })).toBe(true);
  });

  it('does not flag successful results', () => {
    expect(isMcpErrorResult({ content: 'ok' })).toBe(false);
  });
});

describe('getMcpErrorMessage', () => {
  it('prefers the thrown-error message', () => {
    expect(getMcpErrorMessage({ content: 'ignored', error: 'connection lost' })).toBe(
      'connection lost',
    );
  });

  it('falls back to the tool error content', () => {
    expect(getMcpErrorMessage({ content: 'Path traversal not allowed', isError: true })).toBe(
      'Path traversal not allowed',
    );
  });

  it('falls back to a generic message when an error result has no content', () => {
    expect(getMcpErrorMessage({ content: '', isError: true })).toBe(
      'Tool returned an error result',
    );
  });
});

describe('getAuthHeaders', () => {
  it('should return bearer auth header', () => {
    const server: MCPServerConfig = {
      auth: { type: 'bearer', token: 'abc123' },
    };
    expect(getAuthHeaders(server)).toEqual({
      Authorization: 'Bearer abc123',
    });
  });

  it('should return api_key auth header with default key name', () => {
    const server: MCPServerConfig = {
      auth: { type: 'api_key', api_key: 'xyz789' },
    };
    expect(getAuthHeaders(server)).toEqual({
      'X-API-Key': 'xyz789',
    });
  });

  it('should return api_key auth header with value field', () => {
    const server: MCPServerConfig = {
      auth: { type: 'api_key', value: 'xyz789' },
    };
    expect(getAuthHeaders(server)).toEqual({
      'X-API-Key': 'xyz789',
    });
  });

  it('should return api_key auth header with custom key name', () => {
    const server: MCPServerConfig = {
      auth: { type: 'api_key', value: 'xyz789', keyName: 'X-Custom-Key' },
    };
    expect(getAuthHeaders(server)).toEqual({
      'X-Custom-Key': 'xyz789',
    });
  });

  it('should return empty object for api_key with query placement', () => {
    const server: MCPServerConfig = {
      auth: { type: 'api_key', value: 'xyz789', placement: 'query' },
    };
    expect(getAuthHeaders(server)).toEqual({});
  });

  it('should return basic auth header', () => {
    const server: MCPServerConfig = {
      auth: { type: 'basic', username: 'user', password: 'pass' },
    };
    expect(getAuthHeaders(server)).toEqual({
      Authorization: 'Basic dXNlcjpwYXNz', // base64 of 'user:pass'
    });
  });

  it('should return oauth bearer token when provided', () => {
    const server: MCPServerConfig = {
      auth: {
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'id',
        clientSecret: 'secret',
        tokenUrl: 'https://auth.example.com/token',
      },
    };
    expect(getAuthHeaders(server, 'oauth-token-123')).toEqual({
      Authorization: 'Bearer oauth-token-123',
    });
  });

  it('should return empty object for oauth without token', () => {
    const server: MCPServerConfig = {
      auth: {
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'id',
        clientSecret: 'secret',
        tokenUrl: 'https://auth.example.com/token',
      },
    };
    expect(getAuthHeaders(server)).toEqual({});
  });

  it('should return empty object if no auth', () => {
    const server: MCPServerConfig = {};
    expect(getAuthHeaders(server)).toEqual({});
  });

  it('should return empty object for incomplete auth', () => {
    // Test handling of invalid/incomplete auth config (type assertion bypasses TS for edge case testing)
    const server: MCPServerConfig = { auth: { type: 'bearer' } as MCPServerConfig['auth'] };
    expect(getAuthHeaders(server)).toEqual({});
  });
});

describe('getAuthQueryParams', () => {
  it('should return query params for api_key with query placement', () => {
    const server: MCPServerConfig = {
      auth: { type: 'api_key', value: 'xyz789', placement: 'query', keyName: 'api_key' },
    };
    expect(getAuthQueryParams(server)).toEqual({
      api_key: 'xyz789',
    });
  });

  it('should return empty object for api_key with header placement', () => {
    const server: MCPServerConfig = {
      auth: { type: 'api_key', value: 'xyz789', placement: 'header' },
    };
    expect(getAuthQueryParams(server)).toEqual({});
  });

  it('should return empty object for non-api_key auth', () => {
    const server: MCPServerConfig = {
      auth: { type: 'bearer', token: 'abc123' },
    };
    expect(getAuthQueryParams(server)).toEqual({});
  });

  it('should use default keyName for query placement', () => {
    const server: MCPServerConfig = {
      auth: { type: 'api_key', value: 'xyz789', placement: 'query' },
    };
    expect(getAuthQueryParams(server)).toEqual({
      'X-API-Key': 'xyz789',
    });
  });
});

describe('applyQueryParams', () => {
  it('should append query params to URL', () => {
    const url = 'https://api.example.com/v1';
    const params = { key: 'value', another: 'param' };
    expect(applyQueryParams(url, params)).toBe(
      'https://api.example.com/v1?key=value&another=param',
    );
  });

  it('should append to existing query params', () => {
    const url = 'https://api.example.com/v1?existing=param';
    const params = { key: 'value' };
    expect(applyQueryParams(url, params)).toBe(
      'https://api.example.com/v1?existing=param&key=value',
    );
  });

  it('should return original URL if no params', () => {
    const url = 'https://api.example.com/v1';
    expect(applyQueryParams(url, {})).toBe(url);
  });
});

describe('discoverTokenEndpoint', () => {
  it.each(['/realms/test/', '/realms/test///'])(
    'normalizes trailing slashes in discovery: %s',
    async (path) => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token_endpoint: 'https://trailing.example.com/token' }),
      });
      await expect(discoverTokenEndpoint(`https://trailing.example.com${path}`)).resolves.toBe(
        'https://trailing.example.com/token',
      );
      expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
        'https://trailing.example.com/realms/test/.well-known/oauth-authorization-server',
        'https://trailing.example.com/.well-known/oauth-authorization-server/realms/test',
        'https://trailing.example.com/.well-known/oauth-authorization-server',
      ]);
    },
  );

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should discover token endpoint from root well-known URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token_endpoint: 'https://mcp.example.com/oauth/token',
        authorization_endpoint: 'https://auth.example.com/oauth/authorize',
      }),
    });

    const result = await discoverTokenEndpoint('https://mcp.example.com');
    expect(result).toBe('https://mcp.example.com/oauth/token');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://mcp.example.com/.well-known/oauth-authorization-server',
      { redirect: 'error' },
    );
  });

  it('should try path-appended discovery first for URLs with paths', async () => {
    // First attempt (path-appended) fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    // Second attempt (RFC 8414 path-aware) fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    // Third attempt (root) succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'https://example.com/token' }),
    });

    const result = await discoverTokenEndpoint('https://example.com/realms/test');
    expect(result).toBe('https://example.com/token');

    // Should have tried path-appended first
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://example.com/realms/test/.well-known/oauth-authorization-server',
      { redirect: 'error' },
    );
    // Then RFC 8414 path-aware
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://example.com/.well-known/oauth-authorization-server/realms/test',
      { redirect: 'error' },
    );
    // Then root
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'https://example.com/.well-known/oauth-authorization-server',
      { redirect: 'error' },
    );
  });

  it('should succeed with path-appended discovery (Keycloak style)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token_endpoint: 'https://keycloak.example.com/realms/test/protocol/openid-connect/token',
      }),
    });

    const result = await discoverTokenEndpoint('https://keycloak.example.com/realms/test');
    expect(result).toBe('https://keycloak.example.com/realms/test/protocol/openid-connect/token');
  });

  it('should throw error if no discovery succeeds', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(discoverTokenEndpoint('https://example.com')).rejects.toThrow(
      /Failed to discover OAuth token endpoint/,
    );
  });

  it('should throw error if metadata has no token_endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        // Missing token_endpoint - only has authorization_endpoint
        authorization_endpoint: 'https://auth.example.com/authorize',
      }),
    });

    await expect(discoverTokenEndpoint('https://example.com')).rejects.toThrow(
      /Failed to discover OAuth token endpoint/,
    );
  });

  it('should ignore empty token endpoints during discovery', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: '' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'https://example.com/token' }),
    });

    await expect(discoverTokenEndpoint('https://example.com/path')).resolves.toBe(
      'https://example.com/token',
    );
  });

  it('should ignore malformed token endpoints during discovery', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'not a url' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'https://example.com/token' }),
    });

    await expect(discoverTokenEndpoint('https://example.com/path')).resolves.toBe(
      'https://example.com/token',
    );
  });

  it('should ignore token endpoints with unsupported protocols during discovery', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'ftp://auth.example.com/token' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'https://example.com/token' }),
    });

    await expect(discoverTokenEndpoint('https://example.com/path')).resolves.toBe(
      'https://example.com/token',
    );
  });

  it('should handle network errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(discoverTokenEndpoint('https://example.com')).rejects.toThrow(
      /Failed to discover OAuth token endpoint/,
    );
  });
});

describe('getOAuthTokenWithExpiry', () => {
  it.each([
    'https://unrelated.example.net/token',
    'http://credential-origin.example.com/token',
    'https://credential-origin.example.com:8443/token',
    'https://user:password@credential-origin.example.com/token',
  ])('does not send credentials to an unsafe discovered endpoint: %s', async (tokenEndpoint) => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token_endpoint: tokenEndpoint }),
    });
    await expect(
      getOAuthTokenWithExpiry(
        {
          type: 'oauth',
          grantType: 'client_credentials',
          clientId: 'fixture',
          clientSecret: 'fixture-secret',
        },
        `https://credential-origin.example.com/mcp?case=${encodeURIComponent(tokenEndpoint)}`,
      ),
    ).rejects.toThrow(/configure tokenUrl explicitly/);
    expect(mockFetch.mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(true);
  });

  it('rejects redirects while discovering and exchanging credentials', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'https://redirect-policy.example.com/token' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'fixture-token', expires_in: 3600 }),
    });
    await getOAuthTokenWithExpiry(
      {
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: 'fixture',
        clientSecret: 'fixture-secret',
      },
      'https://redirect-policy.example.com/mcp',
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://redirect-policy.example.com/mcp/.well-known/oauth-authorization-server',
      { redirect: 'error' },
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://redirect-policy.example.com/token',
      expect.objectContaining({ method: 'POST', redirect: 'error' }),
    );
  });

  it('replaces only the rejected token and shares in-flight token requests', async () => {
    let issued = 0;
    let releaseToken!: () => void;
    const tokenGate = new Promise<void>((resolve) => (releaseToken = resolve));
    mockFetch.mockImplementation(async () => {
      await tokenGate;
      issued += 1;
      return {
        ok: true,
        json: async () => ({ access_token: `token-${issued}`, expires_in: 3600 }),
      };
    });
    const auth: MCPOAuthClientCredentialsAuth = {
      type: 'oauth',
      grantType: 'client_credentials',
      clientId: 'rejected-token-client',
      clientSecret: 'secret',
      tokenUrl: 'https://rejected-token.example.com/token',
    };
    const accessToken = async (rejectedToken?: string) =>
      (await getOAuthTokenWithExpiry(auth, undefined, rejectedToken)).accessToken;

    const concurrent = Promise.all([accessToken(), accessToken(), accessToken()]);
    releaseToken();
    await expect(concurrent).resolves.toEqual(['token-1', 'token-1', 'token-1']);
    await expect(accessToken('stale-token')).resolves.toBe('token-1');
    await expect(Promise.all([accessToken('token-1'), accessToken('token-1')])).resolves.toEqual([
      'token-2',
      'token-2',
    ]);
    await expect(accessToken('token-1')).resolves.toBe('token-2');
    expect(mockFetch).toHaveBeenCalledTimes(2);

    mockFetch.mockRejectedValueOnce(new Error('token endpoint down'));
    await expect(accessToken('token-2')).rejects.toThrow('token endpoint down');
    await expect(accessToken('token-2')).resolves.toBe('token-3');
  });

  it('normalizes string scopes for the request and cache key', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'scope-token', expires_in: 3600 }),
    });
    const auth: MCPOAuthClientCredentialsAuth = {
      type: 'oauth',
      grantType: 'client_credentials',
      clientId: 'scope-client',
      clientSecret: 'secret',
      tokenUrl: 'https://scope-auth.example.com/token',
      scopes: ' read  write ',
    };

    const token = await getOAuthTokenWithExpiry(auth);
    const cached = await getOAuthTokenWithExpiry({ ...auth, scopes: ['read', 'write'] });

    expect(token.accessToken).toBe('scope-token');
    expect(cached).toEqual(token);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const request = mockFetch.mock.calls[0][1];
    expect(new URLSearchParams(request.body).get('scope')).toBe('read write');
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('scopes cached tokens by the discovered token endpoint', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      const parsedUrl = new URL(url);
      if (parsedUrl.pathname.endsWith('/.well-known/oauth-authorization-server')) {
        return {
          ok: true,
          json: async () => ({
            token_endpoint:
              parsedUrl.hostname === 'agent-a.example.com'
                ? 'https://agent-a.example.com/oauth/token'
                : 'https://agent-b.example.com/oauth/token',
          }),
        };
      }

      if (url === 'https://agent-a.example.com/oauth/token') {
        return {
          ok: true,
          json: async () => ({ access_token: 'token-a', expires_in: 3600 }),
        };
      }

      if (url === 'https://agent-b.example.com/oauth/token') {
        return {
          ok: true,
          json: async () => ({ access_token: 'token-b', expires_in: 3600 }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const auth: MCPOAuthClientCredentialsAuth = {
      type: 'oauth',
      grantType: 'client_credentials',
      clientId: 'shared-client',
      clientSecret: 'secret',
    };

    const firstToken = await getOAuthTokenWithExpiry(auth, 'https://agent-a.example.com/a2a');
    const secondToken = await getOAuthTokenWithExpiry(auth, 'https://agent-b.example.com/a2a');

    expect(firstToken.accessToken).toBe('token-a');
    expect(secondToken.accessToken).toBe('token-b');
    expect(
      mockFetch.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.includes('/oauth/token')),
    ).toEqual([
      'https://agent-a.example.com/oauth/token',
      'https://agent-b.example.com/oauth/token',
    ]);
  });
});
