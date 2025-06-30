// Import the mocked modules after mocking
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCPClient } from '../../../src/providers/mcp/client';

// Create mock implementations for the imported modules
const mockClient = {
  _clientInfo: {},
  _capabilities: {},
  registerCapabilities: jest.fn(),
  assertCapability: jest.fn(),
  connect: jest.fn(),
  listTools: jest.fn().mockResolvedValue({
    tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
  }),
  callTool: jest.fn(),
  close: jest.fn(),
};

const mockStdioTransport = {
  close: jest.fn(),
  connect: jest.fn(),
  start: jest.fn(),
  send: jest.fn(),
};

const mockStreamableHTTPTransport = {
  close: jest.fn(),
  connect: jest.fn(),
  start: jest.fn(),
  send: jest.fn(),
};

const mockSSETransport = {
  close: jest.fn(),
  connect: jest.fn(),
  start: jest.fn(),
  send: jest.fn(),
};

// Mock the modules before importing them
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => mockClient),
}));

jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: jest.fn().mockImplementation(() => mockStdioTransport),
}));

jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: jest.fn().mockImplementation(() => mockStreamableHTTPTransport),
}));

jest.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: jest.fn().mockImplementation(() => mockSSETransport),
}));

describe('MCPClient', () => {
  let mcpClient: MCPClient;

  beforeEach(() => {
    jest.clearAllMocks();
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
      });
      expect(mockClient.connect).toHaveBeenCalledWith(mockStdioTransport);
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
      expect(mockClient.connect).toHaveBeenCalledWith(mockStreamableHTTPTransport);
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
      expect(mockClient.connect).toHaveBeenCalledWith(mockStreamableHTTPTransport);
    });

    it('should fall back to SSEClientTransport if StreamableHTTPClientTransport fails', async () => {
      // Reset mocks for this test
      mockClient.connect
        .mockImplementationOnce(() => {
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
        .mockImplementationOnce(() => {
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
      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'tool1',
        arguments: { arg: 'value' },
      });
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

  describe('getAuthHeaders', () => {
    it('should return bearer auth header', () => {
      const client = new MCPClient({ enabled: true });
      const server = {
        auth: { type: 'bearer', token: 'abc123' },
      };
      // @ts-expect-error accessing private method for testing
      expect(client['getAuthHeaders'](server)).toEqual({
        Authorization: 'Bearer abc123',
      });
    });

    it('should return api_key auth header', () => {
      const client = new MCPClient({ enabled: true });
      const server = {
        auth: { type: 'api_key', api_key: 'xyz789' },
      };
      // @ts-expect-error accessing private method for testing
      expect(client['getAuthHeaders'](server)).toEqual({
        'X-API-Key': 'xyz789',
      });
    });

    it('should return empty object if no auth', () => {
      const client = new MCPClient({ enabled: true });
      const server = {};
      expect(client['getAuthHeaders'](server)).toEqual({});
    });

    it('should return empty object for incomplete auth', () => {
      const client = new MCPClient({ enabled: true });
      const server = { auth: { type: 'bearer' } };
      // @ts-expect-error accessing private method for testing
      expect(client['getAuthHeaders'](server)).toEqual({});
    });
  });
});
