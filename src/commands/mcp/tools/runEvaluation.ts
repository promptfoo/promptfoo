import dedent from 'dedent';
import { z } from 'zod';
import logger from '../../../logger';
import { loadDefaultConfig } from '../../../util/config/default';
import { escapeRegExp } from '../../../util/text';
import { doEval } from '../../eval';
import { filterPrompts } from '../../eval/filterPrompts';
import { formatEvaluationResults, formatPromptsSummary } from '../lib/resultFormatter';
import { createToolResponse } from '../lib/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Command } from 'commander';

import type { CommandLineOptions, TestSuite } from '../../../types/index';
import type { InternalEvaluateOptions } from '../../../types/internal';

interface EvaluationFilterSummary {
  testCases: {
    total: number;
    filtered: number;
  };
  prompts: {
    total: number;
    filtered: number;
    labels: string[];
  };
  providers: {
    total: number;
    filtered: number;
    ids: string[];
  };
}

class McpEvaluationFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpEvaluationFilterError';
  }
}

function getProviderId(provider: TestSuite['providers'][number]): string {
  return typeof provider.id === 'function' ? provider.id() : provider.id;
}

function applyProviderFilter(testSuite: TestSuite, providerFilter?: string | string[]): void {
  if (!providerFilter) {
    return;
  }

  const filters = Array.isArray(providerFilter) ? providerFilter : [providerFilter];
  const filterPattern = new RegExp(filters.map(escapeRegExp).join('|'), 'i');

  if (testSuite.providers.length === 0) {
    throw new McpEvaluationFilterError(
      'No providers defined in configuration. Add providers to filter.',
    );
  }

  const filteredProviders = testSuite.providers.filter((provider) => {
    const providerId = getProviderId(provider);
    const label = provider.label || providerId || '';
    return filterPattern.test(label) || filterPattern.test(providerId || '');
  });

  if (filteredProviders.length === 0) {
    throw new McpEvaluationFilterError(
      `No providers matched filter: ${filters.join(', ')}. Available providers: ${testSuite.providers.map(getProviderId).join(', ')}`,
    );
  }

  testSuite.providers = filteredProviders;
}

function applyPromptFilter(testSuite: TestSuite, promptFilter?: string | string[]): void {
  if (!promptFilter) {
    return;
  }

  const promptFilters = Array.isArray(promptFilter) ? promptFilter : [promptFilter];
  const hasNumericPromptFilter = promptFilters.every((filter) => /^\d+$/.test(filter));

  if (hasNumericPromptFilter) {
    const indices = promptFilters.map((filter) => parseInt(filter, 10));
    const invalidIndices = indices.filter(
      (index) => index < 0 || index >= testSuite.prompts.length,
    );
    if (invalidIndices.length > 0) {
      throw new McpEvaluationFilterError(
        `Invalid prompt indices: ${invalidIndices.join(', ')}. Available indices: 0-${testSuite.prompts.length - 1}`,
      );
    }

    testSuite.prompts = indices.map((index) => testSuite.prompts[index]);
    return;
  }

  const filterPattern = Array.isArray(promptFilter) ? promptFilter.join('|') : promptFilter;
  try {
    testSuite.prompts = filterPrompts(testSuite.prompts, filterPattern);
  } catch (error) {
    throw new McpEvaluationFilterError(
      error instanceof Error ? error.message : 'Failed to filter prompts',
    );
  }

  if (testSuite.prompts.length === 0) {
    throw new McpEvaluationFilterError(
      `No prompts found after applying filter: ${Array.isArray(promptFilter) ? promptFilter.join(', ') : promptFilter}`,
    );
  }
}

function applyTestCaseFilter(
  testSuite: TestSuite,
  testCaseIndices?: number | number[] | { start: number; end: number },
): void {
  if (testCaseIndices === undefined || !testSuite.tests) {
    return;
  }

  const tests = testSuite.tests;
  if (typeof testCaseIndices === 'number') {
    if (testCaseIndices < 0 || testCaseIndices >= tests.length) {
      throw new McpEvaluationFilterError(
        `Test case index ${testCaseIndices} is out of range. Available indices: 0-${tests.length - 1}`,
      );
    }
    testSuite.tests = [tests[testCaseIndices]];
    return;
  }

  if (Array.isArray(testCaseIndices)) {
    const invalidIndices = testCaseIndices.filter((index) => index < 0 || index >= tests.length);
    if (invalidIndices.length > 0) {
      throw new McpEvaluationFilterError(
        `Invalid test case indices: ${invalidIndices.join(', ')}. Available indices: 0-${tests.length - 1}`,
      );
    }
    testSuite.tests = testCaseIndices.map((index) => tests[index]);
    return;
  }

  const { start, end } = testCaseIndices;
  if (start < 0 || end > tests.length || start >= end) {
    throw new McpEvaluationFilterError(
      `Invalid range: start=${start}, end=${end}. Available indices: 0-${tests.length - 1}`,
    );
  }
  testSuite.tests = tests.slice(start, end);
}

function summarizeFilteredSuite(
  testSuite: TestSuite,
  totals: {
    testCases: number;
    prompts: number;
    providers: number;
  },
): EvaluationFilterSummary {
  return {
    testCases: {
      total: totals.testCases,
      filtered: testSuite.tests?.length || 0,
    },
    prompts: {
      total: totals.prompts,
      filtered: testSuite.prompts.length,
      labels: testSuite.prompts.map(
        (prompt) => prompt.label || prompt.raw.slice(0, 50) + (prompt.raw.length > 50 ? '...' : ''),
      ),
    },
    providers: {
      total: totals.providers,
      filtered: testSuite.providers.length,
      ids: testSuite.providers.map(getProviderId),
    },
  };
}

function applyMcpEvaluationFilters(
  testSuite: TestSuite,
  options: {
    testCaseIndices?: number | number[] | { start: number; end: number };
    promptFilter?: string | string[];
    providerFilter?: string | string[];
  },
): EvaluationFilterSummary {
  const { testCaseIndices, promptFilter, providerFilter } = options;
  const totals = {
    testCases: testSuite.tests?.length || 0,
    prompts: testSuite.prompts.length,
    providers: testSuite.providers.length,
  };

  applyProviderFilter(testSuite, providerFilter);
  applyPromptFilter(testSuite, promptFilter);
  applyTestCaseFilter(testSuite, testCaseIndices);

  return summarizeFilteredSuite(testSuite, totals);
}

function getPromptFilterValidationError(promptFilter?: string | string[]): string | undefined {
  const promptFilters = promptFilter
    ? Array.isArray(promptFilter)
      ? promptFilter
      : [promptFilter]
    : null;

  if (!promptFilters || promptFilters.length <= 1) {
    return undefined;
  }

  const hasNumeric = promptFilters.some((filter) => /^\d+$/.test(filter));
  const hasNonNumeric = promptFilters.some((filter) => !/^\d+$/.test(filter));

  if (hasNumeric && hasNonNumeric) {
    return 'Cannot mix numeric indices and regex patterns in promptFilter. Use either all numeric indices (e.g., ["0", "2"]) or all regex patterns (e.g., ["morning.*", "evening.*"]), but not both.';
  }

  return undefined;
}

function buildConfiguration(
  options: {
    configPath?: string;
    testCaseIndices?: number | number[] | { start: number; end: number };
    promptFilter?: string | string[];
    providerFilter?: string | string[];
    maxConcurrency: number;
    timeoutMs: number;
    repeat: number;
    delay?: number;
    cache: boolean;
    write: boolean;
    share: boolean;
    resultLimit: number;
    resultOffset: number;
  },
  suiteSummary: EvaluationFilterSummary,
) {
  const filters = {
    testCaseIndices: options.testCaseIndices,
    promptFilter: options.promptFilter,
    providerFilter: options.providerFilter,
  };

  return {
    configPath: options.configPath || 'promptfooconfig.yaml',
    testCases: {
      ...suiteSummary.testCases,
      filters,
    },
    prompts: suiteSummary.prompts,
    providers: suiteSummary.providers,
    options: {
      maxConcurrency: options.maxConcurrency,
      timeoutMs: options.timeoutMs,
      repeat: options.repeat,
      delay: options.delay,
      cache: options.cache,
      write: options.write,
      share: options.share,
      resultLimit: options.resultLimit,
      resultOffset: options.resultOffset,
    },
  };
}

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
            Examples: "openai:gpt-4", ["openai:gpt-4", "anthropic:claude-3"]
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
          timeoutMs = 30000,
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

        const promptFilterValidationError = getPromptFilterValidationError(promptFilter);
        if (promptFilterValidationError) {
          return createToolResponse(
            'run_evaluation',
            false,
            undefined,
            promptFilterValidationError,
          );
        }

        const hasFilters =
          testCaseIndices !== undefined || Boolean(promptFilter) || Boolean(providerFilter);
        let suiteSummary: EvaluationFilterSummary | undefined;

        const cmdObj: Partial<CommandLineOptions & Command> = {
          config: configPath ? [configPath] : ['promptfooconfig.yaml'],
          maxConcurrency,
          repeat,
          delay,
          cache,
          write,
          share,
        };

        const evaluateOptions: InternalEvaluateOptions = {
          maxConcurrency,
          timeoutMs,
          eventSource: 'mcp',
          showProgressBar: false,
        };

        logger.debug(`Running evaluation with config: ${configPath || 'promptfooconfig.yaml'}`);

        const startTime = Date.now();
        const evalResult = await doEval(cmdObj, defaultConfig, defaultConfigPath, evaluateOptions, {
          beforeFilterTestSuite: (testSuite) => {
            suiteSummary = applyMcpEvaluationFilters(testSuite, {
              testCaseIndices,
              promptFilter,
              providerFilter,
            });
            if (hasFilters) {
              logger.debug(
                `Running filtered eval with ${suiteSummary.testCases.filtered} test cases, ${suiteSummary.prompts.filtered} prompts, ${suiteSummary.providers.filtered} providers`,
              );
            }
          },
          afterFilterTestSuite: (testSuite) => {
            if (!suiteSummary) {
              throw new Error('Failed to summarize evaluation suite before finalization');
            }
            suiteSummary = summarizeFilteredSuite(testSuite, {
              testCases: suiteSummary.testCases.total,
              prompts: suiteSummary.prompts.total,
              providers: suiteSummary.providers.total,
            });
          },
          evaluateOptionOverrides: {
            timeoutMs,
          },
        });
        const endTime = Date.now();
        if (!suiteSummary) {
          throw new Error('Failed to summarize evaluation suite');
        }

        const summary = await evalResult.toEvaluateSummary();
        const { results: formattedResults, pagination } = formatEvaluationResults(summary, {
          resultLimit,
          resultOffset,
        });

        const evalData = {
          eval: {
            id: evalResult.id,
            status: 'completed',
            duration: endTime - startTime,
            timestamp: new Date().toISOString(),
          },
          configuration: buildConfiguration(
            {
              configPath,
              testCaseIndices,
              promptFilter,
              providerFilter,
              maxConcurrency,
              timeoutMs,
              repeat,
              delay,
              cache,
              write,
              share,
              resultLimit,
              resultOffset,
            },
            suiteSummary,
          ),
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
        if (error instanceof McpEvaluationFilterError) {
          return createToolResponse('run_evaluation', false, undefined, errorMessage);
        }

        logger.error(`Evaluation execution failed: ${errorMessage}`);

        const errorData = {
          configuration: {
            configPath: args.configPath || 'promptfooconfig.yaml',
            testCaseIndices: args.testCaseIndices,
            promptFilter: args.promptFilter,
            providerFilter: args.providerFilter,
          },
          error: errorMessage,
          troubleshooting: {
            commonIssues: [
              'Configuration file not found or invalid format',
              'Test case indices out of range',
              'Provider or prompt filters not matching any items',
              'Provider authentication or configuration errors',
              'Assertion configuration errors',
              'Timeout issues with slow providers',
            ],
            configurationTips: [
              'Ensure promptfooconfig.yaml exists and is valid',
              'Check that provider credentials are properly configured',
              'Verify test case indices are within bounds',
              'Use exact provider IDs and prompt labels for filtering',
            ],
            exampleUsage: {
              singleTestCase: '{"testCaseIndices": 0}',
              multipleTestCases: '{"testCaseIndices": [0, 2, 5]}',
              testCaseRange: '{"testCaseIndices": {"start": 0, "end": 3}}',
              withFilters: '{"promptFilter": "my-prompt", "providerFilter": "openai:gpt-4"}',
            },
          },
        };

        return createToolResponse('run_evaluation', false, errorData);
      }
    },
  );
}
