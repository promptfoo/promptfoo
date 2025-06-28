import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import logger from '../../logger';
import type { BaseTool } from './lib/types';
import { registerResources } from './resources';
// Legacy function-based tools (for backward compatibility)
import {
  registerAnalyzeEvaluationMetricsTool,
  registerGetEvaluationDetailsTool,
  registerGetTestPromptsTool,
  registerListTestDatasetsTool,
  registerRunAssertionTool,
  registerRunEvaluationTool,
  registerShareEvaluationTool,
  registerTestAiProviderTool,
} from './tools';
// New class-based tools
import { HealthCheckTool, ListEvaluationsTool, ValidateConfigTool } from './tools/index-new';

/**
 * Creates an MCP server with both new class-based and legacy function-based tools
 */
export async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer({
    name: 'Promptfoo MCP',
    version: '1.0.0',
  });

  // Register new class-based tools
  const newTools: BaseTool[] = [
    new HealthCheckTool(),
    new ListEvaluationsTool(),
    new ValidateConfigTool(),
  ];

  for (const tool of newTools) {
    logger.debug(`Registering new tool: ${tool.name}`);
    tool.register(server);
  }

  // Register legacy function-based tools for backward compatibility
  const legacyTools = [
    { name: 'get_evaluation_details', register: registerGetEvaluationDetailsTool },
    { name: 'get_test_prompts', register: registerGetTestPromptsTool },
    { name: 'list_test_datasets', register: registerListTestDatasetsTool },
    { name: 'analyze_evaluation_metrics', register: registerAnalyzeEvaluationMetricsTool },
    { name: 'test_ai_provider', register: registerTestAiProviderTool },
    { name: 'run_assertion', register: registerRunAssertionTool },
    { name: 'run_evaluation', register: registerRunEvaluationTool },
    { name: 'share_evaluation', register: registerShareEvaluationTool },
  ];

  for (const tool of legacyTools) {
    logger.debug(`Registering legacy tool: ${tool.name}`);
    tool.register(server);
  }

  // Register resources
  registerResources(server);

  logger.info(
    `MCP server created with ${newTools.length} new tools and ${legacyTools.length} legacy tools`,
  );

  return server;
}

/**
 * Starts an MCP server with HTTP transport
 */
export async function startHttpMcpServer(port: number): Promise<void> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${port}. Port must be an integer between 1 and 65535.`);
  }

  const app = express();
  app.use(express.json());

  const server = await createMcpServer();

  // Set up HTTP transport for MCP
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => Math.random().toString(36).substring(2, 15),
  });

  await server.connect(transport);

  // Handle MCP requests
  app.post('/mcp', async (req, res) => {
    await transport.handleRequest(req, res, req.body);
  });

  // Handle SSE
  app.get('/mcp/sse', async (req, res) => {
    await transport.handleRequest(req, res);
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'OK', message: 'Promptfoo MCP server is running' });
  });

  // Start the server
  app.listen(port, () => {
    logger.info(`Promptfoo MCP server running at http://localhost:${port}`);
    logger.info(`MCP endpoint: http://localhost:${port}/mcp`);
    logger.info(`SSE endpoint: http://localhost:${port}/mcp/sse`);
  });
}

/**
 * Starts an MCP server with stdio transport
 */
export async function startStdioMcpServer(): Promise<void> {
  // Disable all console logging in stdio mode to prevent pollution of JSON-RPC communication
  logger.transports.forEach((transport) => {
    // Winston Console transport constructor name check
    if (transport.constructor.name === 'Console' || (transport as any).name === 'console') {
      transport.silent = true;
    }
  });

  const server = await createMcpServer();

  // Set up stdio transport
  const transport = new StdioServerTransport();

  // Connect the server to the stdio transport
  await server.connect(transport);

  // Don't log to stdout in stdio mode as it pollutes the JSON-RPC protocol
  // logger.info('Promptfoo MCP stdio server started');
}
