import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  const MockMcpServer = vi.fn(function MockMcpServer(
    this: {
      connect: ReturnType<typeof vi.fn>;
      tool: ReturnType<typeof vi.fn>;
      resource: ReturnType<typeof vi.fn>;
    },
    config: { name: string; version: string; description?: string },
  ) {
    mcpServerCalls.push(config);
    this.connect = vi.fn();
    this.tool = vi.fn();
    this.resource = vi.fn();
  });

  return { mcpServerCalls, MockMcpServer };
});

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: mcpServerMocks.MockMcpServer,
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
    handleRequest: vi.fn(),
  })),
}));

const { mcpServerCalls } = mcpServerMocks;

describe('MCP Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mcpServerCalls.length = 0;
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
});
