import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../../util/utils';

const mockGetOAuthTokenWithExpiry = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    accessToken: 'mock-oauth-token',
    expiresAt: Date.now() + 3600000,
  }),
);
vi.mock('../../../src/providers/mcp/util', async () => ({
  ...(await vi.importActual<typeof import('../../../src/providers/mcp/util')>(
    '../../../src/providers/mcp/util',
  )),
  getOAuthTokenWithExpiry: (...args: unknown[]) => mockGetOAuthTokenWithExpiry(...args),
}));

const mcpMocks = vi.hoisted(() => {
  const mockClient = {
    registerCapabilities: vi.fn(),
    assertCapability: vi.fn(),
    connect: vi.fn(),
    ping: vi.fn().mockResolvedValue({}),
    listTools: vi.fn().mockResolvedValue({
      tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
    }),
    callTool: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockStreamableHTTPTransport = {
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockSSETransport = {
    close: vi.fn().mockResolvedValue(undefined),
  };
  const MockClient = vi.fn(function MockClient() {
    return mockClient;
  });
  const MockStreamableHTTPTransport = vi.fn(function MockStreamableHTTPTransport() {
    return mockStreamableHTTPTransport;
  });
  const MockSSETransport = vi.fn(function MockSSETransport() {
    return mockSSETransport;
  });
  return {
    mockClient,
    mockStreamableHTTPTransport,
    mockSSETransport,
    MockClient,
    MockStreamableHTTPTransport,
    MockSSETransport,
  };
});

const { mockClient, mockStreamableHTTPTransport, mockSSETransport } = mcpMocks;

vi.mock('@modelcontextprotocol/sdk/client/index.js', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    Client: mcpMocks.MockClient,
  };
});
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    StreamableHTTPClientTransport: mcpMocks.MockStreamableHTTPTransport,
  };
});
vi.mock('@modelcontextprotocol/sdk/client/sse.js', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    SSEClientTransport: mcpMocks.MockSSETransport,
  };
});
vi.mock('../../../src/util/fetch/monkeyPatchFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/util/fetch/monkeyPatchFetch')>();
  return {
    ...actual,
    monkeyPatchFetch: vi.fn(),
  };
});

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCPClient } from '../../../src/providers/mcp/client';
import { withPrivateRangeGuard } from '../../../src/util/fetch/guardContext';
import { monkeyPatchFetch } from '../../../src/util/fetch/monkeyPatchFetch';
import { PrivateRangeBlockedError } from '../../../src/util/privateNetwork';

const mockedMonkeyPatchFetch = vi.mocked(monkeyPatchFetch);

const oauthServer = {
  url: 'https://192.0.2.1',
  headers: { 'X-Custom-Header': 'custom-value' },
  auth: {
    type: 'oauth' as const,
    grantType: 'client_credentials' as const,
    clientId: 'test-client',
    clientSecret: 'test-secret',
    tokenUrl: 'https://auth.example.com/token',
  },
};

describe('MCP OAuth transport fetch under the private-range guard', () => {
  let restoreEnv: (() => void) | undefined;
  let mcpClient: MCPClient | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.connect.mockReset();
    mockClient.ping.mockReset().mockResolvedValue({});
    mockClient.listTools.mockReset().mockResolvedValue({
      tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
    });
    mockClient.callTool.mockReset();
    mockClient.close.mockReset().mockResolvedValue(undefined);
    mockStreamableHTTPTransport.close.mockReset().mockResolvedValue(undefined);
    mockSSETransport.close.mockReset().mockResolvedValue(undefined);
    mockGetOAuthTokenWithExpiry.mockReset();
    mockGetOAuthTokenWithExpiry.mockResolvedValue({
      accessToken: 'mock-oauth-token',
      expiresAt: Date.now() + 3600000,
    });
    mockedMonkeyPatchFetch.mockReset();
  });

  afterEach(async () => {
    await mcpClient?.cleanup().catch(() => undefined);
    mcpClient = undefined;
    restoreEnv?.();
    restoreEnv = undefined;
    vi.restoreAllMocks();
  });

  async function initializeOAuthFetch() {
    mcpClient = new MCPClient({ enabled: true, server: oauthServer });
    await mcpClient.initialize();
    const options = vi.mocked(StreamableHTTPClientTransport).mock.calls[0][1];
    expect(options).toEqual({
      requestInit: { headers: { 'X-Custom-Header': 'custom-value' } },
      fetch: expect.any(Function),
    });
    return options!.fetch!;
  }

  it('refuses a public-to-private redirect from the OAuth transport fetch', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    const oauthFetch = await initializeOAuthFetch();
    // The SDK's ordinary fetch would follow this 307 to link-local space.
    // Inside the guard the transport fetch must validate the hop instead,
    // so the private destination is never requested.
    mockedMonkeyPatchFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 307,
        headers: { location: 'http://169.254.169.254/latest/meta-data' },
      }),
    );
    const globalFetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(
      withPrivateRangeGuard(() =>
        oauthFetch('https://192.0.2.1/', {
          method: 'POST',
          body: '{"method":"tools/call"}',
        }),
      ),
    ).rejects.toThrow(PrivateRangeBlockedError);
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(1);
    expect(globalFetchSpy).not.toHaveBeenCalled();
  });

  it('uses the plain global fetch outside the guard context', async () => {
    const oauthFetch = await initializeOAuthFetch();
    const globalFetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }));

    const response = await oauthFetch('https://192.0.2.1/', {
      method: 'POST',
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(globalFetchSpy).toHaveBeenCalled();
    expect(mockedMonkeyPatchFetch).not.toHaveBeenCalled();
  });

  it('still resends a 401 once with the replacement token inside the guard', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    const oauthFetch = await initializeOAuthFetch();
    mockGetOAuthTokenWithExpiry
      .mockResolvedValueOnce({ accessToken: 'revoked', expiresAt: Date.now() + 3600000 })
      .mockResolvedValueOnce({ accessToken: 'replacement', expiresAt: Date.now() + 3600000 });
    mockedMonkeyPatchFetch
      .mockResolvedValueOnce(new Response('body', { status: 401 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await withPrivateRangeGuard(() =>
      oauthFetch('https://192.0.2.1/', {
        method: 'POST',
        body: '{"id":1}',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(2);
    const authorizations = mockedMonkeyPatchFetch.mock.calls.map(([, init]) =>
      new Headers((init as { headers?: unknown }).headers as HeadersInit).get('Authorization'),
    );
    expect(authorizations).toEqual(['Bearer revoked', 'Bearer replacement']);
    expect(mockGetOAuthTokenWithExpiry).toHaveBeenCalledTimes(3);
  });
});
