import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import logger from '../../logger';
import { registerResources } from './resources';
import { registerAnalyzeEvaluationMetricsTool } from './tools/analyzeEvaluationMetrics';
import { registerGetEvaluationDetailsTool } from './tools/getEvaluationDetails';
import { registerGetTestPromptsTool } from './tools/getTestPrompts';
import { registerHealthCheckTool } from './tools/healthCheck';
import { registerListEvaluationsTool } from './tools/listEvaluations';
import { registerListTestDatasetsTool } from './tools/listTestDatasets';
import { registerRunAssertionTool } from './tools/runAssertion';
import { registerRunEvaluationTool } from './tools/runEvaluation';
import { registerShareEvaluationTool } from './tools/shareEvaluation';
import { registerTestAiProviderTool } from './tools/testAiProvider';
import { registerValidatePrompfooConfigTool } from './tools/validatePrompfooConfig';

/**
 * Creates an MCP server with tools for interacting with promptfoo
 */
export async function createMcpServer() {
  const server = new McpServer({
    name: 'Promptfoo MCP',
    version: '1.0.0',
  });

  // Register all tools
  registerHealthCheckTool(server);
  registerListEvaluationsTool(server);
  registerGetEvaluationDetailsTool(server);
  registerGetTestPromptsTool(server);
  registerListTestDatasetsTool(server);
  registerAnalyzeEvaluationMetricsTool(server);
  registerValidatePrompfooConfigTool(server);
  registerTestAiProviderTool(server);
  registerRunAssertionTool(server);
  registerRunEvaluationTool(server);
  registerShareEvaluationTool(server);

  // Register resources
  registerResources(server);

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
