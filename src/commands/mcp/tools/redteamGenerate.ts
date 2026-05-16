import dedent from 'dedent';
import { z } from 'zod';
import { DEFAULT_MAX_CONCURRENCY } from '../../../constants';
import logger from '../../../logger';
import { doGenerateRedteam } from '../../../redteam/commands/generate';
import {
  ADDITIONAL_STRATEGIES,
  DEFAULT_STRATEGIES,
  ADDITIONAL_PLUGINS as REDTEAM_ADDITIONAL_PLUGINS,
  DEFAULT_PLUGINS as REDTEAM_DEFAULT_PLUGINS,
  REDTEAM_MODEL,
} from '../../../redteam/constants';
import { loadDefaultConfig } from '../../../util/config/default';
import { RedteamGenerateOptionsSchema } from '../../../validators/redteam';
import { createToolResponse, DEFAULT_TOOL_TIMEOUT_MS, withTimeout } from '../lib/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolResult } from '../lib/types';

import type { RedteamCliGenerateOptions } from '../../../redteam/types';

type RedteamGenerateArgs = {
  configPath?: string;
  output?: string;
  purpose?: string;
  plugins?: string[];
  strategies?: string[];
  numTests?: number;
  maxConcurrency?: number;
  delay?: number;
  language?: string;
  provider?: string;
  force?: boolean;
  write?: boolean;
  remote?: boolean;
  progressBar?: boolean;
};

type LoadedGenerateConfig =
  | {
      ok: true;
      defaultConfig: Awaited<ReturnType<typeof loadDefaultConfig>>['defaultConfig'];
      defaultConfigPath: Awaited<ReturnType<typeof loadDefaultConfig>>['defaultConfigPath'];
    }
  | { ok: false; error: ToolResult };

async function loadGenerateConfig(): Promise<LoadedGenerateConfig> {
  try {
    const { defaultConfig, defaultConfigPath } = await loadDefaultConfig();
    return { ok: true, defaultConfig, defaultConfigPath };
  } catch (error) {
    return {
      ok: false,
      error: createToolResponse(
        'redteam_generate',
        false,
        undefined,
        `Failed to load default config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ),
    };
  }
}

function buildGenerateOptions(
  args: RedteamGenerateArgs,
  loadedConfig: Extract<LoadedGenerateConfig, { ok: true }>,
): Partial<RedteamCliGenerateOptions> {
  const {
    configPath,
    output,
    purpose,
    plugins,
    strategies,
    numTests,
    maxConcurrency = DEFAULT_MAX_CONCURRENCY,
    delay,
    language,
    provider,
    force = false,
    write = false,
    remote = false,
    progressBar = true,
  } = args;
  return {
    config: configPath,
    output: output || (write ? undefined : 'redteam.yaml'),
    purpose,
    plugins: plugins?.map((plugin) => ({ id: plugin })),
    strategies,
    numTests,
    maxConcurrency,
    delay,
    language,
    provider,
    force,
    write,
    remote,
    progressBar,
    cache: true,
    defaultConfig: loadedConfig.defaultConfig,
    defaultConfigPath: loadedConfig.defaultConfigPath,
  };
}

function getGeneratedMetadata(result: any, fallbackPurpose?: string) {
  if (
    result.defaultTest &&
    typeof result.defaultTest === 'object' &&
    'metadata' in result.defaultTest
  ) {
    return {
      purpose: result.defaultTest.metadata?.purpose,
      entities: result.defaultTest.metadata?.entities || [],
    };
  }
  return {
    purpose: fallbackPurpose,
    entities: [],
  };
}

function getAttackPreview(attack: unknown) {
  if (!attack) {
    return 'N/A';
  }
  if (typeof attack === 'string') {
    return attack.slice(0, 100) + (attack.length > 100 ? '...' : '');
  }
  const serialized = JSON.stringify(attack);
  return serialized ? serialized.slice(0, 100) : String(attack).slice(0, 100);
}

function buildRedteamGenerateData(
  args: RedteamGenerateArgs,
  result: any,
  startTime: number,
  endTime: number,
) {
  const {
    configPath,
    output,
    purpose,
    plugins,
    strategies,
    numTests,
    maxConcurrency = DEFAULT_MAX_CONCURRENCY,
    delay,
    language,
    provider,
    force = false,
    write = false,
    remote = false,
  } = args;
  const metadata = getGeneratedMetadata(result, purpose);
  const tests = Array.isArray(result.tests) ? result.tests : [];

  return {
    generation: {
      status: 'completed',
      duration: endTime - startTime,
      timestamp: new Date().toISOString(),
      configPath: configPath || 'promptfooconfig.yaml',
      outputPath: output || (write ? 'written to config' : 'redteam.yaml'),
    },
    configuration: {
      purpose: metadata.purpose,
      plugins: plugins || Array.from(REDTEAM_DEFAULT_PLUGINS).map((plugin) => plugin),
      strategies: strategies || Array.from(DEFAULT_STRATEGIES).map((strategy) => strategy),
      numTests,
      maxConcurrency,
      delay,
      language,
      provider: provider || REDTEAM_MODEL,
      force,
      write,
      remote,
    },
    results: {
      totalTestCases: tests.length,
      testCasesByPlugin: tests.reduce((acc: Record<string, number>, test: any) => {
        const plugin = test.metadata?.plugin || 'unknown';
        acc[plugin] = (acc[plugin] || 0) + 1;
        return acc;
      }, {}),
      sampleTestCases: tests.slice(0, 5).map((test: any, index: number) => ({
        index,
        description: test.description || 'No description',
        plugin: test.metadata?.plugin || 'unknown',
        strategy: test.metadata?.strategy || 'unknown',
        vars: test.vars ? Object.keys(test.vars).slice(0, 3) : [],
        attack: getAttackPreview(test.vars?.attack),
      })),
    },
    metadata: {
      purpose: metadata.purpose,
      entities: metadata.entities,
      generatedAt: new Date().toISOString(),
      language,
      provider: provider || REDTEAM_MODEL,
    },
    nextSteps: {
      runEvaluation: write
        ? 'Run "redteam_run" to execute the generated tests'
        : `Run "redteam_run" with output: "${output || 'redteam.yaml'}" to execute the tests`,
      viewConfig: write
        ? `Generated tests were added to your config file: ${configPath || 'promptfooconfig.yaml'}`
        : `Generated tests were written to: ${output || 'redteam.yaml'}`,
    },
  };
}

function buildRedteamGenerateErrorResponse(args: RedteamGenerateArgs, error: unknown) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
  logger.error(`Redteam generation failed: ${errorMessage}`);
  if (errorMessage.includes('timed out')) {
    return createToolResponse(
      'redteam_generate',
      false,
      {
        originalError: errorMessage,
        suggestion:
          'The generation took too long. Try reducing numTests, checking API credentials, or using fewer plugins.',
      },
      'Redteam test generation timed out',
    );
  }
  return createToolResponse('redteam_generate', false, {
    configuration: {
      configPath: args.configPath || 'promptfooconfig.yaml',
      output: args.output,
      purpose: args.purpose,
      plugins: args.plugins,
      numTests: args.numTests,
    },
    error: errorMessage,
    troubleshooting: {
      commonIssues: [
        'Configuration file not found or invalid format',
        'Invalid plugin or strategy names specified',
        'Provider authentication or configuration errors',
        'Network connectivity issues',
        'Insufficient permissions to write output files',
      ],
      configurationTips: [
        'Ensure your config file exists or use standalone generation with "purpose"',
        'Use valid plugin names from the supported list',
        'Check that provider credentials are properly configured',
        'Verify write permissions for output directory',
      ],
      supportedPlugins: Array.from(REDTEAM_DEFAULT_PLUGINS)
        .concat(Array.from(REDTEAM_ADDITIONAL_PLUGINS))
        .sort(),
      supportedStrategies: (
        [...Array.from(DEFAULT_STRATEGIES), ...Array.from(ADDITIONAL_STRATEGIES)] as string[]
      ).sort(),
      exampleUsage: {
        basic: '{"purpose": "Test my chatbot", "plugins": ["harmful", "pii"]}',
        withOutput:
          '{"purpose": "Banking chatbot", "output": "./bank-redteam.yaml", "numTests": 20}',
        writeToConfig: '{"configPath": "./my-config.yaml", "write": true, "force": true}',
      },
    },
  });
}

/**
 * Generate adversarial test cases for redteam security testing
 *
 * Use this tool to:
 * - Create targeted attack probes for AI vulnerability testing
 * - Generate test cases for specific security plugins and strategies
 * - Create custom adversarial examples for your application domain
 * - Build comprehensive test suites for AI safety validation
 *
 * Features:
 * - Multiple attack plugins (harmful content, PII, prompt injection, etc.)
 * - Configurable attack strategies and generation parameters
 * - Support for custom test generation instructions
 * - Output in various formats (YAML, Burp Suite, etc.)
 *
 * Perfect for:
 * - Building custom redteam test suites
 * - Generating domain-specific attack vectors
 * - Creating test cases for specific compliance requirements
 * - Preparing for security audits and penetration testing
 */
export function registerRedteamGenerateTool(server: McpServer) {
  server.tool(
    'redteam_generate',
    {
      configPath: z
        .string()
        .optional()
        .describe(
          dedent`
            Path to the promptfoo configuration file.
            Defaults to "promptfooconfig.yaml" in current directory.
            Example: "./my-config.yaml"
          `,
        ),
      output: z
        .string()
        .optional()
        .describe(
          dedent`
            Path to output file for generated tests.
            Defaults to "redteam.yaml" in current directory.
            Example: "./my-redteam-tests.yaml"
          `,
        ),
      purpose: z
        .string()
        .optional()
        .describe(
          dedent`
            Describe the purpose/domain of your AI system.
            This helps generate more targeted attack vectors.
            Example: "Customer service chatbot for banking"
          `,
        ),
      plugins: z
        .array(z.string())
        .optional()
        .describe(
          dedent`
            List of redteam plugins to use for generating attacks.
            
            Default plugins: ${Array.from(REDTEAM_DEFAULT_PLUGINS).sort().join(', ')}
            
            Additional plugins: ${Array.from(REDTEAM_ADDITIONAL_PLUGINS).sort().join(', ')}
            
            Example: ["harmful", "pii", "prompt-injection"]
          `,
        ),
      strategies: z
        .array(z.string())
        .optional()
        .describe(
          dedent`
            List of attack strategies to use.
            
            Default strategies: ${Array.from(DEFAULT_STRATEGIES).sort().join(', ')}
            
            Additional strategies: ${Array.from(ADDITIONAL_STRATEGIES).sort().join(', ')}
            
            Example: ["jailbreak", "prompt-injection"]
          `,
        ),
      numTests: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe('Number of test cases to generate per plugin (1-100)'),
      maxConcurrency: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .prefault(DEFAULT_MAX_CONCURRENCY)
        .describe('Maximum number of concurrent API calls (1-10)'),
      delay: z.number().min(0).optional().describe('Delay in milliseconds between API calls'),
      language: z
        .string()
        .optional()
        .describe(
          dedent`
            Language for generated test cases.
            Example: "English", "Spanish", "French"
          `,
        ),
      provider: z
        .string()
        .optional()
        .describe(
          dedent`
            Provider to use for generating adversarial tests.
            Defaults to: ${REDTEAM_MODEL}
            Example: "openai:gpt-4-turbo"
          `,
        ),
      force: z
        .boolean()
        .optional()
        .prefault(false)
        .describe('Force generation even if no changes are detected'),
      write: z
        .boolean()
        .optional()
        .prefault(false)
        .describe('Write results to the promptfoo configuration file instead of separate output'),
      remote: z
        .boolean()
        .optional()
        .prefault(false)
        .describe('Force remote inference wherever possible'),
      progressBar: z
        .boolean()
        .optional()
        .prefault(true)
        .describe('Show progress bar during generation'),
    },
    async (args) => {
      try {
        const loadedConfig = await loadGenerateConfig();
        if (!loadedConfig.ok) {
          return loadedConfig.error;
        }
        const options = buildGenerateOptions(args, loadedConfig);
        const optionsParse = RedteamGenerateOptionsSchema.safeParse(options);
        if (!optionsParse.success) {
          return createToolResponse(
            'redteam_generate',
            false,
            undefined,
            `Options validation error: ${z.prettifyError(optionsParse.error)}`,
          );
        }
        const { configPath } = args;
        logger.debug(
          `Generating redteam tests with config: ${configPath || 'promptfooconfig.yaml'}`,
        );
        const startTime = Date.now();
        const result = await withTimeout(
          doGenerateRedteam(optionsParse.data),
          DEFAULT_TOOL_TIMEOUT_MS,
          'Redteam test generation timed out. This may indicate provider connectivity issues, missing API credentials, or too many tests requested.',
        );
        const endTime = Date.now();

        if (!result) {
          return createToolResponse(
            'redteam_generate',
            false,
            undefined,
            'Test case generation completed but no results were returned. This may indicate configuration issues or that no test cases could be generated.',
          );
        }
        return createToolResponse(
          'redteam_generate',
          true,
          buildRedteamGenerateData(args, result, startTime, endTime),
        );
      } catch (error: unknown) {
        return buildRedteamGenerateErrorResponse(args, error);
      }
    },
  );
}
