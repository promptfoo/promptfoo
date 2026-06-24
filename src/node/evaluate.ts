import { evaluateWithSource } from '../evaluate';

import type { EvaluateOptions, EvaluateTestSuite } from '../types';

/**
 * Run an evaluation test suite.
 *
 * This is the main entry point for programmatic evaluation. It executes all tests
 * against all providers, runs assertions, and returns a comprehensive summary.
 *
 * @param testSuite Configuration containing prompts, providers, tests, and metadata
 * @param testSuite.prompts Array of prompts (strings or file paths)
 * @param testSuite.providers Array of provider configurations (e.g., 'openai:gpt-4')
 * @param testSuite.tests Array of test cases with variables and assertions
 * @param testSuite.sharing Optional sharing configuration
 * @param testSuite.writeLatestResults Whether to persist results to database
 *
 * @param options Optional evaluation settings
 * @param options.cache Whether to use cached provider responses (default: true)
 * @param options.outputPath File path(s) for saving results (JSON format)
 * @param options.maxConcurrency Max parallel provider calls (default: 10)
 * @param options.onTestComplete Callback invoked after each test completes
 * @param options.nunjucksFilters Custom Nunjucks template filters
 *
 * @returns Eval record with persisted results and helper methods such as `toEvaluateSummary()`
 *
 * @example Basic usage
 * ```typescript
 * import { evaluate } from 'promptfoo';
 *
 * const evalRecord = await evaluate({
 *   prompts: ['What is 2+2?'],
 *   providers: ['openai:gpt-4'],
 *   tests: [
 *     {
 *       vars: {},
 *       assert: [{ type: 'contains', value: '4' }]
 *     }
 *   ]
 * });
 *
 * const summary = await evalRecord.toEvaluateSummary();
 * console.log(`${summary.stats.successes}/${summary.results.length} passed`);
 * ```
 *
 * @example With output file and caching disabled
 * ```typescript
 * const evalRecord = await evaluate(
 *   {
 *     prompts: ['prompts.txt'],
 *     providers: ['openai:gpt-4', 'anthropic:claude-3-opus'],
 *     tests: testCases
 *   },
 *   {
 *     cache: false,
 *     outputPath: 'eval-results.json',
 *     maxConcurrency: 5
 *   }
 * );
 * ```
 *
 * @see loadApiProvider for loading individual providers
 * @see runAssertion for testing specific outputs
 */
export async function evaluate(testSuite: EvaluateTestSuite, options: EvaluateOptions = {}) {
  return evaluateWithSource(testSuite, { ...options, eventSource: 'library' });
}

export { evaluateWithSource };
