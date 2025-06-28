import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Command } from 'commander';
import dedent from 'dedent';
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
  timedOut?: boolean;
  metadata?: any;
}

interface ToolResponse {
  tool: string;
  success: boolean;
  timestamp: string;
  data?: any;
  error?: string;
}

/**
 * Creates a standardized tool response
 */
function createToolResponse(tool: string, success: boolean, data?: any, error?: string): any {
  const response: ToolResponse = {
    tool,
    success,
    timestamp: new Date().toISOString(),
  };

  if (success && data !== undefined) {
    response.data = data;
  }

  if (!success && error) {
    response.error = error;
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    isError: !success,
  };
}

/**
 * Creates a promise that rejects after the specified timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs)),
  ]);
}

/**
 * Creates an MCP server with tools for interacting with promptfoo
 */
async function createMcpServer() {
  const server = new McpServer({
    name: 'Promptfoo MCP',
    version: '1.0.0',
  });

  /**
   * Health check tool to verify MCP server connectivity and promptfoo system status
   */
  server.tool('promptfoo_health_check', {}, async () => {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
    return createToolResponse('promptfoo_health_check', true, healthData);
  });

  /**
   * List and browse evaluation runs in the promptfoo database
   *
   * Use this tool to:
   * - Get an overview of all evaluation runs
   * - Find specific evaluations by dataset
   * - Monitor evaluation history and trends
   * - Identify successful vs failed evaluation runs
   */
  server.tool(
    'list_evaluations',
    {
      datasetId: z
        .string()
        .optional()
        .describe(
          'Filter evaluations by dataset ID. Example: "dataset_123" or leave empty to see all evaluations',
        ),
    },
    async ({ datasetId }) => {
      try {
        const evals = await getEvalSummaries(datasetId);
        return createToolResponse('list_evaluations', true, evals);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return createToolResponse('list_evaluations', false, undefined, errorMessage);
      }
    },
  );

  /**
   * Retrieve detailed results and analysis for a specific evaluation run
   *
   * Use this tool to:
   * - Analyze test results in detail
   * - Review prompt-response pairs
   * - Examine assertion outcomes
   * - Debug failed test cases
   * - Export evaluation data for reporting
   */
  server.tool(
    'get_evaluation_details',
    {
      id: z
        .string()
        .min(1, 'Evaluation ID cannot be empty')
        .describe(
          dedent`
            Unique evaluation ID (UUID format). 
            Example: "eval_abc123def456" 
            Get this from list_evaluations.
          `,
        ),
    },
    async ({ id }) => {
      try {
        const result = await readResult(id);
        if (!result) {
          return createToolResponse(
            'get_evaluation_details',
            false,
            undefined,
            'Evaluation not found. Use list_evaluations to find valid IDs.',
          );
        }
        return createToolResponse('get_evaluation_details', true, result.result);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return createToolResponse('get_evaluation_details', false, undefined, errorMessage);
      }
    },
  );

  /**
   * Get prompts and templates associated with a specific test case
   *
   * Use this tool to:
   * - Retrieve prompt templates used in testing
   * - Analyze prompt variations across test cases
   * - Debug prompt-related issues
   * - Extract reusable prompt patterns
   */
  server.tool(
    'get_test_prompts',
    {
      sha256hash: z
        .string()
        .min(1, 'Hash cannot be empty')
        .length(64, 'Must be a valid SHA256 hash (64 characters)')
        .describe(
          dedent`
            SHA256 hash of the test case. 
            Example: "a1b2c3d4e5f6..." 
            Obtain from evaluation results.
          `,
        ),
    },
    async ({ sha256hash }) => {
      try {
        const prompts = await getPromptsForTestCasesHash(sha256hash);
        return createToolResponse('get_test_prompts', true, prompts);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return createToolResponse('get_test_prompts', false, undefined, errorMessage);
      }
    },
  );

  /**
   * Browse all available test datasets and their metadata
   *
   * Use this tool to:
   * - Discover available test datasets
   * - Understand test case structure
   * - Plan new evaluations
   * - Analyze test coverage
   */
  server.tool('list_test_datasets', {}, async () => {
    try {
      const datasets = await getTestCases();
      return createToolResponse('list_test_datasets', true, datasets);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return createToolResponse('list_test_datasets', false, undefined, errorMessage);
    }
  });

  /**
   * Calculate comprehensive statistics and metrics for an evaluation run
   *
   * Use this tool to:
   * - Get pass/fail rates and success metrics
   * - Analyze performance trends
   * - Generate evaluation reports
   * - Compare evaluation results
   * - Monitor model quality over time
   */
  server.tool(
    'analyze_evaluation_metrics',
    {
      id: z
        .string()
        .min(1, 'Evaluation ID cannot be empty')
        .describe(
          'Evaluation ID to analyze. Example: "eval_abc123" - get from list_evaluations for comprehensive stats',
        ),
    },
    async ({ id }) => {
      try {
        const result = await readResult(id);
        if (!result) {
          return createToolResponse(
            'analyze_evaluation_metrics',
            false,
            undefined,
            'Evaluation not found. Use list_evaluations to find valid IDs.',
          );
        }

        const evalResults = result.result.results?.results || [];

        // Calculate comprehensive statistics
        const totalTests = evalResults.length;
        const passedTests = evalResults.filter((r: any) => r.success === true).length;
        const failedTests = totalTests - passedTests;
        const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

        // Group by test case for detailed analysis
        const testCaseGroups = evalResults.reduce<Record<string, unknown[]>>((acc, r: any) => {
          const testCase = r.vars ? JSON.stringify(r.vars) : 'unknown';
          if (!acc[testCase]) {
            acc[testCase] = [];
          }
          acc[testCase].push(r);
          return acc;
        }, {});

        // Calculate additional metrics
        const avgResponseTime =
          evalResults.reduce((sum: number, r: any) => {
            return sum + (r.latencyMs || 0);
          }, 0) / totalTests;

        const totalTokens = evalResults.reduce((sum: number, r: any) => {
          return sum + (r.tokenUsage?.total || 0);
        }, 0);

        const totalCost = evalResults.reduce((sum: number, r: any) => {
          return sum + (r.cost || 0);
        }, 0);

        const stats = {
          id,
          summary: {
            totalTests,
            passedTests,
            failedTests,
            passRate: `${passRate.toFixed(2)}%`,
            testCaseCount: Object.keys(testCaseGroups).length,
          },
          performance: {
            avgResponseTimeMs: Math.round(avgResponseTime),
            totalTokens,
            totalCost: totalCost.toFixed(4),
          },
          metadata: {
            description: result.result.config?.description || 'No description',
            createdAt: (result as any).createdAt || (result as any).timestamp || 'Unknown',
            configFile: (result.result.config as any)?.configPath || 'Unknown',
          },
        };

        return createToolResponse('analyze_evaluation_metrics', true, stats);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return createToolResponse('analyze_evaluation_metrics', false, undefined, errorMessage);
      }
    },
  );

  /**
   * Validate promptfoo configuration files before running evaluations
   *
   * Use this tool to:
   * - Catch configuration errors before evaluation runs
   * - Validate YAML/JSON syntax and schema compliance
   * - Check provider configurations and credentials
   * - Verify prompt and test case definitions
   * - Ensure all required fields are present
   *
   * This uses the same validation logic as `promptfoo validate` command.
   */
  server.tool(
    'validate_promptfoo_config',
    {
      configPaths: z
        .array(z.string().min(1, 'Config path cannot be empty'))
        .optional()
        .describe(
          dedent`
            Paths to configuration files to validate. 
            Examples: ["promptfooconfig.yaml"], ["config/eval.yaml", "config/prompts.yaml"]. 
            Defaults to "promptfooconfig.yaml" in current directory.
          `,
        ),
    },
    async ({ configPaths }) => {
      try {
        let defaultConfig;
        try {
          const result = await loadDefaultConfig();
          defaultConfig = result.defaultConfig;
        } catch (error) {
          return createToolResponse(
            'validate_promptfoo_config',
            false,
            undefined,
            `Failed to load default config: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }

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
            validationResults.warnings.push(
              'No prompts defined - add prompts to evaluate model responses',
            );
          }

          if (
            !config.providers ||
            (Array.isArray(config.providers) && config.providers.length === 0)
          ) {
            validationResults.warnings.push(
              'No providers defined - add providers like "openai:gpt-4" to run evaluations',
            );
          }

          if (!config.tests || (Array.isArray(config.tests) && config.tests.length === 0)) {
            validationResults.warnings.push(
              'No test cases defined - add test cases to validate model behavior',
            );
          }

          if (config.prompts && config.providers && config.tests) {
            const promptCount = Array.isArray(config.prompts) ? config.prompts.length : 1;
            const providerCount = Array.isArray(config.providers) ? config.providers.length : 1;
            const testCount = Array.isArray(config.tests) ? config.tests.length : 1;
            const totalEvals = promptCount * providerCount * testCount;

            validationResults.warnings.push(
              `Configuration ready: ${promptCount} prompts × ${providerCount} providers × ${testCount} tests = ${totalEvals} total evaluations`,
            );
          }
        }

        return createToolResponse(
          'validate_promptfoo_config',
          validationResults.isValid,
          validationResults,
        );
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return createToolResponse(
          'validate_promptfoo_config',
          false,
          undefined,
          `Failed to validate configuration: ${errorMessage}`,
        );
      }
    },
  );

  /**
   * Test AI provider connectivity, response quality, and performance
   *
   * Use this tool to:
   * - Verify provider credentials and connectivity
   * - Test response quality with reasoning tasks
   * - Measure response time and token usage
   * - Debug provider configuration issues
   * - Compare different provider capabilities
   *
   * Supports all promptfoo provider formats including custom providers.
   */
  server.tool(
    'test_ai_provider',
    {
      provider: z
        .union([
          z.string().min(1, 'Provider ID cannot be empty'),
          z.object({
            id: z.string().min(1, 'Provider ID cannot be empty'),
            config: z.record(z.unknown()).optional(),
          }),
        ])
        .describe(
          dedent`
            Provider to test. Examples:
            - "openai:gpt-4o"
            - "anthropic:messages:claude-sonnet-4" 
            - {"id": "custom-provider", "config": {...}}
            - path to custom provider file
          `,
        ),
      testPrompt: z
        .string()
        .optional()
        .describe(
          dedent`
            Custom test prompt to evaluate provider response quality. 
            Default uses a reasoning test to verify logical thinking capabilities.
          `,
        ),
      timeoutMs: z
        .number()
        .int()
        .min(1000)
        .max(300000)
        .optional()
        .describe(
          dedent`
            Request timeout in milliseconds. 
            Range: 1000-300000 (1s-5min). 
            Default: 30000 (30s). 
            Increase for slower providers.
          `,
        ),
    },
    async ({ provider, testPrompt, timeoutMs = 30000 }) => {
      // Use a comprehensive test prompt that evaluates reasoning, accuracy, and instruction following
      const defaultPrompt =
        testPrompt ||
        dedent`
            Please solve this step-by-step reasoning problem:

            A farmer has 17 sheep. All but 9 die. How many sheep are left alive?

            Requirements:
            1. Show your step-by-step reasoning
            2. Explain any assumptions you make  
            3. Provide the final numerical answer

            This tests logical reasoning, reading comprehension, and instruction following.
          `;

      try {
        let providerId: string;
        let providerToLoad: any = provider;

        // Handle different provider formats with better error messages
        if (typeof provider === 'string') {
          providerId = provider;
        } else if (typeof provider === 'object' && provider.id) {
          providerId = provider.id;
          providerToLoad = provider;
        } else {
          return createToolResponse(
            'test_ai_provider',
            false,
            undefined,
            'Invalid provider format. Use string like "openai:gpt-4" or object like {"id": "provider-name", "config": {...}}',
          );
        }

        // Load the provider using the same logic as the main codebase
        let apiProvider;
        try {
          if (typeof providerToLoad === 'string') {
            apiProvider = await loadApiProvider(providerToLoad);
          } else {
            const providers = await loadApiProviders([providerToLoad]);
            apiProvider = providers[0];
          }
        } catch (error) {
          return createToolResponse(
            'test_ai_provider',
            false,
            undefined,
            `Failed to load provider "${providerId}": ${error instanceof Error ? error.message : 'Unknown error'}. Check provider ID format and credentials.`,
          );
        }

        if (!apiProvider) {
          return createToolResponse(
            'test_ai_provider',
            false,
            undefined,
            `Provider "${providerId}" could not be loaded. Verify the provider ID is correct and properly configured.`,
          );
        }

        // Test the provider with timeout and detailed metrics
        const startTime = Date.now();

        try {
          const response = await withTimeout(
            apiProvider.callApi(defaultPrompt),
            timeoutMs,
            `Provider test timed out after ${timeoutMs}ms`,
          );

          const endTime = Date.now();
          const responseTime = endTime - startTime;

          const testResult: TestResult = {
            providerId: typeof apiProvider.id === 'function' ? apiProvider.id() : apiProvider.id,
            success: true,
            responseTime,
            response: response.output,
            tokenUsage: response.tokenUsage,
            cost: response.cost,
            timedOut: false,
            metadata: {
              prompt: defaultPrompt,
              completedAt: new Date(endTime).toISOString(),
              model: (response as any).model || 'unknown',
              responseQuality: response.output?.length > 50 ? 'detailed' : 'brief',
            },
          };

          return createToolResponse('test_ai_provider', true, testResult);
        } catch (error) {
          const endTime = Date.now();
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          const timedOut = errorMessage.includes('timed out');

          const testResult: TestResult = {
            providerId: typeof apiProvider.id === 'function' ? apiProvider.id() : apiProvider.id,
            success: false,
            responseTime: endTime - startTime,
            error: errorMessage,
            timedOut,
            metadata: {
              prompt: defaultPrompt,
              failedAt: new Date(endTime).toISOString(),
              timeoutMs,
            },
          };

          return createToolResponse('test_ai_provider', false, testResult);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const providerId =
          typeof provider === 'string' ? provider : (provider as any).id || 'unknown';

        const testResult: TestResult = {
          providerId,
          success: false,
          error: `Unexpected error testing provider: ${errorMessage}`,
          timedOut: false,
        };

        return createToolResponse('test_ai_provider', false, testResult);
      }
    },
  );

  // Resources with proper namespacing
  server.resource('promptfoo-config', 'promptfoo://config/default', async () => {
    try {
      const { defaultConfig } = await loadDefaultConfig();
      return {
        contents: [
          {
            uri: 'promptfoo://config/default',
            text: JSON.stringify(defaultConfig, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: 'promptfoo://config/default',
            text: JSON.stringify(
              {
                error: `Failed to load default config: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  });

  server.resource('promptfoo-docs', 'promptfoo://docs/tools', async () => {
    const toolDocs = {
      tools: [
        {
          name: 'promptfoo_health_check',
          description: 'Check server health and status',
          parameters: 'none',
        },
        {
          name: 'list_evaluations',
          description: 'List all evaluations, optionally filtered by dataset ID',
          parameters: 'datasetId?: string',
        },
        {
          name: 'get_evaluation_details',
          description: 'Get detailed evaluation results by ID',
          parameters: 'id: string (required)',
        },
        {
          name: 'analyze_evaluation_metrics',
          description: 'Get summary statistics for an evaluation',
          parameters: 'id: string (required)',
        },
        {
          name: 'validate_promptfoo_config',
          description: 'Validate promptfoo configuration files using same logic as CLI validate',
          parameters: 'configPaths?: string[] (defaults to promptfooconfig.yaml)',
        },
        {
          name: 'test_ai_provider',
          description: 'Test provider connectivity and response quality with timeout support',
          parameters:
            'provider: string | object (required), testPrompt?: string, timeoutMs?: number (1000-300000)',
        },
        {
          name: 'get_test_prompts',
          description: 'Get prompts associated with a test case hash',
          parameters: 'sha256hash: string (required)',
        },
        {
          name: 'list_test_datasets',
          description: 'List all available datasets',
          parameters: 'none',
        },
      ],
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
    };

    return {
      contents: [
        {
          uri: 'promptfoo://docs/tools',
          text: JSON.stringify(toolDocs, null, 2),
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
