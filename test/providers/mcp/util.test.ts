import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import logger from '../../../src/logger';
import {
  applyQueryParams,
  discoverTokenEndpoint,
  getAuthHeaders,
  getAuthQueryParams,
  getMcpErrorMessage,
  getOAuthTokenWithExpiry,
  isMcpErrorResult,
  isMcpToolNameFilter,
  normalizeMcpToolContent,
  renderAuthVars,
  sanitizeMcpToolData,
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

describe('sanitizeMcpToolData', () => {
  const omitted = '[MCP tool data omitted: it could not be sanitized]';

  it('keeps deeply nested arguments while redacting secrets at any depth', () => {
    const args = {
      query: {
        filter: {
          and: [
            { field: 'status', in: ['open', { any: [{ of: ['urgent', { level: { min: 3 } }] }] }] },
          ],
        },
      },
      connection: { options: { pool: { retry: { apiKey: 'tool-secret-value', attempts: 2 } } } },
    };

    expect(sanitizeMcpToolData(args)).toEqual({
      query: args.query,
      connection: { options: { pool: { retry: { apiKey: '[REDACTED]', attempts: 2 } } } },
    });
  });

  it.each(['databasePassword', 'dbPassword', 'database_password', 'DB_PASSWORD'])(
    'redacts compound credential %s in nested objects and JSON arguments',
    (key) => {
      const fields = {
        [key]: 'mcp-compound-fixture',
        pageToken: 'page-2',
        maxTokens: 100,
        databasePasswordEnabled: true,
        includeCredentials: false,
        monkey: 'ordinary',
        key: 'record-name',
        'record.key': 'field-name',
        tokenCount: 12,
        credentialsRequired: false,
      };
      const expected = { ...fields, [key]: '[REDACTED]' };
      const args = { one: { two: { three: { four: { items: [fields] } } } } };
      const original = structuredClone(args);

      expect(sanitizeMcpToolData(args)).toEqual({
        one: { two: { three: { four: { items: [expected] } } } },
      });
      expect(sanitizeMcpToolData({ encoded: JSON.stringify(args) })).toEqual({
        encoded: JSON.stringify({ one: { two: { three: { four: { items: [expected] } } } } }),
      });
      expect(args).toEqual(original);
    },
  );

  it.each([
    (value: string) => `data=${encodeURIComponent(value)}`,
    (value: string) => `https://example.test/?data=${encodeURIComponent(value)}`,
    (value: string) => `https://example.test/#data=${encodeURIComponent(value)}`,
    (value: string) => `https://{{ hostname }}/?data=${encodeURIComponent(value)}`,
  ])('retains the compound-key policy in encoded JSON (%#)', (wrap) => {
    const fields = {
      databasePassword: 'encoded-fixture',
      dbPassword: 'db-fixture',
      tokenCount: 12,
      credentialsRequired: false,
      key: 'row-id',
    };
    const value = wrap(JSON.stringify(fields));
    const expected = wrap(
      JSON.stringify({ ...fields, databasePassword: '[REDACTED]', dbPassword: '[REDACTED]' }),
    );
    const args = { one: { two: { three: { four: { five: { value, url: value } } } } } };
    expect(sanitizeMcpToolData(args)).toEqual({
      one: { two: { three: { four: { five: { value: expected, url: expected } } } } },
    });
    expect(args.one.two.three.four.five.value).toBe(value);
    expect(sanitizeMcpToolData({ url: 'ordinary-relative-resource' })).toEqual({
      url: 'ordinary-relative-resource',
    });
  });

  it('keeps the depth ceiling when form JSON resumes object traversal', () => {
    const encoded = `data=${encodeURIComponent(JSON.stringify(nestedArgs(80)))}`;
    const result = sanitizeMcpToolData({ one: { two: { encoded } } });
    expect(JSON.stringify(result)).not.toContain('compound-secret-value');
    expect(JSON.stringify(result)).not.toContain('tool-secret-value');
    expect(JSON.stringify(result)).toContain('%5B...%5D');
  });

  it.each([
    'redirect=https://alice:fixture-password@example.test/path',
    'redirect=/callback?api_key=short-secret',
    'redirect=/callback#access_token=short-secret',
  ])('retains URL credential checks for form-valued URL fields (%s)', (value) => {
    const args = { url: value, callbackUrl: value };
    expect(sanitizeMcpToolData(args)).toEqual({ url: '[REDACTED]', callbackUrl: '[REDACTED]' });
    expect(args).toEqual({ url: value, callbackUrl: value });
    expect(sanitizeMcpToolData({ url: 'redirect=/callback?page=2' })).toEqual({
      url: 'redirect=/callback?page=2',
    });
  });

  it('preserves URL-keyed payloads while sanitizing the key and nested credentials', () => {
    const args = {
      'https://example.test/?api_key=short': { method: 'GET', databasePassword: 'fixture' },
      'https://example.test/?api_key=%5BREDACTED%5D': { method: 'POST' },
      '/callback?api_key=short': { status: 200 },
    };
    const original = structuredClone(args);
    expect(sanitizeMcpToolData(args)).toEqual({
      'https://example.test/?api_key=%5BREDACTED%5D#1': {
        method: 'GET',
        databasePassword: '[REDACTED]',
      },
      'https://example.test/?api_key=%5BREDACTED%5D': { method: 'POST' },
      '/callback?api_key=%5BREDACTED%5D': { status: 200 },
    });
    expect(args).toEqual(original);
  });

  it('handles long segmented argument names and their credential suffixes', () => {
    const prefix = 'word_'.repeat(50_000);
    const args = { [prefix]: 'ordinary', [`${prefix}databasePassword`]: 'secret-fixture' };
    expect(sanitizeMcpToolData(args)).toEqual({
      [prefix]: 'ordinary',
      [`${prefix}databasePassword`]: '[REDACTED]',
    });
  });

  /** Arguments with `levels` nested objects and a secret in the innermost one. */
  function nestedArgs(levels: number) {
    const args: Record<string, unknown> = {};
    let node = args;
    for (let level = 0; level < levels; level++) {
      const child: Record<string, unknown> = {};
      node.child = child;
      node = child;
    }
    node.apiKey = 'tool-secret-value';
    node.databasePassword = 'compound-secret-value';
    node.attempts = 2;
    return args;
  }

  /** The innermost object of a sanitized result, without recursion. */
  function innermost(value: unknown) {
    let node = value as Record<string, unknown>;
    let levels = 0;
    while (node.child !== null && typeof node.child === 'object') {
      node = node.child as Record<string, unknown>;
      levels++;
    }
    return { node, levels };
  }

  it('reports arguments down to 64 levels and cuts off anything deeper', () => {
    expect(innermost(sanitizeMcpToolData(nestedArgs(64)))).toEqual({
      node: { apiKey: '[REDACTED]', databasePassword: '[REDACTED]', attempts: 2 },
      levels: 64,
    });
    expect(innermost(sanitizeMcpToolData(nestedArgs(65)))).toEqual({
      node: { child: '[...]' },
      levels: 64,
    });
  });

  it.each([4_000, 20_000, 200_000])(
    'does not expose a secret in arguments nested %i levels deep',
    (levels) => {
      // Nesting this deep exhausts the stack somewhere in the sanitizer. The sanitizer's
      // fallback of returning its input would report the secret as it came in.
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const result: unknown = sanitizeMcpToolData(nestedArgs(levels));

        // Where the stack runs out depends on the platform: the arguments come back cut off
        // at the depth limit, or as a placeholder from this helper or from the serializer.
        // What matters is that the secret is in none of them.
        if (typeof result === 'string') {
          expect(result).not.toContain('tool-secret-value');
          expect(result).not.toContain('compound-secret-value');
        } else {
          const { node, levels: reported } = innermost(result);
          expect(reported).toBeLessThanOrEqual(64);
          expect(JSON.stringify(node)).not.toContain('tool-secret-value');
          expect(JSON.stringify(node)).not.toContain('compound-secret-value');
        }
        expect(errors).not.toHaveBeenCalled();
      } finally {
        errors.mockRestore();
      }
    },
  );

  it('reports a placeholder instead of arguments it cannot sanitize', () => {
    const args = { apiKey: 'tool-secret-value' };
    Object.defineProperty(args, 'unreadable', {
      enumerable: true,
      get() {
        // An error can carry the data it was thrown for, in its message or in its name.
        const error = new Error(`cannot read ${args.apiKey}`);
        error.name = args.apiKey;
        throw error;
      },
    });
    const debug = vi.spyOn(logger, 'debug').mockImplementation(() => logger);

    try {
      expect(sanitizeMcpToolData(args)).toBe(omitted);
      expect(debug).toHaveBeenCalledWith('[MCP] Tool data could not be sanitized and is omitted');
      expect(JSON.stringify(debug.mock.calls)).not.toContain('tool-secret-value');

      // Even looking at what was thrown can run code that the data controls.
      const hostile = { apiKey: 'tool-secret-value' };
      Object.defineProperty(hostile, 'unreadable', {
        enumerable: true,
        get() {
          throw new Proxy(
            {},
            {
              getPrototypeOf() {
                throw new Error(hostile.apiKey);
              },
            },
          );
        },
      });
      expect(sanitizeMcpToolData(hostile)).toBe(omitted);
    } finally {
      debug.mockRestore();
    }
  });

  it('redacts values under keys that end in a credential word, at any depth', () => {
    // A tool names its arguments as it likes, so exact key names are not enough.
    const connection = {
      databasePassword: 'hunter2',
      db_password: 'hunter2',
      userApiKey: 'tool-secret-value',
      'x-upstream-token': 'tool-secret-value',
      oauthClientSecret: { value: 'tool-secret-value' },
      // These end in words that are not credentials.
      sortKey: 'name',
      key: 'user:1',
      maxTokens: 5,
      author: 'ada',
    };
    const args = { ...connection, level1: { level2: { level3: { level4: { connection } } } } };

    const expected = {
      databasePassword: '[REDACTED]',
      db_password: '[REDACTED]',
      userApiKey: '[REDACTED]',
      'x-upstream-token': '[REDACTED]',
      oauthClientSecret: '[REDACTED]',
      sortKey: 'name',
      key: 'user:1',
      maxTokens: 5,
      author: 'ada',
    };
    expect(sanitizeMcpToolData(args)).toEqual({
      ...expected,
      level1: { level2: { level3: { level4: { connection: expected } } } },
    });
    // The caller's arguments are left as they were.
    expect(connection.databasePassword).toBe('hunter2');
  });

  it('redacts such keys in JSON that an argument carries as a string', () => {
    const payload = JSON.stringify({ query: 'select 1', dbPassword: 'hunter2' });

    expect(sanitizeMcpToolData({ payload, note: '{not json' })).toEqual({
      payload: JSON.stringify({ query: 'select 1', dbPassword: '[REDACTED]' }),
      note: '{not json',
    });
    expect(sanitizeMcpToolData(payload)).toBe(
      JSON.stringify({ query: 'select 1', dbPassword: '[REDACTED]' }),
    );
  });

  it('copes with arguments that refer to themselves', () => {
    const args: Record<string, unknown> = { id: '123' };
    args.self = args;

    expect(() => sanitizeMcpToolData(args)).not.toThrow();
    expect(sanitizeMcpToolData(args)).toMatchObject({ id: '123' });
  });
});

describe('normalizeMcpToolContent', () => {
  it.each([
    { name: 'null', content: null, expected: '' },
    { name: 'undefined', content: undefined, expected: '' },
    { name: 'literal text', content: '{{secret}}', expected: '{{secret}}' },
    { name: 'number', content: 42, expected: '42' },
    { name: 'object', content: { text: 'whole object' }, expected: '{"text":"whole object"}' },
    { name: 'empty array', content: [], expected: '' },
    {
      name: 'mixed blocks and property precedence',
      content: [
        'literal',
        { text: 0, json: 'ignored', data: 'ignored' },
        { text: false },
        { text: '', data: 'ignored' },
        { text: null, json: { count: 2 }, data: 'ignored' },
        { data: ['value'] },
        { resource: { uri: 'file:///literal.txt' } },
        null,
        undefined,
      ],
      expected:
        'literal\n0\nfalse\n\n{"count":2}\n["value"]\n{"resource":{"uri":"file:///literal.txt"}}\nnull\nundefined',
    },
    {
      name: 'undefined property values and sparse entries',
      content: [{ json: undefined, data: 'ignored' }, , { data: undefined }],
      expected: '\n\n',
    },
  ])('renders $name without changing content semantics', ({ content, expected }) => {
    expect(normalizeMcpToolContent(content)).toBe(expected);
  });

  it('only reports unknown object blocks, before serializing each block', () => {
    const events: string[] = [];
    const unknown = {
      toJSON: () => {
        events.push('serialize');
        return 'serialized';
      },
    };
    const onUnknownContent = vi.fn(() => {
      events.push('diagnostic');
    });

    expect(
      normalizeMcpToolContent(
        [{ text: 'known' }, { json: 1 }, { data: 2 }, unknown, 'plain', 3],
        onUnknownContent,
      ),
    ).toBe('known\n1\n2\n"serialized"\nplain\n3');
    expect(onUnknownContent).toHaveBeenCalledExactlyOnceWith(unknown);
    expect(events).toEqual(['diagnostic', 'serialize']);
  });

  it('preserves serialization failures for the provider error handler', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => normalizeMcpToolContent([{ json: cyclic }])).toThrow(TypeError);
    expect(() => normalizeMcpToolContent([{ data: 1n }])).toThrow(TypeError);
  });
});

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

  it('should ignore empty token endpoints during discovery', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: '' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'https://auth.example.com/token' }),
    });

    await expect(discoverTokenEndpoint('https://example.com/path')).resolves.toBe(
      'https://auth.example.com/token',
    );
  });

  it('should ignore malformed token endpoints during discovery', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'not a url' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'https://auth.example.com/token' }),
    });

    await expect(discoverTokenEndpoint('https://example.com/path')).resolves.toBe(
      'https://auth.example.com/token',
    );
  });

  it('should ignore token endpoints with unsupported protocols during discovery', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'ftp://auth.example.com/token' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token_endpoint: 'https://auth.example.com/token' }),
    });

    await expect(discoverTokenEndpoint('https://example.com/path')).resolves.toBe(
      'https://auth.example.com/token',
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
                ? 'https://auth-a.example.com/oauth/token'
                : 'https://auth-b.example.com/oauth/token',
          }),
        };
      }

      if (url === 'https://auth-a.example.com/oauth/token') {
        return {
          ok: true,
          json: async () => ({ access_token: 'token-a', expires_in: 3600 }),
        };
      }

      if (url === 'https://auth-b.example.com/oauth/token') {
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
    ).toEqual(['https://auth-a.example.com/oauth/token', 'https://auth-b.example.com/oauth/token']);
  });
});
