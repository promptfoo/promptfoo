import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import dedent from 'dedent';
import { z } from 'zod';
import logger from '../../../logger';
import type { CommandLineOptions, EvaluateOptions } from '../../../types';
import { loadDefaultConfig } from '../../../util/config/default';
import { resolveConfigs } from '../../../util/config/load';
import { doEval } from '../../eval';
import { createToolResponse } from '../utils';

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
      cache: z.boolean().optional().default(true).describe('Enable caching of results'),
      write: z.boolean().optional().default(false).describe('Write results to database'),
      share: z.boolean().optional().default(false).describe('Create shareable URL for results'),
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

        // If we need to filter test cases or prompts, we need to handle this ourselves
        // since doEval doesn't support these specific filters
        if (testCaseIndices !== undefined || promptFilter !== undefined) {
          // Resolve config to get the test suite first
          const configPaths = configPath ? [configPath] : ['promptfooconfig.yaml'];
          const { config, testSuite } = await resolveConfigs(
            { config: configPaths },
            defaultConfig,
          );

          // Apply our custom filtering
          const filteredTestSuite = { ...testSuite };

          // Filter test cases if specified
          if (testCaseIndices !== undefined && filteredTestSuite.tests) {
            let filteredTests = filteredTestSuite.tests;

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

            filteredTestSuite.tests = filteredTests;
          }

          // Filter prompts if specified
          if (promptFilter !== undefined) {
            const filters = Array.isArray(promptFilter) ? promptFilter : [promptFilter];
            const filteredPrompts = filteredTestSuite.prompts.filter((prompt, index) => {
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

            filteredTestSuite.prompts = filteredPrompts;
          }

          // Use the evaluate function directly instead of doEval for filtered cases
          const { evaluate } = await import('../../../evaluator');
          const Eval = (await import('../../../models/eval')).default;

          const evalRecord = await Eval.create(config, filteredTestSuite.prompts, {
            id: `mcp-eval-${Date.now()}`,
          });

          logger.debug(
            `Running filtered eval with ${filteredTestSuite.tests?.length || 0} test cases, ${filteredTestSuite.prompts.length} prompts, ${filteredTestSuite.providers.length} providers`,
          );

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
          const evalData = {
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
                filters: {
                  testCaseIndices,
                  promptFilter,
                  providerFilter,
                },
              },
              prompts: {
                total: testSuite.prompts.length,
                filtered: filteredTestSuite.prompts.length,
                labels: filteredTestSuite.prompts.map(
                  (p) => p.label || p.raw.slice(0, 50) + (p.raw.length > 50 ? '...' : ''),
                ),
              },
              providers: {
                total: testSuite.providers.length,
                filtered: filteredTestSuite.providers.length,
                ids: filteredTestSuite.providers.map((p) =>
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
              },
            },
            results: {
              stats: summary.stats,
              totalEvals: summary.results.length,
              successRate:
                summary.results.length > 0
                  ? ((summary.stats.successes / summary.results.length) * 100).toFixed(1) + '%'
                  : '0%',
              results: summary.results.slice(0, 20).map((result, index) => ({
                // Limit to first 20 for MCP response size
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
                eval: {
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
                        result.gradingResult.componentResults?.slice(0, 5).map((cr, idx) => ({
                          // Limit to first 5 assertions
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

          return createToolResponse('run_evaluation', true, evalData);
        } else {
          // For simple cases without custom filtering, use doEval directly
          // Prepare command line options that doEval expects
          const cmdObj = {
            config: configPath ? [configPath] : ['promptfooconfig.yaml'],
            maxConcurrency,
            repeat,
            delay,
            cache,
            write,
            share,
            // Set up provider filtering - doEval supports this natively
            filterProviders: Array.isArray(providerFilter)
              ? providerFilter.join('|')
              : providerFilter,
          } as Partial<CommandLineOptions>;

          // Prepare evaluate options
          const evaluateOptions: EvaluateOptions = {
            maxConcurrency,
            eventSource: 'mcp',
            showProgressBar: false, // Disable for MCP usage
          };

          logger.debug(`Running evaluation with config: ${configPath || 'promptfooconfig.yaml'}`);

          // Run the evaluation using the existing doEval function
          const startTime = Date.now();
          const evalResult = await doEval(
            cmdObj as any,
            defaultConfig,
            defaultConfigPath,
            evaluateOptions,
          );
          const endTime = Date.now();

          // Get summary data
          const summary = await evalResult.toEvaluateSummary();

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
                total: summary.results.length,
                filters: {
                  testCaseIndices,
                  promptFilter,
                  providerFilter,
                },
              },
              options: {
                maxConcurrency,
                timeoutMs,
                repeat,
                delay,
                cache,
                write,
                share,
              },
            },
            results: {
              stats: summary.stats,
              totalEvals: summary.results.length,
              successRate:
                summary.results.length > 0
                  ? ((summary.stats.successes / summary.results.length) * 100).toFixed(1) + '%'
                  : '0%',
              results: summary.results.slice(0, 20).map((result, index) => ({
                // Limit to first 20 for MCP response size
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
                eval: {
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
                        result.gradingResult.componentResults?.slice(0, 5).map((cr, idx) => ({
                          // Limit to first 5 assertions
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

          return createToolResponse('run_evaluation', true, evalData);
        }
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
