import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyQueryParams,
  discoverTokenEndpoint,
  getAuthHeaders,
  getAuthQueryParams,
} from '../../../src/providers/mcp/util';

import type { MCPServerConfig } from '../../../src/providers/mcp/types';

// Mock fetchWithProxy for discovery tests
const mockFetch = vi.fn();
vi.mock('../../../src/util/fetch', () => ({
  fetchWithProxy: (...args: unknown[]) => mockFetch(...args),
}));

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
        token_endpoint: 'https://auth.example.com/oauth/token',
        authorization_endpoint: 'https://auth.example.com/oauth/authorize',
      }),
    });

    const result = await discoverTokenEndpoint('https://mcp.example.com');
    expect(result).toBe('https://auth.example.com/oauth/token');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://mcp.example.com/.well-known/oauth-authorization-server',
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
      json: async () => ({ token_endpoint: 'https://auth.example.com/token' }),
    });

    const result = await discoverTokenEndpoint('https://example.com/realms/test');
    expect(result).toBe('https://auth.example.com/token');

    // Should have tried path-appended first
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://example.com/realms/test/.well-known/oauth-authorization-server',
    );
    // Then RFC 8414 path-aware
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://example.com/.well-known/oauth-authorization-server/realms/test',
    );
    // Then root
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'https://example.com/.well-known/oauth-authorization-server',
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

  it('should handle network errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(discoverTokenEndpoint('https://example.com')).rejects.toThrow(
      /Failed to discover OAuth token endpoint/,
    );
  });
});
