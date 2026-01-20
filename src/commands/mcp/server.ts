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
import { registerLogTools } from './tools/logs';
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
    description:
      'MCP server for LLM evaluation, red teaming, and security testing with promptfoo. Provides tools for running evaluations, testing providers, generating datasets, and performing security assessments.',
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

  // Register debugging tools
  registerLogTools(server);

  // Register resources
  registerResources(server);

  return server;
}

/**
 * Starts an MCP server with HTTP transport
 * Returns a Promise that only resolves when the server shuts down
 */
export async function startHttpMcpServer(port: number): Promise<void> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${port}. Port must be an integer between 1 and 65535.`);
  }

  // Set transport type for telemetry
  process.env.MCP_TRANSPORT = 'http';

  const app = express();
  app.use(express.json());

  const mcpServer = await createMcpServer();

  // Set up HTTP transport for MCP
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => Math.random().toString(36).substring(2, 15),
  });

  await mcpServer.connect(transport);

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

  // Return a Promise that only resolves when the server shuts down
  // This keeps long-running commands running until SIGINT/SIGTERM
  return new Promise<void>((resolve) => {
    const httpServer = app.listen(port, () => {
      logger.info(`Promptfoo MCP server running at http://localhost:${port}`);
      logger.info(`MCP endpoint: http://localhost:${port}/mcp`);
      logger.info(`SSE endpoint: http://localhost:${port}/mcp/sse`);

      // Track server start
      telemetry.record('feature_used', {
        feature: 'mcp_server_started',
        transport: 'http',
        port,
      });
      // Don't resolve - server runs until shutdown signal
    });

    let isShuttingDown = false;

    // Register shutdown handlers
    const shutdown = () => {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;

      logger.info('Shutting down MCP server...');
      const SHUTDOWN_TIMEOUT_MS = 5000;
      const forceCloseTimeout = setTimeout(() => {
        logger.warn('MCP server close timeout - forcing shutdown');
        resolve();
      }, SHUTDOWN_TIMEOUT_MS);

      // Clean up the MCP server first, then close the HTTP server
      mcpServer
        .close()
        .catch((err) => {
          logger.warn(`Error closing MCP server: ${err instanceof Error ? err.message : err}`);
        })
        .finally(() => {
          httpServer.close((err) => {
            clearTimeout(forceCloseTimeout);
            if (err) {
              logger.warn(`Error closing HTTP server: ${err.message}`);
            }
            logger.info('MCP server closed');
            resolve();
          });
        });
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
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

  // Return a Promise that only resolves when the server shuts down
  // This matches the pattern used in startHttpMcpServer
  return new Promise<void>((resolve) => {
    let isShuttingDown = false;

    const shutdown = () => {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;

      // Add timeout to prevent indefinite hangs, matching HTTP server pattern
      const SHUTDOWN_TIMEOUT_MS = 5000;
      const forceCloseTimeout = setTimeout(() => {
        resolve();
      }, SHUTDOWN_TIMEOUT_MS);

      // Clean up the server and transport properly
      server
        .close()
        .catch(() => {
          // Ignore close errors during shutdown
        })
        .finally(() => {
          clearTimeout(forceCloseTimeout);
          resolve();
        });
    };

    // Register shutdown handlers for signals
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    // Handle client disconnect (stdin close)
    process.stdin.once('end', shutdown);
  });
}
