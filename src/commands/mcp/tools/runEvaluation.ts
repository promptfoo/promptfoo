import dedent from 'dedent';
import { z } from 'zod';
import cliState from '../../../cliState';
import logger from '../../../logger';
import { doEval } from '../../../node/doEval';
import { loadDefaultConfig } from '../../../util/config/default';
import { filterPrompts } from '../../../util/eval/filterPrompts';
import {
  formatEvaluationResults,
  formatPromptsSummary,
  formatProviderId,
} from '../lib/resultFormatter';
import { createToolResponse } from '../lib/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { TestSuite } from '../../../types/index';
import type { InternalEvaluateOptions } from '../../../types/internal';

type TestCaseSelection = number | number[] | { start: number; end: number };

function selectProviders(providers: TestSuite['providers'], filter: string | string[]) {
  if (providers.length === 0) {
    throw new Error('No providers defined in configuration. Add providers to filter.');
  }
  const filters = (Array.isArray(filter) ? filter : [filter]).map((f) => f.toLowerCase());
  const selected = providers.filter((provider) => {
    const id = (typeof provider.id === 'function' ? provider.id() : provider.id).toLowerCase();
    const label = provider.label?.toLowerCase();
    return filters.some((value) => id.includes(value) || label?.includes(value));
  });
  if (selected.length === 0) {
    throw new Error(
      `No providers matched filter. Available providers: ${providers.map(formatProviderId).join(', ')}`,
    );
  }
  return selected;
}

function selectPrompts(prompts: TestSuite['prompts'], filter: string | string[]) {
  const filters = Array.isArray(filter) ? filter : [filter];
  const hasNumeric = filters.some((value) => /^\d+$/.test(value));
  const allNumeric = filters.every((value) => /^\d+$/.test(value));
  if (hasNumeric && !allNumeric) {
    throw new Error(
      'Cannot mix numeric indices and regex patterns in promptFilter. Use either all numeric indices (e.g., ["0", "2"]) or all regex patterns (e.g., ["morning.*", "evening.*"]), but not both.',
    );
  }
  if (allNumeric) {
    const indices = filters.map(Number);
    const invalid = indices.filter((index) => index >= prompts.length);
    if (invalid.length > 0) {
      throw new Error(
        `Invalid prompt indices: ${invalid.join(', ')}. Available indices: 0-${prompts.length - 1}`,
      );
    }
    return indices.map((index) => prompts[index]);
  }
  const selected = filterPrompts(prompts, filters.join('|'));
  if (selected.length === 0) {
    throw new Error(`No prompts found after applying filter: ${filters.join(', ')}`);
  }
  return selected;
}

function selectTestCases(tests: NonNullable<TestSuite['tests']>, indices: TestCaseSelection) {
  if (typeof indices === 'number') {
    if (indices < 0 || indices >= tests.length) {
      throw new Error(
        `Test case index ${indices} is out of range. Available indices: 0-${tests.length - 1}`,
      );
    }
    return [tests[indices]];
  }
  if (Array.isArray(indices)) {
    const invalid = indices.filter((index) => index < 0 || index >= tests.length);
    if (invalid.length > 0) {
      throw new Error(
        `Invalid test case indices: ${invalid.join(', ')}. Available indices: 0-${tests.length - 1}`,
      );
    }
    return indices.map((index) => tests[index]);
  }
  const { start, end } = indices;
  if (start < 0 || end > tests.length || start >= end) {
    throw new Error(
      `Invalid range: start=${start}, end=${end}. Available indices: 0-${tests.length - 1}`,
    );
  }
  return tests.slice(start, end);
}

/** Run a config through the evaluation pipeline with optional test, prompt, and provider filters. */
export function registerRunEvaluationTool(server: McpServer) {
  const index = z.number().int().nonnegative();
  const selector = z.string().min(1);
  const filter = z.union([selector, z.array(selector).min(1)]);
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
          index,
          z.array(index).min(1),
          z.object({
            start: index.describe('Start index (inclusive)'),
            end: index.describe('End index (exclusive)'),
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
      promptFilter: filter.optional().describe(
        dedent`
            Filter prompts by id/label (regex match) or index (numeric strings).
            Examples: "my-prompt", "prompt.*", ["morning", "evening"], "0", ["0", "2"]
          `,
      ),
      providerFilter: filter.optional().describe(
        dedent`
            Filter to specific providers by ID.
            Examples: "openai:gpt-5.6", ["openai:gpt-5.6", "anthropic:claude-sonnet-5"]
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
        .describe(
          'Timeout per eval in milliseconds (1s-5min); defaults to the config value or 30s',
        ),
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

        let selection: { original: TestSuite; filtered: TestSuite } | undefined;
        const prepareTestSuite =
          testCaseIndices !== undefined || promptFilter || providerFilter
            ? (testSuite: TestSuite): TestSuite => {
                const filtered = { ...testSuite };
                if (providerFilter) {
                  filtered.providers = selectProviders(testSuite.providers, providerFilter);
                }
                if (promptFilter) {
                  filtered.prompts = selectPrompts(testSuite.prompts, promptFilter);
                }
                if (testCaseIndices !== undefined && testSuite.tests) {
                  filtered.tests = selectTestCases(testSuite.tests, testCaseIndices);
                }
                selection = { original: testSuite, filtered };
                return filtered;
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
          configuration: {
            configPath: configPath || 'promptfooconfig.yaml',
            testCases: {
              total: selection ? selection.original.tests?.length || 0 : summary.results.length,
              ...(selection ? { filtered: selection.filtered.tests?.length || 0 } : {}),
              filters: {
                testCaseIndices,
                promptFilter,
                providerFilter: Array.isArray(providerFilter)
                  ? providerFilter.map(formatProviderId)
                  : providerFilter && formatProviderId(providerFilter),
              },
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
                    ids: selection.filtered.providers.map(formatProviderId),
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
