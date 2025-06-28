import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Command } from 'commander';
import express from 'express';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import logger from '../logger';
import { getEvalSummaries } from '../models/eval';
import { loadApiProvider, loadApiProviders } from '../providers';
import telemetry from '../telemetry';
import { TestSuiteSchema, UnifiedConfigSchema } from '../types';
import { loadDefaultConfig } from '../util/config/default';
import { resolveConfigs } from '../util/config/load';
import { getPromptsForTestCasesHash, getTestCases, readResult } from '../util/database';

interface ValidationResults {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  config?: any;
  testSuite?: any;
}

interface TestResult {
  providerId: string;
  success: boolean;
  responseTime?: number;
  response?: string;
  tokenUsage?: any;
  cost?: number;
  error?: string;
}

/**
 * Creates an MCP server with tools for interacting with promptfoo
 */
async function createMcpServer() {
  const server = new McpServer({
    name: 'Promptfoo MCP',
    version: '1.0.0',
  });

  // Define tools for retrieving evaluations
  server.tool(
    'listEvals',
    {
      datasetId: z.string().optional().describe('Dataset ID to filter evaluations'),
    },
    async ({ datasetId }) => {
      const evals = await getEvalSummaries(datasetId);
      return {
        content: [{ type: 'text', text: JSON.stringify(evals, null, 2) }],
      };
    },
  );

  server.tool(
    'getEval',
    {
      id: z.string().describe('Evaluation ID to retrieve'),
    },
    async ({ id }) => {
      const result = await readResult(id);
      if (!result) {
        return {
          content: [{ type: 'text', text: 'Eval not found' }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result.result, null, 2) }],
      };
    },
  );

  server.tool(
    'getPrompts',
    {
      sha256hash: z.string().describe('SHA256 hash of the test case'),
    },
    async ({ sha256hash }) => {
      const prompts = await getPromptsForTestCasesHash(sha256hash);
      return {
        content: [{ type: 'text', text: JSON.stringify(prompts, null, 2) }],
      };
    },
  );

  server.tool('listDatasets', {}, async () => {
    const datasets = await getTestCases();
    return {
      content: [{ type: 'text', text: JSON.stringify(datasets, null, 2) }],
    };
  });

  // Tool to get summary statistics for an evaluation
  server.tool(
    'getEvalStats',
    {
      id: z.string().describe('Evaluation ID to analyze'),
    },
    async ({ id }) => {
      const result = await readResult(id);
      if (!result) {
        return {
          content: [{ type: 'text', text: 'Eval not found' }],
          isError: true,
        };
      }

      const evalResults = result.result.results?.results || [];

      // Calculate basic statistics
      const totalTests = evalResults.length;
      const passedTests = evalResults.filter((r: any) => r.success === true).length;
      const failedTests = totalTests - passedTests;
      const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

      // Group by test case
      const testCaseGroups = evalResults.reduce<Record<string, unknown[]>>((acc, r: any) => {
        const testCase = r.vars ? JSON.stringify(r.vars) : 'unknown';
        if (!acc[testCase]) {
          acc[testCase] = [];
        }
        acc[testCase].push(r);
        return acc;
      }, {});

      const stats = {
        id,
        totalTests,
        passedTests,
        failedTests,
        passRate: `${passRate.toFixed(2)}%`,
        testCaseCount: Object.keys(testCaseGroups).length,
        description: result.result.config?.description || 'No description',
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
      };
    },
  );

  // Tool to validate configuration files using the same logic as promptfoo validate
  server.tool(
    'validateConfig',
    {
      configPaths: z
        .array(z.string())
        .optional()
        .describe('Paths to config files to validate (defaults to promptfooconfig.yaml)'),
    },
    async ({ configPaths }) => {
      try {
        const { defaultConfig } = await loadDefaultConfig();

        // Use the same logic as the validate command
        const configPathsArray =
          configPaths || (process.cwd() ? ['promptfooconfig.yaml'] : undefined);

        const { config, testSuite } = await resolveConfigs(
          { config: configPathsArray },
          defaultConfig,
        );

        const validationResults: ValidationResults = {
          isValid: true,
          errors: [],
          warnings: [],
        };

        // Validate config schema
        const configParse = UnifiedConfigSchema.safeParse(config);
        if (configParse.success) {
          validationResults.config = config;
        } else {
          validationResults.errors.push(
            `Configuration validation error: ${fromError(configParse.error).message}`,
          );
          validationResults.isValid = false;
        }

        // Validate test suite schema
        const suiteParse = TestSuiteSchema.safeParse(testSuite);
        if (suiteParse.success) {
          validationResults.testSuite = testSuite;
        } else {
          validationResults.errors.push(
            `Test suite validation error: ${fromError(suiteParse.error).message}`,
          );
          validationResults.isValid = false;
        }

        // Add helpful warnings for common issues
        if (configParse.success) {
          if (!config.prompts || (Array.isArray(config.prompts) && config.prompts.length === 0)) {
            validationResults.warnings.push('No prompts defined in config');
          }

          if (
            !config.providers ||
            (Array.isArray(config.providers) && config.providers.length === 0)
          ) {
            validationResults.warnings.push('No providers defined in config');
          }

          if (!config.tests || (Array.isArray(config.tests) && config.tests.length === 0)) {
            validationResults.warnings.push('No test cases defined in config');
          }
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(validationResults, null, 2) }],
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const validationResults: ValidationResults = {
          isValid: false,
          errors: [`Failed to validate configuration: ${errorMessage}`],
          warnings: [],
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(validationResults, null, 2) }],
          isError: true,
        };
      }
    },
  );

  // Tool to test provider connectivity with support for all provider formats
  server.tool(
    'testProvider',
    {
      provider: z
        .union([
          z.string(),
          z.object({
            id: z.string(),
            config: z.record(z.unknown()).optional(),
          }),
        ])
        .describe(
          'Provider to test - can be a string ID (e.g., "openai:gpt-4.1") or an object with id and config',
        ),
      testPrompt: z
        .string()
        .optional()
        .describe('Optional test prompt (defaults to a reasoning test)'),
    },
    async ({ provider, testPrompt }) => {
      // Use a better default test prompt that actually tests LLM reasoning
      const defaultPrompt =
        testPrompt ||
        `Please solve this step by step:

A farmer has 17 sheep. All but 9 die. How many sheep are left alive?

Think through this carefully and show your reasoning.`;

      try {
        let providerId: string;
        let providerToLoad: any = provider;

        // Handle different provider formats
        if (typeof provider === 'string') {
          providerId = provider;
        } else if (typeof provider === 'object' && provider.id) {
          providerId = provider.id;
          providerToLoad = provider;
        } else {
          throw new Error('Invalid provider format. Must be a string or object with id field.');
        }

        // Load the provider using the same logic as the main codebase
        let apiProvider;
        if (typeof providerToLoad === 'string') {
          apiProvider = await loadApiProvider(providerToLoad);
        } else {
          const providers = await loadApiProviders([providerToLoad]);
          apiProvider = providers[0];
        }

        if (!apiProvider) {
          throw new Error(`Failed to load provider: ${providerId}`);
        }

        const startTime = Date.now();
        const response = await apiProvider.callApi(defaultPrompt);
        const endTime = Date.now();

        const testResult: TestResult = {
          providerId: typeof apiProvider.id === 'function' ? apiProvider.id() : apiProvider.id,
          success: true,
          responseTime: endTime - startTime,
          response: response.output,
          tokenUsage: response.tokenUsage,
          cost: response.cost,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(testResult, null, 2) }],
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const providerId =
          typeof provider === 'string' ? provider : (provider as any).id || 'unknown';

        const testResult: TestResult = {
          providerId,
          success: false,
          error: errorMessage,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(testResult, null, 2) }],
          isError: true,
        };
      }
    },
  );

  // Resources
  server.resource('config', 'config://default', async () => {
    const { defaultConfig } = await loadDefaultConfig();
    return {
      contents: [
        {
          uri: 'config://default',
          text: JSON.stringify(defaultConfig, null, 2),
        },
      ],
    };
  });

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

interface McpCommandOptions {
  port: string;
  transport: string;
}

export function mcpCommand(program: Command): void {
  program
    .command('mcp')
    .description('Start an MCP server for external tool integrations')
    .option('-p, --port <number>', 'Port number for HTTP transport', '3100')
    .option('--transport <type>', 'Transport type: "http" or "stdio"', 'http')
    .action(async (cmdObj: McpCommandOptions & Command) => {
      // Validate transport type
      if (!['http', 'stdio'].includes(cmdObj.transport)) {
        logger.error(`Invalid transport type: ${cmdObj.transport}. Must be "http" or "stdio".`);
        process.exit(1);
      }

      telemetry.record('command_used', {
        name: 'mcp',
        transport: cmdObj.transport,
      });

      if (cmdObj.transport === 'stdio') {
        await startStdioMcpServer();
      } else {
        const port = Number.parseInt(cmdObj.port, 10);
        if (Number.isNaN(port)) {
          logger.error(`Invalid port number: ${cmdObj.port}`);
          process.exit(1);
        }
        await startHttpMcpServer(port);
      }
    });
}
