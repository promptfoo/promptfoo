import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../../util/utils';

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

// A server with no auth (bearer/basic behave the same way): the OAuth path
// used to be the only one that injected a custom transport fetch, so a
// preflighted public server.url could 307 into private space and the SDK's
// default fetch followed it outside the guard.
const noAuthServer = {
  url: 'https://192.0.2.1',
  headers: { 'X-Custom-Header': 'custom-value' },
};

describe('MCP non-OAuth transport fetch under the private-range guard', () => {
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
    mockedMonkeyPatchFetch.mockReset();
  });

  afterEach(async () => {
    await mcpClient?.cleanup().catch(() => undefined);
    mcpClient = undefined;
    restoreEnv?.();
    restoreEnv = undefined;
    vi.restoreAllMocks();
  });

  async function initializeTransportFetch() {
    mcpClient = new MCPClient({ enabled: true, server: noAuthServer });
    await mcpClient.initialize();
    const options = vi.mocked(StreamableHTTPClientTransport).mock.calls[0][1];
    expect(options).toEqual({
      requestInit: { headers: { 'X-Custom-Header': 'custom-value' } },
      fetch: expect.any(Function),
    });
    return options!.fetch!;
  }

  it('refuses a public-to-private redirect from the non-OAuth transport fetch', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
    const transportFetch = await initializeTransportFetch();
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
        transportFetch('https://192.0.2.1/', {
          method: 'POST',
          body: '{"method":"tools/call"}',
        }),
      ),
    ).rejects.toThrow(PrivateRangeBlockedError);
    expect(mockedMonkeyPatchFetch).toHaveBeenCalledTimes(1);
    expect(globalFetchSpy).not.toHaveBeenCalled();
  });

  it('uses the plain global fetch outside the guard context', async () => {
    const transportFetch = await initializeTransportFetch();
    const globalFetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }));

    const response = await transportFetch('https://192.0.2.1/', {
      method: 'POST',
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(globalFetchSpy).toHaveBeenCalled();
    expect(mockedMonkeyPatchFetch).not.toHaveBeenCalled();
  });
});
