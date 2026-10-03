import { evaluateWithSource } from '../evaluate';

import type { EvaluateOptions, EvaluateTestSuite } from '../types';

/**
 * Run an evaluation test suite.
 *
 * This is the main entry point for programmatic evaluation. It executes all tests
 * against all providers, runs assertions, and returns an eval record.
 *
 * @param testSuite Configuration containing prompts, providers, tests, and metadata
 * @param testSuite.prompts Array of prompts (strings or file paths)
 * @param testSuite.providers Array of provider configurations (e.g., 'openai:gpt-4')
 * @param testSuite.tests Array of test cases with variables and assertions
 * @param testSuite.sharing Optional sharing configuration
 * @param testSuite.outputPath Export path(s); filename extensions select the formats
 * @param testSuite.writeLatestResults Whether to persist results to database
 *
 * @param options Optional evaluation settings
 * @param options.cache Set false to bypass cached provider responses for this call
 * @param options.maxConcurrency Max parallel provider calls
 * @param options.progressCallback Receives progress counts, row context and aggregate metrics
 *
 * @returns Eval record with helpers such as toEvaluateSummary(); writeLatestResults persists it locally
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
 *     providers: ['openai:gpt-5.6', 'anthropic:claude-opus-5'],
 *     tests: testCases,
 *     outputPath: 'eval-results.json',
 *   },
 *   {
 *     cache: false,
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
