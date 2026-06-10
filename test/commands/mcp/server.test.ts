import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../../util/utils';

const { mockRandomUUID } = vi.hoisted(() => ({
  mockRandomUUID: vi.fn(() => 'secure-mcp-session-id'),
}));

vi.mock('node:crypto', () => ({
  randomUUID: mockRandomUUID,
}));

// Mock dependencies before importing the module
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    transports: [],
  },
}));

vi.mock('../../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
  },
}));

// Mock all tool registrations
vi.mock('../../../src/commands/mcp/tools/listEvaluations', () => ({
  registerListEvaluationsTool: vi.fn(),
}));

vi.mock('../../../src/commands/mcp/tools/getEvaluationDetails', () => ({
  registerGetEvaluationDetailsTool: vi.fn(),
}));

vi.mock('../../../src/commands/mcp/tools/validatePromptfooConfig', () => ({
  registerValidatePromptfooConfigTool: vi.fn(),
}));

vi.mock('../../../src/commands/mcp/tools/testProvider', () => ({
  registerTestProviderTool: vi.fn(),
}));

vi.mock('../../../src/commands/mcp/tools/runAssertion', () => ({
  registerRunAssertionTool: vi.fn(),
}));

vi.mock('../../../src/commands/mcp/tools/runEvaluation', () => ({
  registerRunEvaluationTool: vi.fn(),
}));

vi.mock('../../../src/commands/mcp/tools/shareEvaluation', () => ({
  registerShareEvaluationTool: vi.fn(),
}));

vi.mock('../../../src/commands/mcp/tools/generateDataset', () => ({
  registerGenerateDatasetTool: vi.fn(),
}));

vi.mock('../../../src/commands/mcp/tools/generateTestCases', () => ({
  registerGenerateTestCasesTool: vi.fn(),
}));

vi.mock('../../../src/commands/mcp/tools/compareProviders', () => ({
  registerCompareProvidersTool: vi.fn(),
}));

vi.mock('../../../src/commands/mcp/tools/redteamRun', () => ({
  registerRedteamRunTool: vi.fn(),
}));

vi.mock('../../../src/commands/mcp/tools/redteamGenerate', () => ({
  registerRedteamGenerateTool: vi.fn(),
}));

vi.mock('../../../src/commands/mcp/resources', () => ({
  registerResources: vi.fn(),
}));

// Store the McpServer constructor calls using vi.hoisted
const mcpServerMocks = vi.hoisted(() => {
  const mcpServerCalls: Array<{ name: string; version: string; description?: string }> = [];

  // Create a mock class that can be instantiated with `new`
  const mockMcpServerImplementation = function MockMcpServer(
    this: {
      connect: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      tool: ReturnType<typeof vi.fn>;
      resource: ReturnType<typeof vi.fn>;
    },
    config: { name: string; version: string; description?: string },
  ) {
    mcpServerCalls.push(config);
    this.connect = vi.fn();
    this.close = vi.fn().mockResolvedValue(undefined);
    this.tool = vi.fn();
    this.resource = vi.fn();
  };
  const MockMcpServer = vi.fn(mockMcpServerImplementation);

  return { mcpServerCalls, MockMcpServer, mockMcpServerImplementation };
});

const expressMocks = vi.hoisted(() => {
  const postHandlers: Record<string, any> = {};
  const getHandlers: Record<string, any> = {};
  const httpServer = {
    close: vi.fn((callback?: (error?: Error) => void) => callback?.()),
  };
  const app = {
    get: vi.fn(),
    listen: vi.fn(),
    post: vi.fn(),
    use: vi.fn(),
  };
  const expressFactory = Object.assign(
    vi.fn(() => app),
    {
      json: vi.fn(() => 'json-middleware'),
    },
  );

  return { app, expressFactory, getHandlers, httpServer, postHandlers };
});

const transportMocks = vi.hoisted(() => {
  const instances: Array<{ handleRequest: ReturnType<typeof vi.fn> }> = [];
  const StreamableHTTPServerTransport = vi.fn(function MockStreamableHTTPServerTransport(
    this: { handleRequest: ReturnType<typeof vi.fn> },
    _options?: { sessionIdGenerator?: () => string },
  ) {
    this.handleRequest = vi.fn().mockResolvedValue(undefined);
    instances.push(this);
  });

  return { instances, StreamableHTTPServerTransport };
});

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: mcpServerMocks.MockMcpServer,
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: transportMocks.StreamableHTTPServerTransport,
}));

vi.mock('express', () => ({
  default: expressMocks.expressFactory,
}));

const { mcpServerCalls } = mcpServerMocks;

describe('MCP Server', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mcpServerMocks.MockMcpServer.mockReset().mockImplementation(
      mcpServerMocks.mockMcpServerImplementation,
    );
    mockRandomUUID.mockClear();
    mcpServerCalls.length = 0;
    transportMocks.instances.length = 0;
    Object.keys(expressMocks.postHandlers).forEach((key) => delete expressMocks.postHandlers[key]);
    Object.keys(expressMocks.getHandlers).forEach((key) => delete expressMocks.getHandlers[key]);
    expressMocks.app.use.mockReset().mockReturnValue(expressMocks.app);
    expressMocks.app.post.mockReset().mockImplementation((path, handler) => {
      expressMocks.postHandlers[path] = handler;
      return expressMocks.app;
    });
    expressMocks.app.get.mockReset().mockImplementation((path, handler) => {
      expressMocks.getHandlers[path] = handler;
      return expressMocks.app;
    });
    expressMocks.app.listen.mockReset().mockImplementation((_port, _host, callback) => {
      callback?.();
      return expressMocks.httpServer;
    });
    expressMocks.httpServer.close.mockReset().mockImplementation((callback) => callback?.());
  });

  describe('createMcpServer', () => {
    it('should create server with correct name and version', async () => {
      const { createMcpServer } = await import('../../../src/commands/mcp/server');
      await createMcpServer();

      expect(mcpServerCalls.length).toBe(1);
      expect(mcpServerCalls[0].name).toBe('Promptfoo MCP');
      expect(mcpServerCalls[0].version).toBe('1.0.0');
    });

    it('should create server with a description field', async () => {
      const { createMcpServer } = await import('../../../src/commands/mcp/server');
      await createMcpServer();

      expect(mcpServerCalls.length).toBe(1);
      expect(mcpServerCalls[0]).toHaveProperty('description');
      expect(typeof mcpServerCalls[0].description).toBe('string');
    });

    it('should have a meaningful description that describes server capabilities', async () => {
      const { createMcpServer } = await import('../../../src/commands/mcp/server');
      await createMcpServer();

      expect(mcpServerCalls.length).toBe(1);
      const description = mcpServerCalls[0].description;

      // Verify the description contains key information about the server
      expect(description).toBeDefined();
      expect(description!.length).toBeGreaterThan(50); // Should be descriptive
      expect(description).toContain('MCP server');
      expect(description).toContain('evaluation');
    });

    it('should include security testing capabilities in description', async () => {
      const { createMcpServer } = await import('../../../src/commands/mcp/server');
      await createMcpServer();

      expect(mcpServerCalls.length).toBe(1);
      const description = mcpServerCalls[0].description;

      // The description should mention security/red teaming capabilities
      expect(description).toMatch(/red team|security/i);
    });

    it('should register all expected tools', async () => {
      const { createMcpServer } = await import('../../../src/commands/mcp/server');
      const { registerListEvaluationsTool } = await import(
        '../../../src/commands/mcp/tools/listEvaluations'
      );
      const { registerGetEvaluationDetailsTool } = await import(
        '../../../src/commands/mcp/tools/getEvaluationDetails'
      );
      const { registerValidatePromptfooConfigTool } = await import(
        '../../../src/commands/mcp/tools/validatePromptfooConfig'
      );
      const { registerTestProviderTool } = await import(
        '../../../src/commands/mcp/tools/testProvider'
      );
      const { registerRunAssertionTool } = await import(
        '../../../src/commands/mcp/tools/runAssertion'
      );
      const { registerRunEvaluationTool } = await import(
        '../../../src/commands/mcp/tools/runEvaluation'
      );
      const { registerShareEvaluationTool } = await import(
        '../../../src/commands/mcp/tools/shareEvaluation'
      );
      const { registerGenerateDatasetTool } = await import(
        '../../../src/commands/mcp/tools/generateDataset'
      );
      const { registerGenerateTestCasesTool } = await import(
        '../../../src/commands/mcp/tools/generateTestCases'
      );
      const { registerCompareProvidersTool } = await import(
        '../../../src/commands/mcp/tools/compareProviders'
      );
      const { registerRedteamRunTool } = await import('../../../src/commands/mcp/tools/redteamRun');
      const { registerRedteamGenerateTool } = await import(
        '../../../src/commands/mcp/tools/redteamGenerate'
      );
      const { registerResources } = await import('../../../src/commands/mcp/resources');

      await createMcpServer();

      // Core evaluation tools
      expect(registerListEvaluationsTool).toHaveBeenCalled();
      expect(registerGetEvaluationDetailsTool).toHaveBeenCalled();
      expect(registerValidatePromptfooConfigTool).toHaveBeenCalled();
      expect(registerTestProviderTool).toHaveBeenCalled();
      expect(registerRunAssertionTool).toHaveBeenCalled();
      expect(registerRunEvaluationTool).toHaveBeenCalled();
      expect(registerShareEvaluationTool).toHaveBeenCalled();

      // Generation tools
      expect(registerGenerateDatasetTool).toHaveBeenCalled();
      expect(registerGenerateTestCasesTool).toHaveBeenCalled();
      expect(registerCompareProvidersTool).toHaveBeenCalled();

      // Redteam tools
      expect(registerRedteamRunTool).toHaveBeenCalled();
      expect(registerRedteamGenerateTool).toHaveBeenCalled();

      // Resources
      expect(registerResources).toHaveBeenCalled();
    });

    it('should track telemetry for MCP server creation', async () => {
      const { createMcpServer } = await import('../../../src/commands/mcp/server');
      const telemetry = await import('../../../src/telemetry');

      await createMcpServer();

      expect(telemetry.default.record).toHaveBeenCalledWith('feature_used', {
        feature: 'mcp_server',
        transport: expect.any(String),
      });
    });
  });

  describe('startHttpMcpServer', () => {
    it('should bind HTTP transport to loopback by default', async () => {
      const { DEFAULT_MCP_HTTP_HOST, startHttpMcpServer } = await import(
        '../../../src/commands/mcp/server'
      );

      const serverPromise = startHttpMcpServer(3100);
      await new Promise((resolve) => setImmediate(resolve));
      process.emit('SIGINT');
      await serverPromise;

      expect(expressMocks.app.listen).toHaveBeenCalledWith(
        3100,
        DEFAULT_MCP_HTTP_HOST,
        expect.any(Function),
      );
    });

    it('should install browser origin protection on HTTP transport', async () => {
      const { startHttpMcpServer } = await import('../../../src/commands/mcp/server');

      const serverPromise = startHttpMcpServer(3100);
      await new Promise((resolve) => setImmediate(resolve));
      process.emit('SIGINT');
      await serverPromise;

      expect(expressMocks.app.use).toHaveBeenNthCalledWith(1, expect.any(Function));
      expect(expressMocks.app.use).toHaveBeenNthCalledWith(2, 'json-middleware');
      expect(expressMocks.app.use).toHaveBeenNthCalledWith(3, expect.any(Function));
    });

    it('should reject DNS-rebinding Host headers', async () => {
      const { startHttpMcpServer } = await import('../../../src/commands/mcp/server');

      const serverPromise = startHttpMcpServer(3100);
      await new Promise((resolve) => setImmediate(resolve));

      const hostProtection = expressMocks.app.use.mock.calls[0][0];
      const request = {
        headers: { host: 'attacker.example:3100' },
        method: 'POST',
        path: '/mcp',
      };
      const response = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };
      const next = vi.fn();

      hostProtection(request, response, next);

      expect(next).not.toHaveBeenCalled();
      expect(response.status).toHaveBeenCalledWith(403);
      expect(response.json).toHaveBeenCalledWith({
        error: 'MCP HTTP requests require a local Host header',
      });

      process.emit('SIGINT');
      await serverPromise;
    });

    it('should handle MCP requests on loopback transport', async () => {
      const { startHttpMcpServer } = await import('../../../src/commands/mcp/server');

      const serverPromise = startHttpMcpServer(3100);
      await new Promise((resolve) => setImmediate(resolve));

      const mcpHandler = expressMocks.postHandlers['/mcp'];
      const request = {
        body: { jsonrpc: '2.0' },
        get: vi.fn(),
      };
      const response = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis(),
      };

      await mcpHandler(request, response);

      expect(transportMocks.instances[0].handleRequest).toHaveBeenCalledWith(
        request,
        response,
        request.body,
      );

      process.emit('SIGINT');
      await serverPromise;
    });

    it('creates cryptographically random session identifiers', async () => {
      const restoreEnv = mockProcessEnv({ MCP_TRANSPORT: undefined });
      let shutdown: (() => void) | undefined;
      vi.spyOn(process, 'once').mockImplementation(((event: string, listener: () => void) => {
        if (event === 'SIGINT') {
          shutdown = listener;
        }
        return process;
      }) as typeof process.once);

      let serverPromise: Promise<void> | undefined;
      try {
        const { startHttpMcpServer } = await import('../../../src/commands/mcp/server');
        serverPromise = startHttpMcpServer(3100);

        await vi.waitFor(() => {
          expect(transportMocks.StreamableHTTPServerTransport).toHaveBeenCalledOnce();
        });

        const transportOptions = transportMocks.StreamableHTTPServerTransport.mock.calls[0][0] as {
          sessionIdGenerator: () => string;
        };
        expect(transportOptions.sessionIdGenerator()).toBe('secure-mcp-session-id');
        expect(mockRandomUUID).toHaveBeenCalledOnce();
      } finally {
        if (shutdown) {
          shutdown();
          await serverPromise;
        }
        restoreEnv();
      }
    });
  });
});
