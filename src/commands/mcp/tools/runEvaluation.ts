import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dedent from 'dedent';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';
import { evaluate } from '../../../evaluator';
import logger from '../../../logger';
import Eval from '../../../models/eval';
import type { TestSuite } from '../../../types';
import { TestSuiteSchema, UnifiedConfigSchema } from '../../../types';
import { loadDefaultConfig } from '../../../util/config/default';
import { resolveConfigs } from '../../../util/config/load';
import { createToolResponse } from '../utils';

/**
 * Run an evaluation from a promptfoo config with optional test case filtering
 *
 * Use this tool to:
 * - Test specific test cases from a promptfoo configuration
 * - Debug individual test scenarios without running full evaluations
 * - Validate changes to prompts, providers, or assertions quickly
 * - Run targeted evaluations during development and testing
 *
 * Features:
 * - Load any promptfoo configuration file
 * - Select specific test cases by index or range
 * - Filter by specific prompts and/or providers
 * - Run full evaluation pipeline with all assertions and scoring
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
            Filter to specific prompts by label or index.
            Examples: "my-prompt", ["prompt1", "prompt2"]
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
        .describe('Maximum concurrent evaluations (1-20, default: 4)'),
      timeoutMs: z
        .number()
        .min(1000)
        .max(300000)
        .optional()
        .describe('Timeout per evaluation in milliseconds (1s-5min, default: 30s)'),
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
        } = args;

        // Load default config
        let defaultConfig;
        try {
          const result = await loadDefaultConfig();
          defaultConfig = result.defaultConfig;
        } catch (error) {
          return createToolResponse(
            'run_evaluation',
            false,
            undefined,
            `Failed to load default config: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }

        // Resolve configuration
        const configPaths = configPath ? [configPath] : ['promptfooconfig.yaml'];
        const { config, testSuite } = await resolveConfigs({ config: configPaths }, defaultConfig);

        // Validate configuration
        const configParse = UnifiedConfigSchema.safeParse(config);
        if (!configParse.success) {
          return createToolResponse(
            'run_evaluation',
            false,
            undefined,
            `Configuration validation error: ${fromError(configParse.error).message}`,
          );
        }

        const suiteParse = TestSuiteSchema.safeParse(testSuite);
        if (!suiteParse.success) {
          return createToolResponse(
            'run_evaluation',
            false,
            undefined,
            `Test suite validation error: ${fromError(suiteParse.error).message}`,
          );
        }

        // Filter test cases if specified
        let filteredTests = testSuite.tests || [];
        if (testCaseIndices !== undefined) {
          if (typeof testCaseIndices === 'number') {
            // Single index
            if (testCaseIndices < 0 || testCaseIndices >= filteredTests.length) {
              return createToolResponse(
                'run_evaluation',
                false,
                undefined,
                `Test case index ${testCaseIndices} is out of range. Available indices: 0-${filteredTests.length - 1}`,
              );
            }
            filteredTests = [filteredTests[testCaseIndices]];
          } else if (Array.isArray(testCaseIndices)) {
            // Multiple indices
            const invalidIndices = testCaseIndices.filter(
              (i) => i < 0 || i >= filteredTests.length,
            );
            if (invalidIndices.length > 0) {
              return createToolResponse(
                'run_evaluation',
                false,
                undefined,
                `Invalid test case indices: ${invalidIndices.join(', ')}. Available indices: 0-${filteredTests.length - 1}`,
              );
            }
            filteredTests = testCaseIndices.map((i) => filteredTests[i]);
          } else {
            // Range
            const { start, end } = testCaseIndices;
            if (start < 0 || end > filteredTests.length || start >= end) {
              return createToolResponse(
                'run_evaluation',
                false,
                undefined,
                `Invalid range: start=${start}, end=${end}. Available indices: 0-${filteredTests.length - 1}`,
              );
            }
            filteredTests = filteredTests.slice(start, end);
          }
        }

        // Filter prompts if specified
        let filteredPrompts = testSuite.prompts;
        if (promptFilter) {
          const filters = Array.isArray(promptFilter) ? promptFilter : [promptFilter];
          filteredPrompts = testSuite.prompts.filter((prompt, index) => {
            const label = prompt.label || prompt.raw;
            return filters.includes(label) || filters.includes(index.toString());
          });

          if (filteredPrompts.length === 0) {
            return createToolResponse(
              'run_evaluation',
              false,
              undefined,
              `No prompts matched filter: ${Array.isArray(promptFilter) ? promptFilter.join(', ') : promptFilter}`,
            );
          }
        }

        // Filter providers if specified
        let filteredProviders = testSuite.providers;
        if (providerFilter) {
          const filters = Array.isArray(providerFilter) ? providerFilter : [providerFilter];
          filteredProviders = testSuite.providers.filter((provider) => {
            const providerId = typeof provider.id === 'function' ? provider.id() : provider.id;
            const providerLabel = provider.label || providerId;
            return filters.some(
              (filter) =>
                providerId.includes(filter) ||
                providerLabel.includes(filter) ||
                filter === providerId ||
                filter === providerLabel,
            );
          });

          if (filteredProviders.length === 0) {
            return createToolResponse(
              'run_evaluation',
              false,
              undefined,
              `No providers matched filter: ${Array.isArray(providerFilter) ? providerFilter.join(', ') : providerFilter}`,
            );
          }
        }

        // Create filtered test suite
        const filteredTestSuite: TestSuite = {
          ...testSuite,
          prompts: filteredPrompts,
          providers: filteredProviders,
          tests: filteredTests,
        };

        logger.debug(
          `Running evaluation with ${filteredTests.length} test cases, ${filteredPrompts.length} prompts, ${filteredProviders.length} providers`,
        );

        // Create evaluation record
        const evalRecord = await Eval.create(config, filteredTestSuite.prompts, {
          id: `mcp-eval-${Date.now()}`,
        });

        // Run the evaluation
        const startTime = Date.now();
        const result = await evaluate(filteredTestSuite, evalRecord, {
          maxConcurrency,
          timeoutMs,
          eventSource: 'mcp',
        });

        const endTime = Date.now();
        const summary = await result.toEvaluateSummary();

        // Prepare detailed response
        const evaluationData = {
          evaluation: {
            id: result.id,
            status: 'completed',
            duration: endTime - startTime,
            timestamp: new Date().toISOString(),
          },
          configuration: {
            configPath: configPath || 'promptfooconfig.yaml',
            testCases: {
              total: testSuite.tests?.length || 0,
              filtered: filteredTests.length,
              indices: testCaseIndices,
            },
            prompts: {
              total: testSuite.prompts.length,
              filtered: filteredPrompts.length,
              labels: filteredPrompts.map(
                (p) => p.label || p.raw.slice(0, 50) + (p.raw.length > 50 ? '...' : ''),
              ),
            },
            providers: {
              total: testSuite.providers.length,
              filtered: filteredProviders.length,
              ids: filteredProviders.map((p) => (typeof p.id === 'function' ? p.id() : p.id)),
            },
            options: {
              maxConcurrency,
              timeoutMs,
            },
          },
          results: {
            stats: summary.stats,
            totalEvaluations: summary.results.length,
            successRate:
              summary.results.length > 0
                ? ((summary.stats.successes / summary.results.length) * 100).toFixed(1) + '%'
                : '0%',
            results: summary.results.map((result, index) => ({
              index,
              testCase: {
                description: result.testCase.description,
                vars: result.vars,
              },
              prompt: {
                label: result.prompt.label,
                raw:
                  result.prompt.raw.slice(0, 100) + (result.prompt.raw.length > 100 ? '...' : ''),
              },
              provider: {
                id: result.provider.id,
                label: result.provider.label,
              },
              response: {
                output: result.response?.output
                  ? typeof result.response.output === 'string'
                    ? result.response.output.slice(0, 200) +
                      (result.response.output.length > 200 ? '...' : '')
                    : JSON.stringify(result.response.output).slice(0, 200)
                  : null,
                tokenUsage: result.tokenUsage,
                cost: result.cost,
                latencyMs: result.latencyMs,
              },
              evaluation: {
                success: result.success,
                score: result.score,
                namedScores: result.namedScores,
                error: result.error,
                failureReason: result.failureReason,
              },
              assertions: result.gradingResult
                ? {
                    totalAssertions: result.testCase.assert?.length || 0,
                    passedAssertions:
                      result.gradingResult.componentResults?.filter((r) => r.pass).length || 0,
                    failedAssertions:
                      result.gradingResult.componentResults?.filter((r) => !r.pass).length || 0,
                    componentResults:
                      result.gradingResult.componentResults?.map((cr, idx) => ({
                        index: idx,
                        type: result.testCase.assert?.[idx]?.type || 'unknown',
                        pass: cr.pass,
                        score: cr.score,
                        reason: cr.reason.slice(0, 100) + (cr.reason.length > 100 ? '...' : ''),
                        metric: result.testCase.assert?.[idx]?.metric,
                      })) || [],
                  }
                : null,
            })),
          },
          prompts:
            summary.version === 3 && 'prompts' in summary
              ? (summary as any).prompts.map((prompt: any) => ({
                  label: prompt.label,
                  provider: prompt.provider,
                  metrics: prompt.metrics,
                }))
              : [],
        };

        return createToolResponse('run_evaluation', true, evaluationData);
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
