import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetEnvInt = vi.hoisted(() => vi.fn().mockReturnValue(undefined));
vi.mock('../../../src/envars', async () => ({
  ...(await vi.importActual<typeof import('../../../src/envars')>('../../../src/envars')),
  getEnvInt: (...args: unknown[]) => mockGetEnvInt(...args),
}));

const mcpMocks = vi.hoisted(() => {
  const mockClient = {
    _clientInfo: {},
    _capabilities: {},
    registerCapabilities: vi.fn(),
    assertCapability: vi.fn(),
    connect: vi.fn(),
    ping: vi.fn().mockResolvedValue({}),
    listTools: vi.fn().mockResolvedValue({
      tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
    }),
    callTool: vi.fn(),
    close: vi.fn(),
  };

  const mockStdioTransport = {
    close: vi.fn(),
    connect: vi.fn(),
    start: vi.fn(),
    send: vi.fn(),
  };

  const mockStreamableHTTPTransport = {
    close: vi.fn(),
    connect: vi.fn(),
    start: vi.fn(),
    send: vi.fn(),
  };

  const mockSSETransport = {
    close: vi.fn(),
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

const { mockClient, mockStdioTransport, mockStreamableHTTPTransport } = mcpMocks;

// Mock the modules before importing them
vi.mock('@modelcontextprotocol/sdk/client/index.js', async importOriginal => {
  return ({
    ...(await importOriginal()),
    Client: mcpMocks.MockClient
  });
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', async importOriginal => {
  return ({
    ...(await importOriginal()),
    StdioClientTransport: mcpMocks.MockStdioTransport
  });
});

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', async importOriginal => {
  return ({
    ...(await importOriginal()),
    StreamableHTTPClientTransport: mcpMocks.MockStreamableHTTPTransport
  });
});

vi.mock('@modelcontextprotocol/sdk/client/sse.js', async importOriginal => {
  return ({
    ...(await importOriginal()),
    SSEClientTransport: mcpMocks.MockSSETransport
  });
});

// Import the mocked modules after mocking
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCPClient } from '../../../src/providers/mcp/client';

describe('MCPClient', () => {
  let mcpClient: MCPClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should not initialize if disabled', async () => {
      mcpClient = new MCPClient({ enabled: false });
      await mcpClient.initialize();
      expect(mcpClient.hasInitialized).toBe(false);
    });

    it('should initialize with single server config', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          command: 'npm',
          args: ['start'],
        },
      });

      await mcpClient.initialize();

      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: 'npm',
        args: ['start'],
        env: process.env as Record<string, string>,
      });
      expect(mockClient.connect).toHaveBeenCalledWith(mockStdioTransport, undefined);
      await mcpClient.cleanup();
      expect(mcpClient.hasInitialized).toBe(false);
    });

    it('should initialize with multiple servers', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.listTools.mockResolvedValue({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });

      mcpClient = new MCPClient({
        enabled: true,
        servers: [
          {
            name: 'server1',
            command: 'npm',
            args: ['start'],
          },
          {
            name: 'server2',
            path: 'script.js',
          },
        ],
      });

      await mcpClient.initialize();

      expect(StdioClientTransport).toHaveBeenCalledTimes(2);
      expect(mockClient.connect).toHaveBeenCalledTimes(2);
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
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          url: 'http://localhost:3000',
        },
      });

      await mcpClient.initialize();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(expect.any(URL), undefined);
      expect(mockClient.connect).toHaveBeenCalledWith(mockStreamableHTTPTransport, undefined);
    });

    it('should initialize with remote server using StreamableHTTPClientTransport with headers', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });

      const customHeaders = {
        'X-Custom-Header': 'custom-value',
        Authorization: 'Bearer test-token',
      };

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
      expect(mockClient.connect).toHaveBeenCalledWith(mockStreamableHTTPTransport, undefined);
    });

    it('should fall back to SSEClientTransport if StreamableHTTPClientTransport fails', async () => {
      // Reset mocks for this test
      mockClient.connect
        .mockImplementationOnce(function() {
          throw new Error('Connection failed');
        })
        .mockResolvedValueOnce(undefined);

      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          url: 'http://localhost:3000',
        },
      });

      await mcpClient.initialize();

      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(expect.any(URL), undefined);
      expect(SSEClientTransport).toHaveBeenCalledWith(expect.any(URL), undefined);
      expect(mockClient.connect).toHaveBeenCalledTimes(2);
    });

    it('should fall back to SSEClientTransport with headers if StreamableHTTPClientTransport fails', async () => {
      // Reset mocks for this test
      mockClient.connect
        .mockImplementationOnce(function() {
          throw new Error('Connection failed');
        })
        .mockResolvedValueOnce(undefined);

      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });

      const customHeaders = {
        'X-Custom-Header': 'custom-value',
        Authorization: 'Bearer test-token',
      };

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
      mockClient.listTools.mockResolvedValueOnce({
        tools: [
          { name: 'tool1', description: 'desc1', inputSchema: {} },
          { name: 'tool2', description: 'desc2', inputSchema: {} },
        ],
      });

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          command: 'npm',
          args: ['start'],
        },
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
      mockClient.listTools.mockResolvedValueOnce({
        tools: [
          { name: 'tool1', description: 'desc1', inputSchema: {} },
          { name: 'tool2', description: 'desc2', inputSchema: {} },
        ],
      });

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          command: 'npm',
          args: ['start'],
        },
        exclude_tools: ['tool1'],
      });

      await mcpClient.initialize();

      expect(mcpClient.getAllTools()).toEqual([
        { name: 'tool2', description: 'desc2', inputSchema: {} },
      ]);
    });

    it('should initialize with correct client name', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          command: 'npm',
          args: ['start'],
        },
      });

      await mcpClient.initialize();

      expect(Client).toHaveBeenCalledWith({ name: 'promptfoo-MCP', version: '1.0.0' });
    });

    it('should pass timeout to listTools when configured', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });

      mcpClient = new MCPClient({
        enabled: true,
        timeout: 900000, // 15 minutes
        server: {
          command: 'npm',
          args: ['start'],
        },
      });

      await mcpClient.initialize();

      expect(mockClient.listTools).toHaveBeenCalledWith(undefined, { timeout: 900000 });
    });

    it('should pass timeout options to connect()', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });

      mcpClient = new MCPClient({
        enabled: true,
        timeout: 300000,
        server: {
          command: 'npm',
          args: ['start'],
        },
      });

      await mcpClient.initialize();

      expect(mockClient.connect).toHaveBeenCalledWith(expect.anything(), { timeout: 300000 });
    });

    it('should ping server when pingOnConnect is true', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.ping.mockResolvedValueOnce({});
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });

      mcpClient = new MCPClient({
        enabled: true,
        pingOnConnect: true,
        server: {
          command: 'npm',
          args: ['start'],
        },
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
        server: {
          command: 'npm',
          args: ['start'],
        },
      });

      await expect(mcpClient.initialize()).rejects.toThrow('ping failed');
    });

    it('should pass resetTimeoutOnProgress option', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });
      mockClient.callTool.mockResolvedValueOnce({ content: 'result' });

      mcpClient = new MCPClient({
        enabled: true,
        timeout: 300000,
        resetTimeoutOnProgress: true,
        server: {
          command: 'npm',
          args: ['start'],
        },
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
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });
      mockClient.callTool.mockResolvedValueOnce({ content: 'result' });

      mcpClient = new MCPClient({
        enabled: true,
        timeout: 300000,
        resetTimeoutOnProgress: true,
        maxTotalTimeout: 900000,
        server: {
          command: 'npm',
          args: ['start'],
        },
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
    it('should call tool successfully', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });
      mockClient.callTool.mockResolvedValueOnce({ content: 'result' });

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          command: 'npm',
          args: ['start'],
        },
      });

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', { arg: 'value' });

      expect(result).toEqual({ content: 'result' });
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
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });
      mockClient.callTool.mockResolvedValueOnce({ content: 'result' });

      mcpClient = new MCPClient({
        enabled: true,
        timeout: 900000, // 15 minutes
        server: {
          command: 'npm',
          args: ['start'],
        },
      });

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', { arg: 'value' });

      expect(result).toEqual({ content: 'result' });
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
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });
      mockClient.callTool.mockResolvedValueOnce({ content: 'result' });

      // Mock env var to return a timeout value
      mockGetEnvInt.mockReturnValue(600000); // 10 minutes

      mcpClient = new MCPClient({
        enabled: true,
        // No timeout in config
        server: {
          command: 'npm',
          args: ['start'],
        },
      });

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', { arg: 'value' });

      expect(result).toEqual({ content: 'result' });
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
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });
      mockClient.callTool.mockResolvedValueOnce({ content: 'result' });

      // Mock env var to return a different timeout value
      mockGetEnvInt.mockReturnValue(600000); // 10 minutes

      mcpClient = new MCPClient({
        enabled: true,
        timeout: 900000, // 15 minutes - should take precedence
        server: {
          command: 'npm',
          args: ['start'],
        },
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
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });
      mockClient.callTool.mockRejectedValueOnce(new Error('Tool error'));

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          command: 'npm',
          args: ['start'],
        },
        debug: true,
      });

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', {});

      expect(result).toEqual({
        content: '',
        error: 'Tool error',
      });
    });

    it('should throw error for unknown tool', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          command: 'npm',
          args: ['start'],
        },
      });

      await mcpClient.initialize();
      await expect(mcpClient.callTool('unknown', {})).rejects.toThrow('Tool unknown not found');
    });

    it('should support tool content as Buffer', async () => {
      // Reset mocks for this test
      const contentBuffer = Buffer.from('buffered-result');
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });
      mockClient.callTool.mockResolvedValueOnce({ content: contentBuffer });

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          command: 'npm',
          args: ['start'],
        },
      });

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', {});

      expect(result).toEqual({ content: 'buffered-result' });
    });

    it('should return empty string if result content is falsy', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });
      mockClient.callTool.mockResolvedValueOnce({});

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          command: 'npm',
          args: ['start'],
        },
      });

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', {});

      expect(result).toEqual({ content: '' });
    });

    it('should parse JSON-stringified content correctly', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });
      mockClient.callTool.mockResolvedValueOnce({ content: '"Hello World"' });

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          command: 'npm',
          args: ['start'],
        },
      });

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', {});

      expect(result).toEqual({ content: 'Hello World' });
    });

    it('should handle non-JSON string content correctly', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });
      mockClient.callTool.mockResolvedValueOnce({ content: 'Plain text response' });

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          command: 'npm',
          args: ['start'],
        },
      });

      await mcpClient.initialize();
      const result = await mcpClient.callTool('tool1', {});

      expect(result).toEqual({ content: 'Plain text response' });
    });
  });

  describe('cleanup', () => {
    it('should cleanup all clients', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });

      mcpClient = new MCPClient({
        enabled: true,
        server: {
          command: 'npm',
          args: ['start'],
        },
      });

      await mcpClient.initialize();
      await mcpClient.cleanup();

      expect(mockClient.close).toHaveBeenCalledWith();
    });

    it('should handle cleanup errors', async () => {
      // Reset mocks for this test
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient.listTools.mockResolvedValueOnce({
        tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
      });
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
      mockClient.listTools.mockResolvedValue({
        tools: [
          { name: 'tool1', description: 'desc1', inputSchema: {} },
          { name: 'tool2', description: 'desc2', inputSchema: {} },
        ],
      });

      mcpClient = new MCPClient({
        enabled: true,
        servers: [
          {
            name: 'server1',
            command: 'npm',
            args: ['start'],
          },
          {
            name: 'server2',
            path: 'script.js',
          },
        ],
      });
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
});
