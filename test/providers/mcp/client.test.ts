import path from 'path';

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMcpServerConfig, createMcpServerOptions } from '../../factories/literalFixtures';

function createSingleToolListResponse() {
  return {
    tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
  };
}

const createMultipleServerOptions = () => ({
  enabled: true,
  servers: [
    createNamedNpmServerConfig(),
    {
      name: 'server2',
      path: 'script.js',
    },
  ],
});

const createNamedNpmServerConfig = () => ({
  name: 'server1',
  command: 'npm',
  args: ['start'],
});

const createTwoToolListResponse = () => ({
  tools: [
    { name: 'tool1', description: 'desc1', inputSchema: {} },
    { name: 'tool2', description: 'desc2', inputSchema: {} },
  ],
});

const createRemoteServerOptions = () => ({
  enabled: true,
  server: {
    url: 'http://localhost:3000',
  },
});

const createAuthenticatedHeaders = () => ({
  'X-Custom-Header': 'custom-value',
  Authorization: 'Bearer test-token',
});

const mockGetEnvInt = vi.hoisted(() => vi.fn().mockReturnValue(undefined));
vi.mock('../../../src/envars', async () => ({
  ...(await vi.importActual<typeof import('../../../src/envars')>('../../../src/envars')),
  getEnvInt: (...args: unknown[]) => mockGetEnvInt(...args),
}));

const mockGetOAuthTokenWithExpiry = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    accessToken: 'mock-oauth-token',
    expiresAt: Date.now() + 3600000, // 1 hour from now
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
    _clientInfo: {},
    _capabilities: {},
    registerCapabilities: vi.fn(),
    assertCapability: vi.fn(),
    connect: vi.fn(),
    ping: vi.fn().mockResolvedValue({}),
    listTools: vi.fn().mockResolvedValue(createSingleToolListResponse()),
    callTool: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockStdioTransport = {
    close: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn(),
    start: vi.fn(),
    send: vi.fn(),
  };

  const mockStreamableHTTPTransport = {
    close: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn(),
    start: vi.fn(),
    send: vi.fn(),
  };

  const mockSSETransport = {
    close: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn(),
    start: vi.fn(),
    send: vi.fn(),
  };

  const MockClient = vi.fn(function MockClient() {
    return mockClient;
  });

  const MockStdioTransport = vi.fn(function MockStdioTransport() {
    return mockStdioTransport;
  });

  const MockStreamableHTTPTransport = vi.fn(function MockStreamableHTTPTransport() {
    return mockStreamableHTTPTransport;
  });

  const MockSSETransport = vi.fn(function MockSSETransport() {
    return mockSSETransport;
  });

  return {
    mockClient,
    mockStdioTransport,
    mockStreamableHTTPTransport,
    mockSSETransport,
    MockClient,
    MockSSETransport,
    MockStdioTransport,
    MockStreamableHTTPTransport,
  };
});

const { mockClient, mockSSETransport, mockStdioTransport, mockStreamableHTTPTransport } = mcpMocks;

// Mock the modules before importing them
vi.mock('@modelcontextprotocol/sdk/client/index.js', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    Client: mcpMocks.MockClient,
  };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    StdioClientTransport: mcpMocks.MockStdioTransport,
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

// Import the mocked modules after mocking
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import cliState from '../../../src/cliState';
import { MCPClient } from '../../../src/providers/mcp/client';

describe('MCPClient', () => {
  let mcpClient: MCPClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.registerCapabilities.mockReset();
    mockClient.assertCapability.mockReset();
    mockClient.connect.mockReset();
    mockClient.ping.mockReset().mockResolvedValue({});
    mockClient.listTools.mockReset().mockResolvedValue(createSingleToolListResponse());
    mockClient.callTool.mockReset();
    mockClient.close.mockReset().mockResolvedValue(undefined);
    mockStdioTransport.close.mockReset().mockResolvedValue(undefined);
    mockStdioTransport.connect.mockReset();
    mockStdioTransport.start.mockReset();
    mockStdioTransport.send.mockReset();
    mockStreamableHTTPTransport.close.mockReset().mockResolvedValue(undefined);
    mockStreamableHTTPTransport.connect.mockReset();
    mockStreamableHTTPTransport.start.mockReset();
    mockStreamableHTTPTransport.send.mockReset();
    mockSSETransport.close.mockReset().mockResolvedValue(undefined);
    mockSSETransport.connect.mockReset();
    mockSSETransport.start.mockReset();
    mockSSETransport.send.mockReset();
    mockGetEnvInt.mockReset();
    mockGetEnvInt.mockReturnValue(undefined);
    // Reset the OAuth token mock to return a valid token by default
    mockGetOAuthTokenWithExpiry.mockReset();
    mockGetOAuthTokenWithExpiry.mockResolvedValue({
      accessToken: 'mock-oauth-token',
      expiresAt: Date.now() + 3600000, // 1 hour from now
    });
    cliState.basePath = undefined;
  });

  describe('initialize', () => {
    it('passes file defaults below explicit MCP server environment values', async () => {
      mockClient.listTools.mockResolvedValueOnce({ tools: [] });
      mcpClient = new MCPClient({
        enabled: true,
        server: {
          command: 'mcp-server',
          env: { PROMPTFOO_REVIEW_ENV_OVERRIDE: 'explicit' },
        },
      });
      await cliState.withEnvFileOverrides(
        {
          PROMPTFOO_REVIEW_ENV_PROBE: 'file',
          PROMPTFOO_REVIEW_ENV_OVERRIDE: 'file',
        },
        () => mcpClient.initialize(),
      );
      expect(StdioClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({
            PROMPTFOO_REVIEW_ENV_PROBE: 'file',
            PROMPTFOO_REVIEW_ENV_OVERRIDE: 'explicit',
          }),
        }),
      );
      await mcpClient.cleanup();
    });

    it.each([
      { server: {} },
      { server: { url: 'https://mcp.example.test', auth: { type: 'api_key' } } },
      {
        servers: [
          { command: 'node' },
          { url: 'https://mcp.example.test', auth: { type: 'bearer', token: 123 } },
        ],
      },
      { server: { command: 'node', env: { TOKEN: 123 } } },
      { timeout: -1 },
    ])('rejects malformed configuration before initializing any SDK client: %j', (config) => {
      expect(() => new MCPClient({ enabled: true, ...config })).toThrow();
      expect(Client).not.toHaveBeenCalled();
      expect(StdioClientTransport).not.toHaveBeenCalled();
      expect(StreamableHTTPClientTransport).not.toHaveBeenCalled();
      expect(mockGetOAuthTokenWithExpiry).not.toHaveBeenCalled();
    });

    it('does not spawn a transport after cleanup cancels SDK loading', async () => {
      mcpClient = new MCPClient({ server: { command: 'node' } });
      const startup = mcpClient.initialize();
      const rejected = expect(startup).rejects.toThrow();
      await mcpClient.cleanup();
      await rejected;
      expect(StdioClientTransport).not.toHaveBeenCalled();
      expect(mcpClient.hasInitialized).toBe(false);
    });

    it('closes an unpublished connection and rejects a late handshake', async () => {
      let connected!: () => void;
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      mockClient.connect.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            connected = resolve;
            started();
          }),
      );
      mcpClient = new MCPClient({ server: { command: 'node' } });
      const startup = mcpClient.initialize();
      const rejected = expect(startup).rejects.toThrow();
      await ready;
      await mcpClient.cleanup();
      expect(mockStdioTransport.close).toHaveBeenCalledOnce();
      expect(mockClient.close).toHaveBeenCalledOnce();
      connected();
      await rejected;
      expect(mockClient.listTools).not.toHaveBeenCalled();
      expect(mcpClient.hasInitialized).toBe(false);
    });

    it('aborts OAuth acquisition before any transport starts', async () => {
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      mockGetOAuthTokenWithExpiry.mockImplementationOnce(
        (_auth, _url, _rejected, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            started();
          }),
      );
      mcpClient = new MCPClient({
        server: {
          url: 'https://cancel-startup.example.test',
          auth: { type: 'oauth', clientId: 'fixture', clientSecret: 'fixture' },
        },
      });
      const startup = mcpClient.initialize();
      const rejected = expect(startup).rejects.toThrow();
      await ready;
      await mcpClient.cleanup();
      await rejected;
      expect(StreamableHTTPClientTransport).not.toHaveBeenCalled();
      expect(SSEClientTransport).not.toHaveBeenCalled();
    });

    it('defaults enabled and OAuth grant without changing the input', async () => {
      const auth = {
        type: 'oauth',
        clientId: 'client',
        clientSecret: 'secret',
        scopes: 'read write',
      };
      const input = { server: { url: 'https://mcp.example.test', auth } };
      mcpClient = new MCPClient(input);
      await mcpClient.initialize();
      expect(mockGetOAuthTokenWithExpiry).toHaveBeenCalledWith(
        { ...auth, grantType: 'client_credentials' },
        'https://mcp.example.test',
        undefined,
        expect.any(AbortSignal),
      );
      expect(input).not.toHaveProperty('enabled');
      expect(auth).not.toHaveProperty('grantType');
      await mcpClient.cleanup();
    });

    it('retains servers precedence and command transport precedence', async () => {
      mcpClient = new MCPClient({
        enabled: true,
        server: { command: 'ignored' },
        servers: [{ command: 'selected', path: 'ignored.js', url: 'https://ignored.example.test' }],
      });
      await mcpClient.initialize();
      expect(StdioClientTransport).toHaveBeenCalledTimes(1);
      expect(StdioClientTransport).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'selected' }),
      );
      expect(StreamableHTTPClientTransport).not.toHaveBeenCalled();
      await mcpClient.cleanup();
    });

    it('normalizes no-auth and keeps disabled configuration inert', async () => {
      mcpClient = new MCPClient({
        enabled: false,
        server: { url: 'https://mcp.example.test', auth: { type: 'none' } },
      });
      await mcpClient.initialize();
      expect(Client).not.toHaveBeenCalled();
      expect(mockGetOAuthTokenWithExpiry).not.toHaveBeenCalled();
    });

    it('should not initialize if disabled', async () => {
      mcpClient = new MCPClient({ enabled: false });
      await mcpClient.initialize();
      expect(mcpClient.hasInitialized).toBe(false);
    });

    it('should initialize with single server config', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());

      mcpClient = new MCPClient(createMcpServerOptions());

      await mcpClient.initialize();

      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'npm',
        args: ['start'],
        env: process.env as Record<string, string>,
      });
      expect(mockClient.connect).toHaveBeenCalledWith(mockStdioTransport, {
        signal: expect.any(AbortSignal),
      });
      await mcpClient.cleanup();
      expect(mcpClient.hasInitialized).toBe(false);
    });

    it('should initialize a zero-argument command server with its configured env', async () => {
      mcpClient = new MCPClient({
        enabled: true,
        server: { command: 'mcp-server', env: { MCP_MODE: 'test' } },
      });

      await mcpClient.initialize();

      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'mcp-server',
        args: [],
        env: { ...process.env, MCP_MODE: 'test' },
      });
      expect(mcpClient.hasInitialized).toBe(true);
      await mcpClient.cleanup();
    });

    it('keeps unnamed zero-argument command servers distinct', async () => {
      mockClient.listTools
        .mockResolvedValueOnce({
          tools: [{ name: 'first_tool', description: '', inputSchema: {} }],
        })
        .mockResolvedValueOnce({
          tools: [{ name: 'second_tool', description: '', inputSchema: {} }],
        });

      mcpClient = new MCPClient({
        enabled: true,
        servers: [
          { command: 'mcp-server', env: { MCP_MODE: 'first' } },
          { command: 'mcp-server', env: { MCP_MODE: 'second' } },
        ],
      });

      await mcpClient.initialize();

      expect(mcpClient.connectedServers).toHaveLength(2);
      expect(mcpClient.getAllTools().map((tool) => tool.name)).toEqual([
        'first_tool',
        'second_tool',
      ]);
      await mcpClient.cleanup();
      expect(mockClient.close).toHaveBeenCalledTimes(2);
    });

    it('does not overwrite an explicitly named server with a generated command key', async () => {
      mcpClient = new MCPClient({
        enabled: true,
        servers: [{ name: 'mcp-server:1', command: 'mcp-server' }, { command: 'mcp-server' }],
      });

      await mcpClient.initialize();

      expect(mcpClient.connectedServers).toHaveLength(2);
      await mcpClient.cleanup();
      expect(mockClient.close).toHaveBeenCalledTimes(2);
    });

    it('should initialize with per-server env merged into process.env', async () => {
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          name: 'server-with-env',
          command: 'npm',
          args: ['start'],
          env: { CUSTOM_MCP_VAR: 'custom_value' },
        },
      });

      await mcpClient.initialize();

      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'npm',
        args: ['start'],
        env: {
          ...(process.env as Record<string, string>),
          CUSTOM_MCP_VAR: 'custom_value',
        },
      });
      expect(mockClient.connect).toHaveBeenCalledWith(mockStdioTransport, {
        signal: expect.any(AbortSignal),
      });
      await mcpClient.cleanup();
    });

    it('should merge per-server env for path-based stdio servers', async () => {
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());

      mcpClient = new MCPClient({
        enabled: true,
        server: { name: 'scripted', path: 'script.js', env: { CUSTOM_MCP_VAR: 'custom_value' } },
      });

      await mcpClient.initialize();

      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: process.execPath,
        args: ['script.js'],
        env: { ...(process.env as Record<string, string>), CUSTOM_MCP_VAR: 'custom_value' },
      });
      await mcpClient.cleanup();
    });

    it('should let per-server env override an inherited process.env value', async () => {
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      vi.stubEnv('PROMPTFOO_MCP_ENV_FIXTURE', 'inherited');

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          name: 'override',
          command: 'npm',
          args: ['start'],
          env: { PROMPTFOO_MCP_ENV_FIXTURE: 'per-server' },
        },
      });

      await mcpClient.initialize();

      const passedEnv = vi.mocked(StdioClientTransport).mock.calls[0][0].env as Record<
        string,
        string
      >;
      expect(passedEnv.PROMPTFOO_MCP_ENV_FIXTURE).toBe('per-server');
      // The rest of the parent environment is still inherited.
      expect(passedEnv.PATH).toBe(process.env.PATH);
      await mcpClient.cleanup();
      vi.unstubAllEnvs();
    });

    it('should initialize with multiple servers', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue(createSingleToolListResponse());

      mcpClient = new MCPClient(createMultipleServerOptions());

      await mcpClient.initialize();

      expect(StdioClientTransport).toHaveBeenCalledTimes(2);
      expect(mockClient.connect).toHaveBeenCalledTimes(2);
    });

    it('should resolve local server paths relative to the config base path', async () => {
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      cliState.basePath = '/tmp/simple-mcp';

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          path: './example-server.js',
        },
      });

      await mcpClient.initialize();

      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: process.execPath,
        args: [path.resolve(cliState.basePath, './example-server.js')],
        env: process.env as Record<string, string>,
      });
    });

    it('should throw error for unsupported file type', async () => {
      mcpClient = new MCPClient({
        enabled: true,
        server: {
          path: 'script.txt',
        },
      });

      await expect(mcpClient.initialize()).rejects.toThrow(
        'Local server must be a .js or .py file',
      );
    });

    it('should initialize with remote server using StreamableHTTPClientTransport', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());

      mcpClient = new MCPClient(createRemoteServerOptions());

      await mcpClient.initialize();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(expect.any(URL), undefined);
      expect(mockClient.connect).toHaveBeenCalledWith(mockStreamableHTTPTransport, {
        signal: expect.any(AbortSignal),
      });
    });

    it('should initialize with remote server using StreamableHTTPClientTransport with headers', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());

      const customHeaders = createAuthenticatedHeaders();

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          url: 'http://localhost:3000',
          headers: customHeaders,
        },
      });

      await mcpClient.initialize();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          requestInit: expect.objectContaining({
            headers: expect.objectContaining(customHeaders),
          }),
        }),
      );
      expect(mockClient.connect).toHaveBeenCalledWith(mockStreamableHTTPTransport, {
        signal: expect.any(AbortSignal),
      });
    });

    it('should fall back to SSEClientTransport if StreamableHTTPClientTransport fails', async () => {
      // Reset mocks for this test
      mockClient.connect
        .mockImplementationOnce(function () {
          throw new Error('Connection failed');
        })
        .mockResolvedValueOnce(undefined);

      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());

      mcpClient = new MCPClient(createRemoteServerOptions());

      await mcpClient.initialize();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(expect.any(URL), undefined);
      expect(SSEClientTransport).toHaveBeenCalledWith(expect.any(URL), undefined);
      expect(mockClient.connect).toHaveBeenCalledTimes(2);
    });

    it('should fall back to SSEClientTransport with headers if StreamableHTTPClientTransport fails', async () => {
      // Reset mocks for this test
      mockClient.connect
        .mockImplementationOnce(function () {
          throw new Error('Connection failed');
        })
        .mockResolvedValueOnce(undefined);

      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());

      const customHeaders = createAuthenticatedHeaders();

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          url: 'http://localhost:3000',
          headers: customHeaders,
        },
      });

      await mcpClient.initialize();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          requestInit: expect.objectContaining({
            headers: expect.objectContaining(customHeaders),
          }),
        }),
      );
      expect(SSEClientTransport).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          requestInit: expect.objectContaining({
            headers: expect.objectContaining(customHeaders),
          }),
        }),
      );
      expect(mockClient.connect).toHaveBeenCalledTimes(2);
    });

    it('should filter tools according to config.tools', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createTwoToolListResponse());

      mcpClient = new MCPClient({
        enabled: true,
        server: createMcpServerConfig(),
        tools: ['tool2'],
      });

      await mcpClient.initialize();

      // getAllTools should return only tool2
      expect(mcpClient.getAllTools()).toEqual([
        { name: 'tool2', description: 'desc2', inputSchema: {} },
      ]);
    });

    it('should exclude tools according to config.exclude_tools', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createTwoToolListResponse());

      mcpClient = new MCPClient({
        enabled: true,
        server: createMcpServerConfig(),
        exclude_tools: ['tool1'],
      });

      await mcpClient.initialize();

      expect(mcpClient.getAllTools()).toEqual([
        { name: 'tool2', description: 'desc2', inputSchema: {} },
      ]);
    });

    it('should initialize with correct client metadata including name, version, and description', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());

      mcpClient = new MCPClient(createMcpServerOptions());

      await mcpClient.initialize();

      expect(Client).toHaveBeenCalledWith({
        name: 'promptfoo-MCP',
        version: '1.0.0',
        description: 'Promptfoo MCP client for connecting to MCP servers during LLM evaluations',
      });
    });

    it('should provide a descriptive client description for MCP server identification', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [],
      });

      mcpClient = new MCPClient(createMcpServerOptions());

      await mcpClient.initialize();

      // Verify the description is provided and meaningful
      const clientCall = vi.mocked(Client).mock.calls[0][0];
      expect(clientCall).toHaveProperty('description');
      const description = clientCall.description as string;
      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(0);
      // Case-insensitive check for key terms
      expect(description.toLowerCase()).toContain('promptfoo');
      expect(description).toContain('MCP');
    });

    it('should pass timeout to listTools when configured', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());

      mcpClient = new MCPClient({
        enabled: true,
        timeout: 900000, // 15 minutes
        server: createMcpServerConfig(),
      });

      await mcpClient.initialize();

      expect(mockClient.listTools).toHaveBeenCalledWith(undefined, {
        timeout: 900000,
        signal: expect.any(AbortSignal),
      });
    });

    it('should pass timeout options to connect()', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());

      mcpClient = new MCPClient({
        enabled: true,
        timeout: 300000,
        server: createMcpServerConfig(),
      });

      await mcpClient.initialize();

      expect(mockClient.connect).toHaveBeenCalledWith(expect.anything(), {
        timeout: 300000,
        signal: expect.any(AbortSignal),
      });
    });

    it('should ping server when pingOnConnect is true', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.ping.mockResolvedValueOnce({});
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());

      mcpClient = new MCPClient({
        enabled: true,
        pingOnConnect: true,
        server: createMcpServerConfig(),
      });

      await mcpClient.initialize();

      expect(mockClient.ping).toHaveBeenCalled();
    });

    it('should fail initialization if ping fails', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.ping.mockRejectedValueOnce(new Error('Server not responding'));

      mcpClient = new MCPClient({
        enabled: true,
        pingOnConnect: true,
        server: createMcpServerConfig(),
      });

      await expect(mcpClient.initialize()).rejects.toThrow('ping failed');
    });

    it('should pass resetTimeoutOnProgress option', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      mockClient.callTool.mockResolvedValueOnce({ content: 'result' });

      mcpClient = new MCPClient({
        enabled: true,
        timeout: 300000,
        resetTimeoutOnProgress: true,
        server: createMcpServerConfig(),
      });

      await mcpClient.initialize();
      await mcpClient.callTool('tool1', {});

      expect(mockClient.callTool).toHaveBeenCalledWith(
        { name: 'tool1', arguments: {} },
        undefined,
        { timeout: 300000, resetTimeoutOnProgress: true },
      );
    });

    it('should pass maxTotalTimeout option', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      mockClient.callTool.mockResolvedValueOnce({ content: 'result' });

      mcpClient = new MCPClient({
        enabled: true,
        timeout: 300000,
        resetTimeoutOnProgress: true,
        maxTotalTimeout: 900000,
        server: createMcpServerConfig(),
      });

      await mcpClient.initialize();
      await mcpClient.callTool('tool1', {});

      expect(mockClient.callTool).toHaveBeenCalledWith(
        { name: 'tool1', arguments: {} },
        undefined,
        { timeout: 300000, resetTimeoutOnProgress: true, maxTotalTimeout: 900000 },
      );
    });
  });

  describe('callTool', () => {
    it('preserves SDK timeout options and cancels an active request without retrying', async () => {
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'ping', description: 'Health check', inputSchema: {} }],
      });
      let markStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      mockClient.callTool.mockImplementation(
        (_params, _schema, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new Error('transport stopped')), {
              once: true,
            });
            markStarted();
          }),
      );
      mcpClient = new MCPClient({ enabled: true, timeout: 1200, server: { command: 'mock-mcp' } });
      await mcpClient.initialize();
      const abort = new AbortController();
      const reason = new Error('token request cancelled');
      const pending = mcpClient.callTool('ping', {}, abort.signal);
      void pending.catch(() => {});
      try {
        await started;
        expect(mockClient.callTool).toHaveBeenCalledExactlyOnceWith(
          { name: 'ping', arguments: {} },
          undefined,
          { timeout: 1200, signal: abort.signal },
        );
        abort.abort(reason);
        await expect(pending).rejects.toBe(reason);
        expect(mockClient.callTool).toHaveBeenCalledOnce();
        await expect(mcpClient.callTool('ping', {}, abort.signal)).rejects.toBe(reason);
        expect(mockClient.callTool).toHaveBeenCalledOnce();
      } finally {
        abort.abort(reason);
        await Promise.allSettled([pending]);
        await mcpClient.cleanup();
      }
    });

    it('records one tool execution span around an MCP request', async () => {
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      mockClient.callTool.mockResolvedValueOnce({ content: 'result' });

      mcpClient = new MCPClient(createMcpServerOptions());
      await mcpClient.initialize();

      const span = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
        recordException: vi.fn(),
      };
      const startActiveSpan = vi.fn((_name, _options, callback) => callback(span));
      const activeSpanSpy = vi.spyOn(trace, 'getActiveSpan').mockReturnValue(span as any);
      const tracerSpy = vi.spyOn(trace, 'getTracer').mockReturnValue({ startActiveSpan } as any);

      try {
        const args = { query: 'inventory', session: 'opaque-session', nested: { apiKey: 'short' } };
        expect(await mcpClient.callTool('tool1', args)).toEqual({
          content: 'result',
          raw: { content: 'result' },
        });
        expect(mockClient.callTool).toHaveBeenCalledWith(
          { name: 'tool1', arguments: args },
          undefined,
          undefined,
        );

        expect(startActiveSpan).toHaveBeenCalledExactlyOnceWith(
          'execute_tool tool1',
          expect.objectContaining({
            attributes: expect.objectContaining({
              'gen_ai.operation.name': 'execute_tool',
              'gen_ai.tool.name': 'tool1',
              'tool.arguments':
                '{"query":"inventory","session":"[REDACTED]","nested":{"apiKey":"[REDACTED]"}}',
            }),
          }),
          expect.any(Function),
        );
        expect(span.setAttribute).toHaveBeenCalledWith('tool.output', 'result');
      } finally {
        activeSpanSpy.mockRestore();
        tracerSpy.mockRestore();
      }
    });

    it('marks caught MCP transport failures as tool execution errors', async () => {
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      mockClient.callTool.mockRejectedValueOnce(new Error('MCP transport disconnected'));

      mcpClient = new MCPClient(createMcpServerOptions());
      await mcpClient.initialize();

      const span = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
        recordException: vi.fn(),
      };
      const startActiveSpan = vi.fn((_name, _options, callback) => callback(span));
      const activeSpanSpy = vi.spyOn(trace, 'getActiveSpan').mockReturnValue(span as any);
      const tracerSpy = vi.spyOn(trace, 'getTracer').mockReturnValue({ startActiveSpan } as any);

      try {
        expect(await mcpClient.callTool('tool1', {})).toEqual({
          content: '',
          error: 'MCP transport disconnected',
        });
        expect(span.setAttribute).toHaveBeenCalledWith('tool.is_error', true);
        expect(span.setAttribute).toHaveBeenCalledWith('error.type', 'tool_error');
        expect(span.setStatus).toHaveBeenCalledWith({
          code: SpanStatusCode.ERROR,
          message: 'MCP transport disconnected',
        });
        expect(span.end).toHaveBeenCalledOnce();
      } finally {
        activeSpanSpy.mockRestore();
        tracerSpy.mockRestore();
      }
    });

    it('should call tool successfully', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      mockClient.callTool.mockResolvedValueOnce({ content: 'result' });

      mcpClient = new MCPClient(createMcpServerOptions());

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', { arg: 'value' });

      expect(result).toEqual({ content: 'result', raw: { content: 'result' } });
      expect(mockClient.callTool).toHaveBeenCalledWith(
        {
          name: 'tool1',
          arguments: { arg: 'value' },
        },
        undefined,
        undefined,
      );
    });

    it('should pass timeout option when configured', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      mockClient.callTool.mockResolvedValueOnce({ content: 'result' });

      mcpClient = new MCPClient({
        enabled: true,
        timeout: 900000, // 15 minutes
        server: createMcpServerConfig(),
      });

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', { arg: 'value' });

      expect(result).toEqual({ content: 'result', raw: { content: 'result' } });
      expect(mockClient.callTool).toHaveBeenCalledWith(
        {
          name: 'tool1',
          arguments: { arg: 'value' },
        },
        undefined,
        { timeout: 900000 },
      );
    });

    it('should use MCP_REQUEST_TIMEOUT_MS env var as fallback when no config timeout', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      mockClient.callTool.mockResolvedValueOnce({ content: 'result' });

      // Mock env var to return a timeout value
      mockGetEnvInt.mockReturnValue(600000); // 10 minutes

      mcpClient = new MCPClient({
        enabled: true,
        // No timeout in config
        server: createMcpServerConfig(),
      });

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', { arg: 'value' });

      expect(result).toEqual({ content: 'result', raw: { content: 'result' } });
      expect(mockClient.callTool).toHaveBeenCalledWith(
        {
          name: 'tool1',
          arguments: { arg: 'value' },
        },
        undefined,
        { timeout: 600000 },
      );

      // Reset mock
      mockGetEnvInt.mockReturnValue(undefined);
    });

    it('should prefer config timeout over env var', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      mockClient.callTool.mockResolvedValueOnce({ content: 'result' });

      // Mock env var to return a different timeout value
      mockGetEnvInt.mockReturnValue(600000); // 10 minutes

      mcpClient = new MCPClient({
        enabled: true,
        timeout: 900000, // 15 minutes - should take precedence
        server: createMcpServerConfig(),
      });

      await mcpClient.initialize();
      await mcpClient.callTool('tool1', { arg: 'value' });

      expect(mockClient.callTool).toHaveBeenCalledWith(
        {
          name: 'tool1',
          arguments: { arg: 'value' },
        },
        undefined,
        { timeout: 900000 }, // Config timeout takes precedence
      );

      // Reset mock
      mockGetEnvInt.mockReturnValue(undefined);
    });

    it('should handle tool error', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      mockClient.callTool.mockRejectedValueOnce(new Error('Tool error'));

      mcpClient = new MCPClient({
        enabled: true,
        server: createMcpServerConfig(),
        debug: true,
      });

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', {});

      expect(result).toEqual({
        content: '',
        error: 'Tool error',
      });
    });

    it('should surface MCP tool error results', async () => {
      // Reset mocks for this test
      const errorContent = [{ type: 'text', text: 'Invalid arguments' }];
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      mockClient.callTool.mockResolvedValueOnce({
        content: errorContent,
        isError: true,
      });

      mcpClient = new MCPClient(createMcpServerOptions());

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', {});

      expect(result).toEqual({
        content: JSON.stringify(errorContent),
        isError: true,
        raw: {
          content: errorContent,
          isError: true,
        },
      });
    });

    it('should throw error for unknown tool', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());

      mcpClient = new MCPClient(createMcpServerOptions());

      await mcpClient.initialize();
      await expect(mcpClient.callTool('unknown', {})).rejects.toThrow('Tool unknown not found');
    });

    it('should support tool content as Buffer', async () => {
      // Reset mocks for this test
      const contentBuffer = Buffer.from('buffered-result');
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      mockClient.callTool.mockResolvedValueOnce({ content: contentBuffer });

      mcpClient = new MCPClient(createMcpServerOptions());

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', {});

      expect(result).toEqual({ content: 'buffered-result', raw: { content: contentBuffer } });
    });

    it('should return empty string if result content is falsy', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      mockClient.callTool.mockResolvedValueOnce({});

      mcpClient = new MCPClient(createMcpServerOptions());

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', {});

      expect(result).toEqual({ content: '', raw: {} });
    });

    it('should parse JSON-stringified content correctly', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      mockClient.callTool.mockResolvedValueOnce({ content: '"Hello World"' });

      mcpClient = new MCPClient(createMcpServerOptions());

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', {});

      expect(result).toEqual({ content: 'Hello World', raw: { content: '"Hello World"' } });
    });

    it('should handle non-JSON string content correctly', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      mockClient.callTool.mockResolvedValueOnce({ content: 'Plain text response' });

      mcpClient = new MCPClient(createMcpServerOptions());

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', {});

      expect(result).toEqual({
        content: 'Plain text response',
        raw: { content: 'Plain text response' },
      });
    });
  });

  describe('cleanup', () => {
    it('should cleanup all clients', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());

      mcpClient = new MCPClient(createMcpServerOptions());

      await mcpClient.initialize();
      await mcpClient.cleanup();

      expect(mockClient.close).toHaveBeenCalledWith();
    });

    it('should handle cleanup errors', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce(createSingleToolListResponse());
      mockClient.close.mockRejectedValueOnce(new Error('Cleanup error'));

      mcpClient = new MCPClient({
        enabled: true,
        server: { command: 'npm', args: ['start'] },
        debug: true,
      });

      await mcpClient.initialize();
      await mcpClient.cleanup();

      expect(mockClient.close).toHaveBeenCalledWith();
    });
  });

  describe('getAllTools', () => {
    it('should return all tools from all servers', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue(createTwoToolListResponse());

      mcpClient = new MCPClient(createMultipleServerOptions());
      await mcpClient.initialize();
      const allTools = mcpClient.getAllTools();
      expect(Array.isArray(allTools)).toBe(true);
      expect(allTools.length).toBeGreaterThan(0);
    });

    it('should return empty array if no tools', () => {
      mcpClient = new MCPClient({ enabled: true });
      // force tools to be empty
      expect(mcpClient.getAllTools()).toEqual([]);
    });
  });

  describe('OAuth authentication', () => {
    const oauthServer = {
      url: 'http://localhost:3000',
      headers: { 'X-Custom-Header': 'custom-value' },
      auth: {
        type: 'oauth' as const,
        grantType: 'client_credentials' as const,
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenUrl: 'https://auth.example.com/token',
      },
    };

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

    function stubFetch(...statuses: number[]) {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      for (const code of statuses) {
        fetchSpy.mockResolvedValueOnce(new Response('body', { status: code }));
      }
      return fetchSpy;
    }

    const sentAuthorization = (fetchSpy: ReturnType<typeof stubFetch>) =>
      fetchSpy.mock.calls.map(([, init]) => new Headers(init?.headers).get('Authorization'));

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each(['client_credentials', 'password'] as const)(
      'fetches a %s token at connect and sends it per request, not as a static header',
      async (grantType) => {
        const auth =
          grantType === 'password'
            ? {
                type: 'oauth' as const,
                grantType,
                tokenUrl: 'https://auth.example.com/token',
                username: 'u',
                password: 'p',
              }
            : oauthServer.auth;
        mcpClient = new MCPClient({ enabled: true, server: { ...oauthServer, auth } });
        await mcpClient.initialize();

        expect(mockGetOAuthTokenWithExpiry).toHaveBeenCalledWith(
          auth,
          oauthServer.url,
          undefined,
          expect.any(AbortSignal),
        );
        const options = vi.mocked(StreamableHTTPClientTransport).mock.calls[0][1];
        expect(options?.requestInit?.headers).not.toHaveProperty('Authorization');
        expect(options).not.toHaveProperty('authProvider');
      },
    );

    it('uses the current token for every request and keeps request headers', async () => {
      const oauthFetch = await initializeOAuthFetch();
      mockGetOAuthTokenWithExpiry
        .mockResolvedValueOnce({ accessToken: 'token-a', expiresAt: Date.now() + 3_600_000 })
        .mockResolvedValueOnce({ accessToken: 'token-b', expiresAt: Date.now() + 3_600_000 });
      const fetchSpy = stubFetch(200, 200);

      for (let i = 0; i < 2; i++) {
        await oauthFetch('http://localhost:3000/', {
          method: 'POST',
          headers: { 'X-Custom-Header': 'custom-value', Authorization: 'Bearer stale' },
          body: '{}',
        });
      }

      expect(sentAuthorization(fetchSpy)).toEqual(['Bearer token-a', 'Bearer token-b']);
      expect(new Headers(fetchSpy.mock.calls[0][1]?.headers).get('X-Custom-Header')).toBe(
        'custom-value',
      );
      expect(Client).toHaveBeenCalledTimes(1);
    });

    it('resends a request rejected with 401 once, replacing only the rejected token', async () => {
      const oauthFetch = await initializeOAuthFetch();
      mockGetOAuthTokenWithExpiry
        .mockResolvedValueOnce({ accessToken: 'revoked', expiresAt: Date.now() + 3_600_000 })
        .mockResolvedValueOnce({ accessToken: 'replacement', expiresAt: Date.now() + 3_600_000 });
      const fetchSpy = stubFetch(401, 200);

      const response = await oauthFetch('http://localhost:3000/', {
        method: 'POST',
        body: '{"id":1}',
      });

      expect(response.status).toBe(200);
      expect(sentAuthorization(fetchSpy)).toEqual(['Bearer revoked', 'Bearer replacement']);
      expect(fetchSpy.mock.calls.map(([, init]) => init?.body)).toEqual(['{"id":1}', '{"id":1}']);
      expect(mockGetOAuthTokenWithExpiry).toHaveBeenLastCalledWith(
        oauthServer.auth,
        oauthServer.url,
        'revoked',
        undefined,
      );
    });

    it.each(['caller cancellation', 'SDK timeout'])(
      'does not dispatch after %s while the token refresh is pending',
      async (mode) => {
        const oauthFetch = await initializeOAuthFetch();
        let releaseToken!: (value: { accessToken: string; expiresAt: number }) => void;
        mockGetOAuthTokenWithExpiry.mockReturnValueOnce(
          new Promise((resolve) => {
            releaseToken = resolve;
          }),
        );
        const fetchSpy = stubFetch(200);
        const transportSignal = new AbortController();
        const caller = new AbortController();
        let rejectSdk!: (reason: Error) => void;
        let request!: Promise<Response>;
        mockClient.callTool.mockImplementationOnce(() => {
          request = oauthFetch('http://localhost:3000/', {
            method: 'POST',
            body: '{"method":"tools/call"}',
            signal: transportSignal.signal,
          });
          void request.catch(() => {});
          return new Promise((_resolve, reject) => {
            rejectSdk = reject;
          });
        });
        const reason = new Error(mode);
        const call = mcpClient!.callTool('tool1', {}, caller.signal);
        void call.catch(() => {});
        await vi.waitFor(() => expect(releaseToken).toBeDefined());
        if (mode === 'caller cancellation') {
          caller.abort(reason);
        }
        rejectSdk(reason);
        if (mode === 'caller cancellation') {
          await expect(call).rejects.toBe(reason);
        } else {
          expect(await call).toMatchObject({ error: mode });
        }
        releaseToken({ accessToken: 'fresh', expiresAt: Date.now() + 30_000 });
        await expect(request).rejects.toThrow();
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(transportSignal.signal.aborted).toBe(false);
        // Other requests sharing the connection remain usable.
        await oauthFetch('http://localhost:3000/', { method: 'POST', body: '{}' });
        expect(fetchSpy).toHaveBeenCalledOnce();
      },
    );

    it.each([
      [[401, 401], 401, 2],
      [[403], 403, 1],
      [[500], 500, 1],
    ])(
      'resends only a 401, once: %j ends as %i after %i request(s)',
      async (statuses, final, count) => {
        const oauthFetch = await initializeOAuthFetch();
        const fetchSpy = stubFetch(...statuses);

        const response = await oauthFetch('http://localhost:3000/', { method: 'POST', body: '{}' });

        expect(response.status).toBe(final);
        expect(fetchSpy).toHaveBeenCalledTimes(count);
      },
    );

    it('gives the SSE fallback transport the same OAuth fetch', async () => {
      mockClient.connect
        .mockImplementationOnce(function () {
          throw new Error('Connection failed');
        })
        .mockResolvedValueOnce(undefined);
      mcpClient = new MCPClient({ enabled: true, server: oauthServer });
      await mcpClient.initialize();

      const streamableFetch = vi.mocked(StreamableHTTPClientTransport).mock.calls[0][1]?.fetch;
      expect(streamableFetch).toEqual(expect.any(Function));
      expect(vi.mocked(SSEClientTransport).mock.calls[0][1]?.fetch).toBe(streamableFetch);
    });

    it('returns tool failures without reconnecting or retrying the call', async () => {
      mockClient.callTool.mockRejectedValue(new Error('token argument is required'));
      mcpClient = new MCPClient({ enabled: true, server: oauthServer });
      await mcpClient.initialize();

      await expect(mcpClient.callTool('tool1', {})).resolves.toEqual({
        content: '',
        error: 'token argument is required',
      });
      expect(mockClient.callTool).toHaveBeenCalledTimes(1);
      expect(mockClient.close).not.toHaveBeenCalled();
      expect(mockGetOAuthTokenWithExpiry).toHaveBeenCalledTimes(1);
    });

    it('should NOT use authProvider for bearer auth type', async () => {
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          url: 'http://localhost:3000',
          auth: {
            type: 'bearer',
            token: 'static-token',
          },
        },
      });

      await mcpClient.initialize();

      // Should have headers but NOT authProvider
      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          requestInit: expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer static-token',
            }),
          }),
        }),
      );
      // Verify authProvider is not in the options
      const callArgs = vi.mocked(StreamableHTTPClientTransport).mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty('authProvider');
    });

    it('should NOT use authProvider for basic auth type', async () => {
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          url: 'http://localhost:3000',
          auth: {
            type: 'basic',
            username: 'user',
            password: 'pass',
          },
        },
      });

      await mcpClient.initialize();

      // Should have headers but NOT authProvider
      const expectedAuth = 'Basic ' + Buffer.from('user:pass').toString('base64');
      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          requestInit: expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: expectedAuth,
            }),
          }),
        }),
      );
      // Verify authProvider is not in the options
      const callArgs = vi.mocked(StreamableHTTPClientTransport).mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty('authProvider');
    });
  });
});
