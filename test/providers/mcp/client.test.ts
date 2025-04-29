import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPClient } from '../../../src/providers/mcp/client';

jest.mock('@modelcontextprotocol/sdk/client/index.js');
jest.mock('@modelcontextprotocol/sdk/client/stdio.js');

describe('MCPClient', () => {
  let mcpClient: MCPClient;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('initialize', () => {
    it('should not initialize if disabled', async () => {
      mcpClient = new MCPClient({ enabled: false });
      await mcpClient.initialize();
      expect(Client).not.toHaveBeenCalled();
    });

    it('should initialize with single server config', async () => {
      const mockClient = {
        _clientInfo: {},
        _capabilities: {},
        registerCapabilities: jest.fn(),
        assertCapability: jest.fn(),
        connect: jest.fn(),
        listTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
        }),
        close: jest.fn(),
      };
      jest.mocked(Client).mockImplementation(() => mockClient as any);

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
      expect(mockClient.connect).toHaveBeenCalledWith(expect.any(StdioClientTransport));
    });

    it('should initialize with multiple servers', async () => {
      const mockClient = {
        _clientInfo: {},
        _capabilities: {},
        registerCapabilities: jest.fn(),
        assertCapability: jest.fn(),
        connect: jest.fn(),
        listTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
        }),
        close: jest.fn(),
      };
      jest.mocked(Client).mockImplementation(() => mockClient as any);

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

    it('should throw error for remote server', async () => {
      mcpClient = new MCPClient({
        enabled: true,
        server: {
          url: 'http://localhost:3000',
        },
      });

      await expect(mcpClient.initialize()).rejects.toThrow('Remote MCP servers are not supported');
    });

    it('should filter tools according to config.tools', async () => {
      const mockClient = {
        _clientInfo: {},
        _capabilities: {},
        registerCapabilities: jest.fn(),
        assertCapability: jest.fn(),
        connect: jest.fn(),
        listTools: jest.fn().mockResolvedValue({
          tools: [
            { name: 'tool1', description: 'desc1', inputSchema: {} },
            { name: 'tool2', description: 'desc2', inputSchema: {} },
          ],
        }),
        close: jest.fn(),
      };
      jest.mocked(Client).mockImplementation(() => mockClient as any);

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
      const mockClient = {
        _clientInfo: {},
        _capabilities: {},
        registerCapabilities: jest.fn(),
        assertCapability: jest.fn(),
        connect: jest.fn(),
        listTools: jest.fn().mockResolvedValue({
          tools: [
            { name: 'tool1', description: 'desc1', inputSchema: {} },
            { name: 'tool2', description: 'desc2', inputSchema: {} },
          ],
        }),
        close: jest.fn(),
      };
      jest.mocked(Client).mockImplementation(() => mockClient as any);

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
  });

  describe('callTool', () => {
    it('should call tool successfully', async () => {
      const mockClient = {
        _clientInfo: {},
        _capabilities: {},
        registerCapabilities: jest.fn(),
        assertCapability: jest.fn(),
        connect: jest.fn(),
        listTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
        }),
        callTool: jest.fn().mockResolvedValue({ content: 'result' }),
        close: jest.fn(),
      };
      jest.mocked(Client).mockImplementation(() => mockClient as any);

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
      const mockClient = {
        _clientInfo: {},
        _capabilities: {},
        registerCapabilities: jest.fn(),
        assertCapability: jest.fn(),
        connect: jest.fn(),
        listTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
        }),
        callTool: jest.fn().mockRejectedValue(new Error('Tool error')),
        close: jest.fn(),
      };
      jest.mocked(Client).mockImplementation(() => mockClient as any);

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
      const mockClient = {
        _clientInfo: {},
        _capabilities: {},
        registerCapabilities: jest.fn(),
        assertCapability: jest.fn(),
        connect: jest.fn(),
        listTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
        }),
        close: jest.fn(),
      };
      jest.mocked(Client).mockImplementation(() => mockClient as any);

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
      const contentBuffer = Buffer.from('buffered-result');
      const mockClient = {
        _clientInfo: {},
        _capabilities: {},
        registerCapabilities: jest.fn(),
        assertCapability: jest.fn(),
        connect: jest.fn(),
        listTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
        }),
        callTool: jest.fn().mockResolvedValue({ content: contentBuffer }),
        close: jest.fn(),
      };
      jest.mocked(Client).mockImplementation(() => mockClient as any);

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
      const mockClient = {
        _clientInfo: {},
        _capabilities: {},
        registerCapabilities: jest.fn(),
        assertCapability: jest.fn(),
        connect: jest.fn(),
        listTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
        }),
        callTool: jest.fn().mockResolvedValue({}),
        close: jest.fn(),
      };
      jest.mocked(Client).mockImplementation(() => mockClient as any);

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
      const mockClient = {
        _clientInfo: {},
        _capabilities: {},
        registerCapabilities: jest.fn(),
        assertCapability: jest.fn(),
        connect: jest.fn(),
        listTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
        }),
        close: jest.fn(),
      };
      jest.mocked(Client).mockImplementation(() => mockClient as any);

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
      const mockClient = {
        _clientInfo: {},
        _capabilities: {},
        registerCapabilities: jest.fn(),
        assertCapability: jest.fn(),
        connect: jest.fn(),
        listTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
        }),
        close: jest.fn().mockRejectedValue(new Error('Cleanup error')),
      };
      jest.mocked(Client).mockImplementation(() => mockClient as any);

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
      const mockClient = {
        _clientInfo: {},
        _capabilities: {},
        registerCapabilities: jest.fn(),
        assertCapability: jest.fn(),
        connect: jest.fn(),
        listTools: jest.fn().mockResolvedValue({
          tools: [
            { name: 'tool1', description: 'desc1', inputSchema: {} },
            { name: 'tool2', description: 'desc2', inputSchema: {} },
          ],
        }),
        close: jest.fn(),
      };
      jest.mocked(Client).mockImplementation(() => mockClient as any);
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
      // @ts-expect-private: access for test

      const client: any = new MCPClient({ enabled: true });
      const server = {
        auth: { type: 'bearer', token: 'abc123' },
      };
      // @ts-expect-private
      expect(client['getAuthHeaders'](server)).toEqual({
        Authorization: 'Bearer abc123',
      });
    });

    it('should return api_key auth header', () => {
      // @ts-expect-private: access for test

      const client: any = new MCPClient({ enabled: true });
      const server = {
        auth: { type: 'api_key', api_key: 'xyz789' },
      };
      // @ts-expect-private
      expect(client['getAuthHeaders'](server)).toEqual({
        'X-API-Key': 'xyz789',
      });
    });

    it('should return empty object if no auth', () => {
      // @ts-expect-private: access for test

      const client: any = new MCPClient({ enabled: true });
      const server = {};
      // @ts-expect-private
      expect(client['getAuthHeaders'](server)).toEqual({});
    });

    it('should return empty object for incomplete auth', () => {
      // @ts-expect-private: access for test

      const client: any = new MCPClient({ enabled: true });
      const server = { auth: { type: 'bearer' } };
      // @ts-expect-private
      expect(client['getAuthHeaders'](server)).toEqual({});
    });
  });
});
