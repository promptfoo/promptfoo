import dedent from 'dedent';
import { z } from 'zod';
import { DEFAULT_MAX_CONCURRENCY } from '../../../constants';
import logger from '../../../logger';
import { doRedteamRun } from '../../../redteam/shared';
import { loadDefaultConfig } from '../../../util/config/default';
import { createToolResponse, DEFAULT_TOOL_TIMEOUT_MS, withTimeout } from '../lib/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { RedteamRunOptions } from '../../../redteam/types';

/**
 * Run a redteam scan to test AI systems for vulnerabilities
 *
 * Use this tool to:
 * - Execute comprehensive security testing against AI applications
 * - Generate and run adversarial test cases automatically
 * - Test for jailbreaks, prompt injections, and harmful outputs
 * - Validate AI safety guardrails and content filters
 *
 * The redteam run performs a two-step process:
 * 1. Generates dynamic attack probes tailored to your target application
 * 2. Evaluates the generated probes against your target application
 *
 * Perfect for:
 * - Security auditing of AI systems
 * - Compliance testing and safety validation
 * - Red team exercises and penetration testing
 * - Finding vulnerabilities before deployment
 */
export function registerRedteamRunTool(server: McpServer) {
  server.tool(
    'redteam_run',
    {
      configPath: z
        .string()
        .optional()
        .describe(
          dedent`
            Path to the promptfoo configuration file.
            Defaults to "promptfooconfig.yaml" in current directory.
            Example: "./my-redteam-config.yaml"
          `,
        ),
      output: z
        .string()
        .optional()
        .describe(
          dedent`
            Path to output file for generated tests.
            Defaults to "redteam.yaml" in the same directory as the config file.
            Example: "./my-redteam-tests.yaml"
          `,
        ),
      force: z
        .boolean()
        .optional()
        .prefault(false)
        .describe('Force generation even if no changes are detected'),
      maxConcurrency: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .prefault(DEFAULT_MAX_CONCURRENCY)
        .describe('Maximum number of concurrent API calls (1-10)'),
      delay: z.number().min(0).optional().describe('Delay in milliseconds between API calls'),
      filterPrompts: z
        .string()
        .optional()
        .describe(
          dedent`
            Only run tests with prompts whose id or label matches the regex pattern.
            Example: "prompt-.*" to test only prompts starting with "prompt-"
          `,
        ),
      filterProviders: z
        .string()
        .optional()
        .describe(
          dedent`
            Only run tests with these providers (regex pattern).
            Example: "openai|anthropic" to test only OpenAI and Anthropic providers
          `,
        ),
      remote: z
        .boolean()
        .optional()
        .prefault(false)
        .describe('Force remote inference wherever possible'),
      progressBar: z
        .boolean()
        .optional()
        .prefault(true)
        .describe('Show progress bar during execution'),
    },
    async (args) => {
      try {
        const {
          configPath,
          output,
          force = false,
          maxConcurrency = DEFAULT_MAX_CONCURRENCY,
          delay,
          filterPrompts,
          filterProviders,
          remote = false,
          progressBar = true,
        } = args;

        // Load default config
        try {
          await loadDefaultConfig();
        } catch (error) {
          return createToolResponse(
            'redteam_run',
            false,
            undefined,
            `Failed to load default config: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }

        // Prepare redteam options
        const options: RedteamRunOptions = {
          config: configPath,
          output,
          force,
          maxConcurrency,
          delay,
          filterPrompts,
          filterProviders,
          remote,
          progressBar,
          cache: true,
          verbose: false,
        };

        logger.debug(`Running redteam scan with config: ${configPath || 'promptfooconfig.yaml'}`);

        // Run the redteam scan with timeout protection
        const startTime = Date.now();
        const evalResult = await withTimeout(
          doRedteamRun(options),
          DEFAULT_TOOL_TIMEOUT_MS,
          'Redteam scan timed out. This may indicate provider connectivity issues, missing API credentials, or a very large test suite.',
        );
        const endTime = Date.now();

        if (!evalResult) {
          return createToolResponse(
            'redteam_run',
            false,
            undefined,
            'Redteam scan completed but no results were generated. This may indicate no test cases were created or no vulnerabilities were found.',
          );
        }

        // Get summary data
        const summary = await evalResult.toEvaluateSummary();

        // Prepare detailed response
        const scanData = {
          scan: {
            id: evalResult.id,
            status: 'completed',
            duration: endTime - startTime,
            timestamp: new Date().toISOString(),
            configPath: configPath || 'promptfooconfig.yaml',
            outputPath: output || 'redteam.yaml',
          },
          configuration: {
            force,
            maxConcurrency,
            delay,
            filterProviders,
            remote,
          },
          results: {
            stats: summary.stats,
            totalTests: summary.results.length,
            successRate:
              summary.results.length > 0
                ? ((summary.stats.successes / summary.results.length) * 100).toFixed(1) + '%'
                : '0%',
            failureRate:
              summary.results.length > 0
                ? ((summary.stats.failures / summary.results.length) * 100).toFixed(1) + '%'
                : '0%',
            vulnerabilities: summary.results.filter((r) => !r.success).length,
            findings: summary.results
              .filter((r) => !r.success)
              .slice(0, 10) // Show first 10 failures as sample findings
              .map((result, index) => ({
                index,
                severity: result.namedScores?.severity || 'unknown',
                plugin: result.testCase.metadata?.plugin || 'unknown',
                description: result.testCase.description || 'No description',
                attack:
                  typeof result.vars?.attack === 'string'
                    ? result.vars.attack.slice(0, 100) +
                      (result.vars.attack.length > 100 ? '...' : '')
                    : 'N/A',
                response: result.response?.output
                  ? typeof result.response.output === 'string'
                    ? result.response.output.slice(0, 200) +
                      (result.response.output.length > 200 ? '...' : '')
                    : JSON.stringify(result.response.output).slice(0, 200)
                  : null,
                failureReason: result.failureReason
                  ? String(result.failureReason).slice(0, 150) +
                    (String(result.failureReason).length > 150 ? '...' : '')
                  : '',
              })),
          },
          evaluation: {
            totalEvals: summary.results.length,
            passedEvals: summary.stats.successes,
            failedEvals: summary.stats.failures,
            errorEvals: summary.stats.errors || 0,
            hasVulnerabilities: summary.stats.failures > 0,
            riskLevel:
              summary.stats.failures === 0
                ? 'Low'
                : summary.stats.failures / summary.results.length > 0.3
                  ? 'High'
                  : summary.stats.failures / summary.results.length > 0.1
                    ? 'Medium'
                    : 'Low',
          },
        };

        return createToolResponse('redteam_run', true, scanData);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error(`Redteam scan failed: ${errorMessage}`);

        // Handle timeout specifically
        if (errorMessage.includes('timed out')) {
          return createToolResponse(
            'redteam_run',
            false,
            {
              originalError: errorMessage,
              suggestion:
                'The scan took too long. Try reducing the test scope, checking API credentials, or increasing timeout.',
            },
            'Redteam scan timed out',
          );
        }

        const errorData = {
          configuration: {
            configPath: args.configPath || 'promptfooconfig.yaml',
            output: args.output,
            force: args.force,
            maxConcurrency: args.maxConcurrency,
          },
          error: errorMessage,
          troubleshooting: {
            commonIssues: [
              'Configuration file not found or invalid format',
              'No redteam configuration in config file',
              'Provider authentication or configuration errors',
              'Insufficient test cases generated',
              'Network connectivity issues',
              'API rate limiting or quota exceeded',
            ],
            configurationTips: [
              'Ensure your config file has a "redteam" section with plugins and targets',
              'Check that provider credentials are properly configured',
              'Verify your targets/providers have proper labels',
              'Consider running "promptfoo redteam init" to create a proper config',
            ],
            exampleConfig: {
              basic: dedent`
                redteam:
                  purpose: "Test my chatbot for safety issues"
                  plugins: ["harmful", "pii", "prompt-injection"]
                targets:
                  - id: "my-model"
                    config:
                      provider: "openai:gpt-4"
              `,
            },
          },
        };

        return createToolResponse('redteam_run', false, errorData);
      }
    },
  );
}
