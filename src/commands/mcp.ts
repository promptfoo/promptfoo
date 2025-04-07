import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Command } from 'commander';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import { glob } from 'glob';
import yaml from 'js-yaml';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { fromError } from 'zod-validation-error';
import logger, { setLogLevel } from '../logger';
import telemetry from '../telemetry';
import { UnifiedConfigSchema } from '../types';
import { dereferenceConfig } from '../util/config/load';
import { isJavascriptFile } from '../util/file';

// Helper functions
function getResultsDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.promptfoo', 'results');
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir).filter((file) => file.endsWith('.json'));
}

async function readResult(filePath: string): Promise<any> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    logger.error(`Error reading result file ${filePath}: ${error}`);
    throw error;
  }
}

// Validate promptfoo config file
async function validateConfig(configPath: string): Promise<{
  isValid: boolean;
  errors?: string;
  config?: any;
}> {
  try {
    let config: any;
    const ext = path.parse(configPath).ext;

    if (ext === '.json' || ext === '.yaml' || ext === '.yml') {
      // Parse the config file
      const configData = yaml.load(fs.readFileSync(configPath, 'utf-8'));

      // Handle empty config or null
      if (!configData) {
        // Create a minimal valid config with required prompts property
        config = await dereferenceConfig({ prompts: [] });
      } else if (typeof configData === 'object') {
        // Ensure the config has the required prompts property
        const typedConfig = configData as any;
        if (!('prompts' in typedConfig)) {
          typedConfig.prompts = [];
        }
        config = await dereferenceConfig(typedConfig);
      } else {
        return {
          isValid: false,
          errors: `Invalid configuration format: expected an object, got ${typeof configData}`,
        };
      }
    } else if (isJavascriptFile(configPath)) {
      const importModule = (file: string) => import(file);
      config = await importModule(configPath);
    } else {
      return {
        isValid: false,
        errors: `Unsupported configuration file format: ${ext}`,
      };
    }

    // Handle both "providers" and legacy "targets"
    // Create a modified schema that allows both providers and targets
    const validationSchema = z
      .object({
        targets: z.array(z.any()).optional(),
        providers: z.array(z.any()).optional(),
        prompts: z.any(),
        // Other fields can be added as needed
      })
      .refine(
        (data: any) => {
          const hasTargets = Boolean(data.targets);
          const hasProviders = Boolean(data.providers);
          return (hasTargets && !hasProviders) || (!hasTargets && hasProviders);
        },
        {
          message: "Exactly one of 'targets' or 'providers' must be provided, but not both",
        },
      );

    const validationResult = validationSchema.safeParse(config);

    if (!validationResult.success) {
      return {
        isValid: false,
        errors: fromError(validationResult.error).message,
        config,
      };
    }

    return {
      isValid: true,
      config,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      isValid: false,
      errors: `Error validating config: ${errorMessage}`,
    };
  }
}

// Read and parse a config file
async function readConfigFile(configPath: string): Promise<any> {
  try {
    const ext = path.parse(configPath).ext;
    if (ext === '.json' || ext === '.yaml' || ext === '.yml') {
      const content = fs.readFileSync(configPath, 'utf-8');
      return yaml.load(content);
    } else if (isJavascriptFile(configPath)) {
      const importModule = (file: string) => import(file);
      return await importModule(configPath);
    }
    return null;
  } catch (error) {
    logger.error(`Error reading config file ${configPath}: ${error}`);
    return null;
  }
}

// Helper functions for processing configs
function getProvidersInfo(config: any) {
  if (!config.providers) {
    return [];
  }

  return config.providers.map((provider: any) => {
    if (typeof provider === 'string') {
      return { id: provider, type: 'string' };
    }

    return {
      id: provider.id || 'unknown',
      label: provider.label,
      type: 'object',
      config: provider.config,
      prompts: provider.prompts,
    };
  });
}

function getPromptsInfo(config: any) {
  if (!config.prompts) {
    return [];
  }

  if (typeof config.prompts === 'string') {
    return [{ source: config.prompts, type: 'file' }];
  }

  if (Array.isArray(config.prompts)) {
    return config.prompts.map((prompt: any) => {
      if (typeof prompt === 'string') {
        return { source: prompt, type: 'string' };
      }
      return {
        id: prompt.id,
        label: prompt.label,
        raw: prompt.raw
          ? prompt.raw.substring(0, 100) + (prompt.raw.length > 100 ? '...' : '')
          : undefined,
        type: 'object',
      };
    });
  }

  return Object.entries(config.prompts).map(([key, value]) => ({
    id: key,
    raw:
      typeof value === 'string'
        ? value.substring(0, 100) + (value.length > 100 ? '...' : '')
        : undefined,
    type: typeof value === 'string' ? 'string' : 'unknown',
  }));
}

function getTestsInfo(config: any) {
  if (!config.tests) {
    return [];
  }

  if (typeof config.tests === 'string') {
    return [{ source: config.tests, type: 'file' }];
  }

  if (Array.isArray(config.tests)) {
    return config.tests.map((test: any, index: number) => {
      if (typeof test === 'string') {
        return { description: test, type: 'string', index };
      }
      return {
        description: test.description,
        assert: test.assert
          ? Array.isArray(test.assert)
            ? `${test.assert.length} assertions`
            : 'has assertion'
          : undefined,
        vars: test.vars ? Object.keys(test.vars) : undefined,
        type: 'object',
        index,
      };
    });
  }

  return [];
}

// Start the MCP server
export async function startMcpServer(
  cmdObj: {
    port?: number | string;
    verbose?: boolean;
    transport?: 'stdio' | 'sse';
  } = {},
) {
  if (cmdObj.verbose) {
    setLogLevel('debug');
  }

  // Create an MCP server
  const server = new McpServer({
    name: 'promptfoo-mcp',
    version: '1.0.0',
    description: 'MCP server for promptfoo LLM evaluation and testing context',
  });

  // Health check tool
  server.tool('health', {}, async () => ({
    content: [{ type: 'text', text: JSON.stringify({ status: 'ok' }) }],
  }));

  // Schema retrieval tool
  server.tool('schema', {}, async () => {
    const schema = zodToJsonSchema(UnifiedConfigSchema, {
      name: 'PromptfooConfig',
      target: 'openApi3',
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(schema) }],
    };
  });

  // Validate config tool
  server.tool('validate-config', { configPath: z.string() }, async ({ configPath }) => {
    if (!fs.existsSync(configPath)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Config file not found: ${configPath}` }),
          },
        ],
        isError: true,
      };
    }

    const result = await validateConfig(configPath);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  });

  // Project analysis tool
  server.tool('analyze-project', { directory: z.string().optional() }, async ({ directory }) => {
    try {
      const workingDir = directory || process.cwd();
      const configFiles: string[] = [];

      // Common config filenames to look for
      const commonConfigNames = [
        'promptfooconfig.yaml',
        'promptfooconfig.yml',
        'promptfooconfig.json',
        'promptfoo.yaml',
        'promptfoo.yml',
        'promptfoo.json',
      ];

      // Check for common config files in the specified directory
      commonConfigNames.forEach((name) => {
        if (fs.existsSync(path.join(workingDir, name))) {
          configFiles.push(path.join(workingDir, name));
        }
      });

      // Find any config file in the directory with glob
      const additionalConfigs = glob.sync('**/*promptfoo*.{yaml,yml,json}', {
        cwd: workingDir,
        ignore: ['**/node_modules/**', '**/dist/**'],
      });

      additionalConfigs.forEach((configPath) => {
        const fullPath = path.join(workingDir, configPath);
        if (!configFiles.includes(fullPath)) {
          configFiles.push(fullPath);
        }
      });

      // Analyze each config file
      const configAnalysis = await Promise.all(
        configFiles.map(async (configPath) => {
          const result = await validateConfig(configPath);
          return {
            path: configPath,
            isValid: result.isValid,
            errors: result.errors,
            summary: result.isValid
              ? {
                  providers: result.config.providers ? result.config.providers.length : 0,
                  prompts: result.config.prompts
                    ? Array.isArray(result.config.prompts)
                      ? result.config.prompts.length
                      : 1
                    : 0,
                  tests: result.config.tests
                    ? Array.isArray(result.config.tests)
                      ? result.config.tests.length
                      : 1
                    : 0,
                  hasRedteam: !!result.config.redteam,
                }
              : undefined,
          };
        }),
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              configFiles: configAnalysis,
              projectRoot: workingDir,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: errorMessage }) }],
        isError: true,
      };
    }
  });

  // Get config details tool
  server.tool('get-config-details', { configPath: z.string() }, async ({ configPath }) => {
    try {
      if (!fs.existsSync(configPath)) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Config file not found: ${configPath}` }),
            },
          ],
          isError: true,
        };
      }

      const config = await readConfigFile(configPath);
      if (!config) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Failed to parse config file: ${configPath}` }),
            },
          ],
          isError: true,
        };
      }

      // Extract the most important information from the config
      const providersInfo = getProvidersInfo(config);
      const promptsInfo = getPromptsInfo(config);
      const testsInfo = getTestsInfo(config);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              path: configPath,
              providers: providersInfo,
              prompts: promptsInfo,
              tests: testsInfo,
              hasRedteam: !!config.redteam,
              description: config.description,
              metadata: config.metadata,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: errorMessage }) }],
        isError: true,
      };
    }
  });

  // List evaluations tool
  server.tool('list-evaluations', {}, async () => {
    try {
      const resultsDir = getResultsDir();
      const files = listFiles(resultsDir);

      const evaluations = await Promise.all(
        files.map(async (file) => {
          try {
            const result = await readResult(path.join(resultsDir, file));
            const createdAt = new Date(result.createdAt);

            return {
              id: path.basename(file, '.json'),
              createdAt: createdAt.toISOString(),
              timestamp: createdAt.getTime(),
              numTests: result.results?.length || 0,
              description: result.config?.description || null,
              isRedteam: !!result.config?.redteam,
            };
          } catch (error) {
            logger.debug(`Error reading result file ${file}: ${error}`);
            return null;
          }
        }),
      );

      // Filter out null values and sort by timestamp (newest first)
      const validEvaluations = evaluations
        .filter((e): e is NonNullable<typeof e> => e !== null)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ evaluations: validEvaluations }),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: errorMessage }) }],
        isError: true,
      };
    }
  });

  // Get evaluation details tool
  server.tool('get-evaluation', { id: z.string() }, async ({ id }) => {
    try {
      const resultsDir = getResultsDir();
      const filePath = path.join(resultsDir, `${id}.json`);

      if (!fs.existsSync(filePath)) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Evaluation result not found: ${id}` }),
            },
          ],
          isError: true,
        };
      }

      const result = await readResult(filePath);

      // Extract summary data to reduce payload size
      const summary = {
        id,
        createdAt: result.createdAt,
        stats: result.results?.stats,
        config: {
          description: result.config?.description,
          providers: result.config?.providers
            ? Array.isArray(result.config.providers)
              ? result.config.providers.length
              : 1
            : 0,
          prompts: result.prompts?.length || 0,
          tests: result.results?.length || 0,
          isRedteam: !!result.config?.redteam,
          metadata: result.config?.metadata,
        },
        // Include high-level test results
        results:
          result.results?.results?.map((r: any) => ({
            id: r.id,
            promptId: r.promptId,
            promptLabel: r.prompt?.label,
            provider: r.provider?.label || r.provider?.id,
            success: r.success,
            score: r.score,
            error: r.error,
            failureReason: r.failureReason,
          })) || [],
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(summary) }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: errorMessage }) }],
        isError: true,
      };
    }
  });

  // Run evaluation tool
  server.tool(
    'run-eval',
    {
      configPath: z.string(),
      maxConcurrency: z.number().int().positive().optional(),
      delay: z.number().int().nonnegative().optional(),
      repeat: z.number().int().positive().optional(),
      cache: z.boolean().optional(),
      filterProviders: z.string().optional(),
      filterPattern: z.string().optional(),
    },
    async ({
      configPath,
      maxConcurrency,
      delay,
      repeat,
      cache,
      filterProviders,
      filterPattern,
    }) => {
      try {
        // Import required modules
        const { doEval } = await import('../commands/eval');

        if (!fs.existsSync(configPath)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: `Config file not found: ${configPath}` }),
              },
            ],
            isError: true,
          };
        }

        logger.info(`Running evaluation with config: ${configPath}`);

        // Create command line options object with proper typing
        const cmdObj: any = {
          config: [configPath],
          write: true,
          table: false,
        };

        // Add optional parameters if they are defined
        if (maxConcurrency !== undefined) {
          cmdObj.maxConcurrency = maxConcurrency;
        }
        if (delay !== undefined) {
          cmdObj.delay = delay;
        }
        if (repeat !== undefined) {
          cmdObj.repeat = repeat;
        }
        if (cache !== undefined) {
          cmdObj.cache = cache;
        }
        if (filterProviders !== undefined) {
          cmdObj.filterProviders = filterProviders;
        }
        if (filterPattern !== undefined) {
          cmdObj.filterPattern = filterPattern;
        }

        // Run the evaluation
        const evaluateOptions: any = {
          showProgressBar: false,
        };

        const evalResults = await doEval(
          cmdObj,
          {}, // No default config
          undefined, // No default config path
          evaluateOptions,
        );

        // Create a safe response
        const safeResponse = {
          message: 'Evaluation completed successfully',
          evalId: evalResults.id,
          summary: {
            id: evalResults.id,
            createdAt: evalResults.createdAt,
            numTests: evalResults.results ? evalResults.results.length : 0,
            // Include only basic information to avoid type errors
            config: {
              description: evalResults.config?.description,
              providersCount: evalResults.config?.providers
                ? Array.isArray(evalResults.config.providers)
                  ? evalResults.config.providers.length
                  : 1
                : 0,
            },
          },
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(safeResponse),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error running evaluation: ${errorMessage}`);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Failed to run evaluation: ${errorMessage}` }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Connect using the appropriate transport
  if (cmdObj.transport === 'sse') {
    // Set up an Express server for SSE transport
    const port =
      typeof cmdObj.port === 'string'
        ? Number.parseInt(cmdObj.port, 10)
        : cmdObj.port ||
          (process.env.PROMPTFOO_MCP_PORT
            ? Number.parseInt(process.env.PROMPTFOO_MCP_PORT || '', 10)
            : 3991);

    if (Number.isNaN(port)) {
      throw new Error(`Invalid port number: ${cmdObj.port}`);
    }

    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '50mb' }));

    // to support multiple simultaneous connections we have a lookup object from
    // sessionId to transport
    const transports: { [sessionId: string]: SSEServerTransport } = {};

    app.get('/sse', async (_, res) => {
      const transport = new SSEServerTransport('/messages', res);
      transports[transport.sessionId] = transport;
      res.on('close', () => {
        delete transports[transport.sessionId];
      });
      await server.connect(transport);
    });

    app.post('/messages', async (req, res) => {
      const sessionId = req.query.sessionId as string;
      const transport = transports[sessionId];
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(400).send('No transport found for sessionId');
      }
    });

    app.listen(port, () => {
      logger.info(`promptfoo MCP server running with SSE transport at http://localhost:${port}`);

      telemetry.record('command_used', {
        name: 'mcp',
        port,
        transport: 'sse',
      });
      telemetry.send();
    });
  } else {
    // Default to stdio transport
    const transport = new StdioServerTransport();
    logger.info('promptfoo MCP server running with stdio transport');

    telemetry.record('command_used', {
      name: 'mcp',
      transport: 'stdio',
    });
    telemetry.send();

    await server.connect(transport);
  }
}

export default function registerMcpCommand(program: Command): void {
  program
    .command('mcp')
    .description('Start the Model Context Protocol (MCP) server for promptfoo')
    .addCommand(
      new Command('start')
        .description('Start the MCP server')
        .option('-p, --port <port>', 'Port to run the MCP server on', (val) =>
          Number.parseInt(val, 10),
        )
        .option('-v, --verbose', 'Enable verbose logging')
        .option('-t, --transport <transport>', 'Transport to use: stdio or sse', 'stdio')
        .action((cmdObj) => {
          startMcpServer(cmdObj).catch((error) => {
            logger.error(`Failed to start MCP server: ${error}`);
            process.exit(1);
          });
        }),
    );
}
