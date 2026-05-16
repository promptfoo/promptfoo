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
import type { ToolResult } from '../lib/types';

import type { CommandLineOptions } from '../../../types/index';
import type { InternalEvaluateOptions } from '../../../types/internal';

type RunEvaluationArgs = {
  configPath?: string;
  testCaseIndices?:
    | number
    | number[]
    | {
        start: number;
        end: number;
      };
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

type LoadedEvaluationConfig =
  | {
      ok: true;
      defaultConfig: Awaited<ReturnType<typeof loadDefaultConfig>>['defaultConfig'];
      defaultConfigPath: Awaited<ReturnType<typeof loadDefaultConfig>>['defaultConfigPath'];
    }
  | { ok: false; error: ToolResult };

type NormalizedRunEvaluationOptions = {
  maxConcurrency: number;
  timeoutMs: number;
  repeat: number;
  delay?: number;
  cache: boolean;
  write: boolean;
  share: boolean;
  resultLimit: number;
  resultOffset: number;
};

async function loadEvaluationConfig(): Promise<LoadedEvaluationConfig> {
  try {
    const { defaultConfig, defaultConfigPath } = await loadDefaultConfig();
    return { ok: true, defaultConfig, defaultConfigPath };
  } catch (error) {
    return {
      ok: false,
      error: createToolResponse(
        'run_evaluation',
        false,
        undefined,
        `Failed to load default config: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ),
    };
  }
}

function normalizeRunEvaluationOptions(args: RunEvaluationArgs): NormalizedRunEvaluationOptions {
  return {
    maxConcurrency: args.maxConcurrency ?? 4,
    timeoutMs: args.timeoutMs ?? 30000,
    repeat: args.repeat ?? 1,
    delay: args.delay,
    cache: args.cache ?? true,
    write: args.write ?? false,
    share: args.share ?? false,
    resultLimit: args.resultLimit ?? 20,
    resultOffset: args.resultOffset ?? 0,
  };
}

function normalizePromptFilters(promptFilter: RunEvaluationArgs['promptFilter']) {
  if (!promptFilter) {
    return null;
  }
  return Array.isArray(promptFilter) ? promptFilter : [promptFilter];
}

function validatePromptFilterMix(promptFilters: string[] | null): ToolResult | undefined {
  if (!promptFilters || promptFilters.length <= 1) {
    return undefined;
  }
  const hasNumeric = promptFilters.some((filter) => /^\d+$/.test(filter));
  const hasNonNumeric = promptFilters.some((filter) => !/^\d+$/.test(filter));
  if (!hasNumeric || !hasNonNumeric) {
    return undefined;
  }
  return createToolResponse(
    'run_evaluation',
    false,
    undefined,
    'Cannot mix numeric indices and regex patterns in promptFilter. Use either all numeric indices (e.g., ["0", "2"]) or all regex patterns (e.g., ["morning.*", "evening.*"]), but not both.',
  );
}

function hasNumericPromptFilter(promptFilters: string[] | null) {
  return !!promptFilters && promptFilters.every((filter) => /^\d+$/.test(filter));
}

function hasManualFilters(args: RunEvaluationArgs) {
  return (
    args.testCaseIndices !== undefined ||
    !!args.promptFilter ||
    !!args.providerFilter
  );
}

function getProviderId(provider: any) {
  return typeof provider.id === 'function' ? provider.id() : provider.id;
}

function applyProviderFilter(
  filteredTestSuite: any,
  providerFilter: RunEvaluationArgs['providerFilter'],
): ToolResult | undefined {
  if (!providerFilter) {
    return undefined;
  }
  const filters = Array.isArray(providerFilter) ? providerFilter : [providerFilter];
  const filterPattern = new RegExp(filters.map(escapeRegExp).join('|'), 'i');
  const providers = filteredTestSuite.providers || [];
  if (providers.length === 0) {
    return createToolResponse(
      'run_evaluation',
      false,
      undefined,
      'No providers defined in configuration. Add providers to filter.',
    );
  }
  const filteredProviders = providers.filter((provider: any) => {
    const providerId = getProviderId(provider);
    const label = provider.label || providerId || '';
    return filterPattern.test(label) || filterPattern.test(providerId || '');
  });
  if (filteredProviders.length === 0) {
    return createToolResponse(
      'run_evaluation',
      false,
      undefined,
      `No providers matched filter: ${filters.join(', ')}. Available providers: ${providers.map((provider: any) => getProviderId(provider)).join(', ')}`,
    );
  }
  filteredTestSuite.providers = filteredProviders;
  return undefined;
}

function applyPromptFilter(
  filteredTestSuite: any,
  testSuite: any,
  promptFilter: RunEvaluationArgs['promptFilter'],
  promptFilters: string[] | null,
  numericPromptFilter: boolean,
): ToolResult | undefined {
  if (!promptFilter) {
    return undefined;
  }
  if (numericPromptFilter && promptFilters) {
    const indices = promptFilters.map((filter) => parseInt(filter, 10));
    const prompts = testSuite.prompts || [];
    const invalidIndices = indices.filter((index) => index < 0 || index >= prompts.length);
    if (invalidIndices.length > 0) {
      return createToolResponse(
        'run_evaluation',
        false,
        undefined,
        `Invalid prompt indices: ${invalidIndices.join(', ')}. Available indices: 0-${prompts.length - 1}`,
      );
    }
    filteredTestSuite.prompts = indices.map((index) => prompts[index]);
    return undefined;
  }
  const filterPattern = Array.isArray(promptFilter) ? promptFilter.join('|') : promptFilter;
  try {
    filteredTestSuite.prompts = filterPrompts(testSuite.prompts, filterPattern);
  } catch (error) {
    return createToolResponse(
      'run_evaluation',
      false,
      undefined,
      error instanceof Error ? error.message : 'Failed to filter prompts',
    );
  }
  if (filteredTestSuite.prompts.length === 0) {
    return createToolResponse(
      'run_evaluation',
      false,
      undefined,
      `No prompts found after applying filter: ${Array.isArray(promptFilter) ? promptFilter.join(', ') : promptFilter}`,
    );
  }
  return undefined;
}

function applyTestCaseFilter(
  filteredTestSuite: any,
  testCaseIndices: RunEvaluationArgs['testCaseIndices'],
): ToolResult | undefined {
  if (testCaseIndices === undefined || !filteredTestSuite.tests) {
    return undefined;
  }
  const tests = filteredTestSuite.tests;
  let filteredTests = tests;
  if (typeof testCaseIndices === 'number') {
    if (testCaseIndices < 0 || testCaseIndices >= tests.length) {
      return createToolResponse(
        'run_evaluation',
        false,
        undefined,
        `Test case index ${testCaseIndices} is out of range. Available indices: 0-${tests.length - 1}`,
      );
    }
    filteredTests = [tests[testCaseIndices]];
  } else if (Array.isArray(testCaseIndices)) {
    const invalidIndices = testCaseIndices.filter((index) => index < 0 || index >= tests.length);
    if (invalidIndices.length > 0) {
      return createToolResponse(
        'run_evaluation',
        false,
        undefined,
        `Invalid test case indices: ${invalidIndices.join(', ')}. Available indices: 0-${tests.length - 1}`,
      );
    }
    filteredTests = testCaseIndices.map((index) => tests[index]);
  } else {
    const { start, end } = testCaseIndices;
    if (start < 0 || end > tests.length || start >= end) {
      return createToolResponse(
        'run_evaluation',
        false,
        undefined,
        `Invalid range: start=${start}, end=${end}. Available indices: 0-${tests.length - 1}`,
      );
    }
    filteredTests = tests.slice(start, end);
  }
  filteredTestSuite.tests = filteredTests;
  return undefined;
}

function getPromptLabel(prompt: any) {
  return prompt.label || prompt.raw.slice(0, 50) + (prompt.raw.length > 50 ? '...' : '');
}

function buildResultsSection(summary: any, resultLimit: number, resultOffset: number) {
  const { results, pagination } = formatEvaluationResults(summary, { resultLimit, resultOffset });
  return {
    stats: summary.stats,
    totalEvals: summary.results.length,
    successRate:
      summary.results.length > 0
        ? ((summary.stats.successes / summary.results.length) * 100).toFixed(1) + '%'
        : '0%',
    pagination,
    results,
  };
}

function buildRunEvaluationOptionsData(options: NormalizedRunEvaluationOptions) {
  return {
    maxConcurrency: options.maxConcurrency,
    timeoutMs: options.timeoutMs,
    repeat: options.repeat,
    delay: options.delay,
    cache: options.cache,
    write: options.write,
    share: options.share,
    resultLimit: options.resultLimit,
    resultOffset: options.resultOffset,
  };
}

function buildFilteredEvaluationData(
  args: RunEvaluationArgs,
  options: NormalizedRunEvaluationOptions,
  result: any,
  summary: any,
  startTime: number,
  endTime: number,
  testSuite: any,
  filteredTestSuite: any,
) {
  return {
    eval: {
      id: result.id,
      status: 'completed',
      duration: endTime - startTime,
      timestamp: new Date().toISOString(),
    },
    configuration: {
      configPath: args.configPath || 'promptfooconfig.yaml',
      testCases: {
        total: testSuite.tests?.length || 0,
        filtered: filteredTestSuite.tests?.length || 0,
        filters: {
          testCaseIndices: args.testCaseIndices,
          promptFilter: args.promptFilter,
          providerFilter: args.providerFilter,
        },
      },
      prompts: {
        total: (testSuite.prompts || []).length,
        filtered: (filteredTestSuite.prompts || []).length,
        labels: (filteredTestSuite.prompts || []).map((prompt: any) => getPromptLabel(prompt)),
      },
      providers: {
        total: testSuite.providers.length,
        filtered: filteredTestSuite.providers.length,
        ids: filteredTestSuite.providers.map((provider: any) => getProviderId(provider)),
      },
      options: buildRunEvaluationOptionsData(options),
    },
    results: buildResultsSection(summary, options.resultLimit, options.resultOffset),
    prompts: formatPromptsSummary(summary),
  };
}

function buildSimpleEvaluationData(
  args: RunEvaluationArgs,
  options: NormalizedRunEvaluationOptions,
  evalResult: any,
  summary: any,
  startTime: number,
  endTime: number,
) {
  return {
    eval: {
      id: evalResult.id,
      status: 'completed',
      duration: endTime - startTime,
      timestamp: new Date().toISOString(),
    },
    configuration: {
      configPath: args.configPath || 'promptfooconfig.yaml',
      testCases: {
        total: summary.results.length,
        filters: {
          testCaseIndices: args.testCaseIndices,
          promptFilter: args.promptFilter,
          providerFilter: args.providerFilter,
        },
      },
      options: buildRunEvaluationOptionsData(options),
    },
    results: buildResultsSection(summary, options.resultLimit, options.resultOffset),
    prompts: formatPromptsSummary(summary),
  };
}

async function runFilteredEvaluation(
  args: RunEvaluationArgs,
  defaultConfig: Awaited<ReturnType<typeof loadDefaultConfig>>['defaultConfig'],
  promptFilters: string[] | null,
  numericPromptFilter: boolean,
  options: NormalizedRunEvaluationOptions,
): Promise<ToolResult> {
  const configPaths = args.configPath ? [args.configPath] : ['promptfooconfig.yaml'];
  const { config, testSuite } = await resolveConfigs({ config: configPaths }, defaultConfig);
  const filteredTestSuite = { ...testSuite };

  const providerFilterError = applyProviderFilter(filteredTestSuite, args.providerFilter);
  if (providerFilterError) {
    return providerFilterError;
  }

  const promptFilterError = applyPromptFilter(
    filteredTestSuite,
    testSuite,
    args.promptFilter,
    promptFilters,
    numericPromptFilter,
  );
  if (promptFilterError) {
    return promptFilterError;
  }

  const testCaseFilterError = applyTestCaseFilter(filteredTestSuite, args.testCaseIndices);
  if (testCaseFilterError) {
    return testCaseFilterError;
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
    maxConcurrency: options.maxConcurrency,
    timeoutMs: options.timeoutMs,
    eventSource: 'mcp',
  });
  const endTime = Date.now();
  const summary = await result.toEvaluateSummary();
  return createToolResponse(
    'run_evaluation',
    true,
    buildFilteredEvaluationData(
      args,
      options,
      result,
      summary,
      startTime,
      endTime,
      testSuite,
      filteredTestSuite,
    ),
  );
}

async function runSimpleEvaluation(
  args: RunEvaluationArgs,
  defaultConfig: Awaited<ReturnType<typeof loadDefaultConfig>>['defaultConfig'],
  defaultConfigPath: Awaited<ReturnType<typeof loadDefaultConfig>>['defaultConfigPath'],
  options: NormalizedRunEvaluationOptions,
): Promise<ToolResult> {
  const cmdObj: Partial<CommandLineOptions & Command> = {
    config: args.configPath ? [args.configPath] : ['promptfooconfig.yaml'],
    maxConcurrency: options.maxConcurrency,
    repeat: options.repeat,
    delay: options.delay,
    cache: options.cache,
    write: options.write,
    share: options.share,
  };
  const evaluateOptions: InternalEvaluateOptions = {
    maxConcurrency: options.maxConcurrency,
    eventSource: 'mcp',
    showProgressBar: false,
  };
  logger.debug(`Running evaluation with config: ${args.configPath || 'promptfooconfig.yaml'}`);
  const startTime = Date.now();
  const evalResult = await doEval(cmdObj, defaultConfig, defaultConfigPath, evaluateOptions);
  const endTime = Date.now();
  const summary = await evalResult.toEvaluateSummary();
  return createToolResponse(
    'run_evaluation',
    true,
    buildSimpleEvaluationData(args, options, evalResult, summary, startTime, endTime),
  );
}

function buildRunEvaluationErrorResponse(args: RunEvaluationArgs, error: unknown) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
  logger.error(`Evaluation execution failed: ${errorMessage}`);
  return createToolResponse('run_evaluation', false, {
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
  });
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
        const loadedConfig = await loadEvaluationConfig();
        if (!loadedConfig.ok) {
          return loadedConfig.error;
        }
        const promptFilters = normalizePromptFilters(args.promptFilter);
        const promptFilterError = validatePromptFilterMix(promptFilters);
        if (promptFilterError) {
          return promptFilterError;
        }
        const options = normalizeRunEvaluationOptions(args);
        const numericPromptFilter = hasNumericPromptFilter(promptFilters);
        return hasManualFilters(args)
          ? await runFilteredEvaluation(
              args,
              loadedConfig.defaultConfig,
              promptFilters,
              numericPromptFilter,
              options,
            )
          : await runSimpleEvaluation(
              args,
              loadedConfig.defaultConfig,
              loadedConfig.defaultConfigPath,
              options,
            );
      } catch (error: unknown) {
        return buildRunEvaluationErrorResponse(args, error);
      }
    },
  );
}
