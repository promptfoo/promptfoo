import dedent from 'dedent';
import { z } from 'zod';
import logger from '../../../logger';
import { loadDefaultConfig } from '../../../util/config/default';
import { resolveConfigs } from '../../../util/config/load';
import { escapeRegExp } from '../../../util/text';
import { doEval } from '../../eval';
import { filterPrompts } from '../../eval/filterPrompts';
import { formatEvaluationResults, formatPromptsSummary } from '../lib/resultFormatter';
import { createToolResponse } from '../lib/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Command } from 'commander';

import type { CommandLineOptions, EvaluateOptions } from '../../../types/index';

type TestCaseIndices = number | number[] | { start: number; end: number };

type RunEvaluationArgs = {
  configPath?: string;
  testCaseIndices?: TestCaseIndices;
  promptFilter?: string | string[];
  providerFilter?: string | string[];
  maxConcurrency?: number;
  timeoutMs?: number;
  repeat?: number;
  delay?: number;
  cache?: boolean;
  write?: boolean;
  share?: boolean;
  resultLimit?: number;
  resultOffset?: number;
};

function normalizePromptFilters(promptFilter: string | string[] | undefined): string[] | null {
  if (!promptFilter) {
    return null;
  }
  return Array.isArray(promptFilter) ? promptFilter : [promptFilter];
}

function validateMixedPromptFilters(filters: string[]): string | null {
  if (filters.length <= 1) {
    return null;
  }
  const hasNumeric = filters.some((f) => /^\d+$/.test(f));
  const hasNonNumeric = filters.some((f) => !/^\d+$/.test(f));
  if (hasNumeric && hasNonNumeric) {
    return 'Cannot mix numeric indices and regex patterns in promptFilter. Use either all numeric indices (e.g., ["0", "2"]) or all regex patterns (e.g., ["morning.*", "evening.*"]), but not both.';
  }
  return null;
}

function applyProviderFilter(
  filteredTestSuite: any,
  providerFilter: string | string[],
): string | null {
  const filters = Array.isArray(providerFilter) ? providerFilter : [providerFilter];
  const filterPattern = new RegExp(filters.map(escapeRegExp).join('|'), 'i');

  const providers = filteredTestSuite.providers || [];
  if (providers.length === 0) {
    return 'No providers defined in configuration. Add providers to filter.';
  }

  const filteredProviders = providers.filter((provider: any) => {
    const providerId = typeof provider.id === 'function' ? provider.id() : provider.id;
    const label = provider.label || providerId || '';
    return filterPattern.test(label) || filterPattern.test(providerId || '');
  });

  if (filteredProviders.length === 0) {
    const available = providers
      .map((p: any) => (typeof p.id === 'function' ? p.id() : p.id))
      .join(', ');
    return `No providers matched filter: ${filters.join(', ')}. Available providers: ${available}`;
  }

  filteredTestSuite.providers = filteredProviders;
  return null;
}

function applyNumericPromptFilter(
  filteredTestSuite: any,
  testSuite: any,
  promptFilters: string[],
): string | null {
  const indices = promptFilters.map((f) => parseInt(f, 10));
  const prompts = testSuite.prompts || [];
  const invalidIndices = indices.filter((i) => i < 0 || i >= prompts.length);
  if (invalidIndices.length > 0) {
    return `Invalid prompt indices: ${invalidIndices.join(', ')}. Available indices: 0-${prompts.length - 1}`;
  }
  filteredTestSuite.prompts = indices.map((i) => prompts[i]);
  return null;
}

function applyRegexPromptFilter(
  filteredTestSuite: any,
  testSuite: any,
  promptFilter: string | string[],
): string | null {
  const filterPattern = Array.isArray(promptFilter) ? promptFilter.join('|') : promptFilter;
  try {
    filteredTestSuite.prompts = filterPrompts(testSuite.prompts, filterPattern);
  } catch (error) {
    return error instanceof Error ? error.message : 'Failed to filter prompts';
  }
  if (filteredTestSuite.prompts.length === 0) {
    const filter = Array.isArray(promptFilter) ? promptFilter.join(', ') : promptFilter;
    return `No prompts found after applying filter: ${filter}`;
  }
  return null;
}

function applyTestCaseIndexFilter(
  filteredTestSuite: any,
  testCaseIndices: TestCaseIndices,
): string | null {
  const filteredTests = filteredTestSuite.tests;
  if (!filteredTests) {
    return null;
  }

  if (typeof testCaseIndices === 'number') {
    if (testCaseIndices < 0 || testCaseIndices >= filteredTests.length) {
      return `Test case index ${testCaseIndices} is out of range. Available indices: 0-${filteredTests.length - 1}`;
    }
    filteredTestSuite.tests = [filteredTests[testCaseIndices]];
    return null;
  }

  if (Array.isArray(testCaseIndices)) {
    const invalidIndices = testCaseIndices.filter((i) => i < 0 || i >= filteredTests.length);
    if (invalidIndices.length > 0) {
      return `Invalid test case indices: ${invalidIndices.join(', ')}. Available indices: 0-${filteredTests.length - 1}`;
    }
    filteredTestSuite.tests = testCaseIndices.map((i) => filteredTests[i]);
    return null;
  }

  const { start, end } = testCaseIndices;
  if (start < 0 || end > filteredTests.length || start >= end) {
    return `Invalid range: start=${start}, end=${end}. Available indices: 0-${filteredTests.length - 1}`;
  }
  filteredTestSuite.tests = filteredTests.slice(start, end);
  return null;
}

function buildPromptLabels(prompts: any[]): string[] {
  return (prompts || []).map(
    (p) => p.label || p.raw.slice(0, 50) + (p.raw.length > 50 ? '...' : ''),
  );
}

function buildFilteredEvalData(
  result: any,
  summary: any,
  args: RunEvaluationArgs,
  testSuite: any,
  filteredTestSuite: any,
  startTime: number,
  endTime: number,
  formattedResults: any,
  pagination: any,
): object {
  const {
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
  } = args;
  return {
    eval: {
      id: result.id,
      status: 'completed',
      duration: endTime - startTime,
      timestamp: new Date().toISOString(),
    },
    configuration: {
      configPath: configPath || 'promptfooconfig.yaml',
      testCases: {
        total: testSuite.tests?.length || 0,
        filtered: filteredTestSuite.tests?.length || 0,
        filters: { testCaseIndices, promptFilter, providerFilter },
      },
      prompts: {
        total: (testSuite.prompts || []).length,
        filtered: (filteredTestSuite.prompts || []).length,
        labels: buildPromptLabels(filteredTestSuite.prompts),
      },
      providers: {
        total: testSuite.providers.length,
        filtered: filteredTestSuite.providers.length,
        ids: filteredTestSuite.providers.map((p: any) =>
          typeof p.id === 'function' ? p.id() : p.id,
        ),
      },
      options: {
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
}

function buildSimpleEvalData(
  evalResult: any,
  summary: any,
  args: RunEvaluationArgs,
  startTime: number,
  endTime: number,
  formattedResults: any,
  pagination: any,
): object {
  const {
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
  } = args;
  return {
    eval: {
      id: evalResult.id,
      status: 'completed',
      duration: endTime - startTime,
      timestamp: new Date().toISOString(),
    },
    configuration: {
      configPath: configPath || 'promptfooconfig.yaml',
      testCases: {
        total: summary.results.length,
        filters: { testCaseIndices, promptFilter, providerFilter },
      },
      options: {
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
}

async function runFilteredEval(args: RunEvaluationArgs, defaultConfig: any): Promise<object> {
  const {
    configPath,
    testCaseIndices,
    promptFilter,
    providerFilter,
    maxConcurrency = 4,
    timeoutMs = 30000,
    resultLimit = 20,
    resultOffset = 0,
  } = args;

  const configPaths = configPath ? [configPath] : ['promptfooconfig.yaml'];
  const { config, testSuite } = await resolveConfigs({ config: configPaths }, defaultConfig);

  const filteredTestSuite = { ...testSuite };

  if (providerFilter) {
    const error = applyProviderFilter(filteredTestSuite, providerFilter);
    if (error) {
      return createToolResponse('run_evaluation', false, undefined, error);
    }
  }

  if (promptFilter) {
    const promptFilters = normalizePromptFilters(promptFilter)!;
    const isNumeric = promptFilters.every((f) => /^\d+$/.test(f));
    const error = isNumeric
      ? applyNumericPromptFilter(filteredTestSuite, testSuite, promptFilters)
      : applyRegexPromptFilter(filteredTestSuite, testSuite, promptFilter);
    if (error) {
      return createToolResponse('run_evaluation', false, undefined, error);
    }
  }

  if (testCaseIndices !== undefined && filteredTestSuite.tests) {
    const error = applyTestCaseIndexFilter(filteredTestSuite, testCaseIndices);
    if (error) {
      return createToolResponse('run_evaluation', false, undefined, error);
    }
  }

  const { evaluate } = await import('../../../evaluator');
  const Eval = (await import('../../../models/eval')).default;

  const evalRecord = await Eval.create(config, filteredTestSuite.prompts, {
    id: `mcp-eval-${Date.now()}`,
  });

  logger.debug(
    `Running filtered eval with ${filteredTestSuite.tests?.length || 0} test cases, ${filteredTestSuite.prompts.length} prompts, ${filteredTestSuite.providers.length} providers`,
  );

  const startTime = Date.now();
  const result = await evaluate(filteredTestSuite, evalRecord, {
    maxConcurrency,
    timeoutMs,
    eventSource: 'mcp',
  });
  const endTime = Date.now();

  const summary = await result.toEvaluateSummary();
  const { results: formattedResults, pagination } = formatEvaluationResults(summary, {
    resultLimit,
    resultOffset,
  });

  const evalData = buildFilteredEvalData(
    result,
    summary,
    args,
    testSuite,
    filteredTestSuite,
    startTime,
    endTime,
    formattedResults,
    pagination,
  );

  return createToolResponse('run_evaluation', true, evalData);
}

async function runSimpleEval(
  args: RunEvaluationArgs,
  defaultConfig: any,
  defaultConfigPath: string,
): Promise<object> {
  const {
    configPath,
    maxConcurrency = 4,
    repeat = 1,
    delay,
    cache = true,
    write = false,
    share = false,
    resultLimit = 20,
    resultOffset = 0,
  } = args;

  const cmdObj: Partial<CommandLineOptions & Command> = {
    config: configPath ? [configPath] : ['promptfooconfig.yaml'],
    maxConcurrency,
    repeat,
    delay,
    cache,
    write,
    share,
  };

  const evaluateOptions: EvaluateOptions = {
    maxConcurrency,
    eventSource: 'mcp',
    showProgressBar: false,
  };

  logger.debug(`Running evaluation with config: ${configPath || 'promptfooconfig.yaml'}`);

  const startTime = Date.now();
  const evalResult = await doEval(cmdObj, defaultConfig, defaultConfigPath, evaluateOptions);
  const endTime = Date.now();

  const summary = await evalResult.toEvaluateSummary();
  const { results: formattedResults, pagination } = formatEvaluationResults(summary, {
    resultLimit,
    resultOffset,
  });

  const evalData = buildSimpleEvalData(
    evalResult,
    summary,
    args,
    startTime,
    endTime,
    formattedResults,
    pagination,
  );

  return createToolResponse('run_evaluation', true, evalData);
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
            - Single index: 0
            - Multiple indices: [0, 2, 5]
            - Range: {"start": 0, "end": 3}
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
        const { testCaseIndices, promptFilter, providerFilter } = args;

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

        // Validate mixed prompt filter input
        const promptFilters = normalizePromptFilters(promptFilter);
        if (promptFilters) {
          const mixedError = validateMixedPromptFilters(promptFilters);
          if (mixedError) {
            return createToolResponse('run_evaluation', false, undefined, mixedError);
          }
        }

        const useFiltering = testCaseIndices !== undefined || promptFilter || providerFilter;

        if (useFiltering) {
          return await runFilteredEval(args, defaultConfig);
        }

        return await runSimpleEval(args, defaultConfig, defaultConfigPath);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
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
