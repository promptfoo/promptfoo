import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { registerResources } from './resources';
import { registerCompareProvidersTool } from './tools/compareProviders';
import { registerGenerateDatasetTool } from './tools/generateDataset';
import { registerGenerateTestCasesTool } from './tools/generateTestCases';
import { registerGetEvaluationDetailsTool } from './tools/getEvaluationDetails';
import { registerListEvaluationsTool } from './tools/listEvaluations';
import { registerRedteamGenerateTool } from './tools/redteamGenerate';
import { registerRedteamRunTool } from './tools/redteamRun';
import { registerRunAssertionTool } from './tools/runAssertion';
import { registerRunEvaluationTool } from './tools/runEvaluation';
import { registerShareEvaluationTool } from './tools/shareEvaluation';
import { registerTestProviderTool } from './tools/testProvider';
import { registerValidatePromptfooConfigTool } from './tools/validatePromptfooConfig';

/**
 * Creates an MCP server with tools for interacting with promptfoo
 */
export async function createMcpServer() {
  const server = new McpServer({
    name: 'Promptfoo MCP',
    version: '1.0.0',
  });

  // Track MCP server creation
  telemetry.record('feature_used', {
    feature: 'mcp_server',
    transport: process.env.MCP_TRANSPORT || 'unknown',
  });

  // Note: Tool usage tracking would require deeper integration with MCP SDK
  // For now, we track server creation and start events

  // Register core evaluation tools
  registerListEvaluationsTool(server);
  registerGetEvaluationDetailsTool(server);
  registerValidatePromptfooConfigTool(server);
  registerTestProviderTool(server);
  registerRunAssertionTool(server);
  registerRunEvaluationTool(server);
  registerShareEvaluationTool(server);

  // Register generation tools
  registerGenerateDatasetTool(server);
  registerGenerateTestCasesTool(server);
  registerCompareProvidersTool(server);

  // Register redteam tools
  registerRedteamRunTool(server);
  registerRedteamGenerateTool(server);

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

  // Set transport type for telemetry
  process.env.MCP_TRANSPORT = 'http';

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

    // Track server start
    telemetry.record('feature_used', {
      feature: 'mcp_server_started',
      transport: 'http',
      port,
    });
  });
}

/**
 * Starts an MCP server with stdio transport
 */
export async function startStdioMcpServer(): Promise<void> {
  // Set transport type for telemetry
  process.env.MCP_TRANSPORT = 'stdio';

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

  // Track server start
  telemetry.record('feature_used', {
    feature: 'mcp_server_started',
    transport: 'stdio',
  });

  // Don't log to stdout in stdio mode as it pollutes the JSON-RPC protocol
  // logger.info('Promptfoo MCP stdio server started');
}
