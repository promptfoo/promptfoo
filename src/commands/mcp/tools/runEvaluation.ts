import dedent from 'dedent';
import { z } from 'zod';
import cliState from '../../../cliState';
import logger from '../../../logger';
import { doEval } from '../../../node/doEval';
import { loadDefaultConfig } from '../../../util/config/default';
import { filterPrompts } from '../../../util/eval/filterPrompts';
import { escapeRegExp } from '../../../util/text';
import { formatEvaluationResults, formatPromptsSummary } from '../lib/resultFormatter';
import { createToolResponse } from '../lib/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { TestSuite } from '../../../types/index';
import type { InternalEvaluateOptions } from '../../../types/internal';

/**
 * Run an eval from a promptfoo config with optional test case filtering
 *
 * Use this tool to:
 * - Test specific test cases from a promptfoo configuration
 * - Debug individual test scenarios without running full evals
 * - Validate changes to prompts, providers, or assertions quickly
 * - Run targeted evals during development and testing
 *
 * Features:
 * - Load any promptfoo configuration file
 * - Select specific test cases by index or range
 * - Filter by specific prompts and/or providers
 * - Run full eval pipeline with all assertions and scoring
 * - Return detailed results with metrics and grading information
 *
 * Perfect for:
 * - Debugging failing test cases
 * - Testing prompt variations quickly
 * - Validating assertion configurations
 * - Development iteration and experimentation
 */
export function registerRunEvaluationTool(server: McpServer) {
  server.tool(
    'run_evaluation',
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
      testCaseIndices: z
        .union([
          z.number(),
          z.array(z.number()),
          z.object({
            start: z.number().describe('Start index (inclusive)'),
            end: z.number().describe('End index (exclusive)'),
          }),
        ])
        .optional()
        .describe(
          dedent`
            Specify which test cases to run:
            - Single zero-based index: 0
            - Multiple indices: [0, 2, 5]  
            - Range with inclusive start and exclusive end: {"start": 0, "end": 3}
            If not specified, runs all test cases.
          `,
        ),
      promptFilter: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          dedent`
            Filter prompts by id/label (regex match) or index (numeric strings).
            Examples: "my-prompt", "prompt.*", ["morning", "evening"], "0", ["0", "2"]
          `,
        ),
      providerFilter: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe(
          dedent`
            Filter to specific providers by ID.
            Examples: "openai:gpt-4", ["openai:gpt-4", "anthropic:claude-sonnet-4-6"]
          `,
        ),
      maxConcurrency: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe('Maximum concurrent evals (1-20, default: 4)'),
      timeoutMs: z
        .number()
        .min(1000)
        .max(300000)
        .optional()
        .describe('Timeout per eval in milliseconds (1s-5min, default: 30s)'),
      repeat: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .describe('Number of times to repeat the evaluation (1-10)'),
      delay: z.number().min(0).optional().describe('Delay in milliseconds between API calls'),
      cache: z.boolean().optional().prefault(true).describe('Enable caching of results'),
      write: z.boolean().optional().prefault(false).describe('Write results to database'),
      share: z.boolean().optional().prefault(false).describe('Create shareable URL for results'),
      resultLimit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of results to return (1-100, default: 20)'),
      resultOffset: z
        .number()
        .min(0)
        .optional()
        .describe('Number of results to skip for pagination (default: 0)'),
    },
    async (args) => {
      try {
        const {
          configPath,
          testCaseIndices,
          promptFilter,
          providerFilter,
          maxConcurrency = 4,
          timeoutMs,
          repeat = 1,
          delay,
          cache = true,
          write = false,
          share = false,
          resultLimit = 20,
          resultOffset = 0,
        } = args;

        // Load default config
        let defaultConfig;
        let defaultConfigPath;
        try {
          const result = await loadDefaultConfig();
          defaultConfig = result.defaultConfig;
          defaultConfigPath = result.defaultConfigPath;
        } catch (error) {
          return createToolResponse(
            'run_evaluation',
            false,
            undefined,
            `Failed to load default config: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }

        // Check if promptFilter contains numeric indices (backwards compatibility)
        const promptFilters = promptFilter
          ? Array.isArray(promptFilter)
            ? promptFilter
            : [promptFilter]
          : null;

        // Validate mixed input: error if both numeric and non-numeric filters are present
        if (promptFilters && promptFilters.length > 1) {
          const hasNumeric = promptFilters.some((f) => /^\d+$/.test(f));
          const hasNonNumeric = promptFilters.some((f) => !/^\d+$/.test(f));

          if (hasNumeric && hasNonNumeric) {
            return createToolResponse(
              'run_evaluation',
              false,
              undefined,
              'Cannot mix numeric indices and regex patterns in promptFilter. Use either all numeric indices (e.g., ["0", "2"]) or all regex patterns (e.g., ["morning.*", "evening.*"]), but not both.',
            );
          }
        }

        const hasNumericPromptFilter = promptFilters && promptFilters.every((f) => /^\d+$/.test(f));

        let selection: { original: TestSuite; filtered: TestSuite } | undefined;
        const prepareTestSuite =
          testCaseIndices !== undefined || promptFilter || providerFilter
            ? (testSuite: TestSuite): TestSuite => {
                const filteredTestSuite = { ...testSuite };

                if (providerFilter) {
                  const filters = Array.isArray(providerFilter) ? providerFilter : [providerFilter];
                  const filterPattern = new RegExp(filters.map(escapeRegExp).join('|'), 'i');

                  const providers = filteredTestSuite.providers || [];
                  if (providers.length === 0) {
                    throw new Error(
                      'No providers defined in configuration. Add providers to filter.',
                    );
                  }

                  const filteredProviders = providers.filter((provider) => {
                    const providerId =
                      typeof provider.id === 'function' ? provider.id() : provider.id;
                    const label = provider.label || providerId || '';
                    return filterPattern.test(label) || filterPattern.test(providerId || '');
                  });

                  if (filteredProviders.length === 0) {
                    throw new Error(
                      `No providers matched filter: ${filters.join(', ')}. Available providers: ${providers.map((p) => (typeof p.id === 'function' ? p.id() : p.id)).join(', ')}`,
                    );
                  }

                  filteredTestSuite.providers = filteredProviders;
                }

                if (promptFilter) {
                  if (hasNumericPromptFilter && promptFilters) {
                    const indices = promptFilters.map((f) => parseInt(f, 10));
                    const prompts = testSuite.prompts || [];

                    const invalidIndices = indices.filter((i) => i < 0 || i >= prompts.length);
                    if (invalidIndices.length > 0) {
                      throw new Error(
                        `Invalid prompt indices: ${invalidIndices.join(', ')}. Available indices: 0-${prompts.length - 1}`,
                      );
                    }

                    filteredTestSuite.prompts = indices.map((i) => prompts[i]);
                  } else {
                    const filterPattern = Array.isArray(promptFilter)
                      ? promptFilter.join('|')
                      : promptFilter;

                    try {
                      filteredTestSuite.prompts = filterPrompts(testSuite.prompts, filterPattern);
                    } catch (error) {
                      throw new Error(
                        error instanceof Error ? error.message : 'Failed to filter prompts',
                      );
                    }

                    if (filteredTestSuite.prompts.length === 0) {
                      throw new Error(
                        `No prompts found after applying filter: ${Array.isArray(promptFilter) ? promptFilter.join(', ') : promptFilter}`,
                      );
                    }
                  }
                }

                if (testCaseIndices !== undefined && filteredTestSuite.tests) {
                  let filteredTests = filteredTestSuite.tests;

                  if (typeof testCaseIndices === 'number') {
                    if (testCaseIndices < 0 || testCaseIndices >= filteredTests.length) {
                      throw new Error(
                        `Test case index ${testCaseIndices} is out of range. Available indices: 0-${filteredTests.length - 1}`,
                      );
                    }
                    filteredTests = [filteredTests[testCaseIndices]];
                  } else if (Array.isArray(testCaseIndices)) {
                    const invalidIndices = testCaseIndices.filter(
                      (i) => i < 0 || i >= filteredTests.length,
                    );
                    if (invalidIndices.length > 0) {
                      throw new Error(
                        `Invalid test case indices: ${invalidIndices.join(', ')}. Available indices: 0-${filteredTests.length - 1}`,
                      );
                    }
                    filteredTests = testCaseIndices.map((i) => filteredTests[i]);
                  } else {
                    const { start, end } = testCaseIndices;
                    if (start < 0 || end > filteredTests.length || start >= end) {
                      throw new Error(
                        `Invalid range: start=${start}, end=${end}. Available indices: 0-${filteredTests.length - 1}`,
                      );
                    }
                    filteredTests = filteredTests.slice(start, end);
                  }

                  filteredTestSuite.tests = filteredTests;
                }

                selection = { original: testSuite, filtered: filteredTestSuite };
                return filteredTestSuite;
              }
            : undefined;

        const cmdObj = {
          config: configPath ? [configPath] : ['promptfooconfig.yaml'],
          maxConcurrency,
          timeoutMs,
          repeat,
          delay,
          cache,
          write,
          share,
        };
        const evaluateOptions: InternalEvaluateOptions = {
          maxConcurrency,
          timeoutMs: timeoutMs ?? 30000,
          eventSource: 'mcp',
          showProgressBar: false,
        };
        logger.debug(`Running evaluation with config: ${configPath || 'promptfooconfig.yaml'}`);
        const startTime = Date.now();
        const evalResult = await cliState.withMaxConcurrency(maxConcurrency, () =>
          doEval(cmdObj, defaultConfig, defaultConfigPath, evaluateOptions, prepareTestSuite),
        );
        const endTime = Date.now();

        // Get summary data
        const summary = await evalResult.toEvaluateSummary();

        // Format results using shared formatter with pagination
        const { results: formattedResults, pagination } = formatEvaluationResults(summary, {
          resultLimit,
          resultOffset,
        });

        // Prepare detailed response
        const evalData = {
          eval: {
            id: evalResult.id,
            status: 'completed',
            duration: endTime - startTime,
            timestamp: new Date().toISOString(),
          },
          configuration: {
            configPath: configPath || 'promptfooconfig.yaml',
            testCases: {
              total: selection ? selection.original.tests?.length || 0 : summary.results.length,
              ...(selection ? { filtered: selection.filtered.tests?.length || 0 } : {}),
              filters: { testCaseIndices, promptFilter, providerFilter },
            },
            ...(selection
              ? {
                  prompts: {
                    total: selection.original.prompts.length,
                    filtered: selection.filtered.prompts.length,
                    labels: selection.filtered.prompts.map(
                      (p) => p.label || p.raw.slice(0, 50) + (p.raw.length > 50 ? '...' : ''),
                    ),
                  },
                  providers: {
                    total: selection.original.providers.length,
                    filtered: selection.filtered.providers.length,
                    ids: selection.filtered.providers.map((p) =>
                      typeof p.id === 'function' ? p.id() : p.id,
                    ),
                  },
                }
              : {}),
            options: {
              maxConcurrency,
              timeoutMs: timeoutMs ?? evalResult.config.evaluateOptions?.timeoutMs ?? 30000,
              repeat,
              delay,
              cache,
              write,
              share,
              resultLimit,
              resultOffset,
            },
          },
          results: {
            stats: summary.stats,
            totalEvals: summary.results.length,
            successRate:
              summary.results.length > 0
                ? ((summary.stats.successes / summary.results.length) * 100).toFixed(1) + '%'
                : '0%',
            pagination,
            results: formattedResults,
          },
          prompts: formatPromptsSummary(summary),
        };

        return createToolResponse('run_evaluation', true, evalData);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        // Errors can include credential-bearing provider URLs or user-supplied filters.
        // Keep the detailed response on the requesting MCP connection, out of shared logs.
        logger.error('Evaluation execution failed');

        return createToolResponse('run_evaluation', false, undefined, errorMessage);
      }
    },
  );
}
