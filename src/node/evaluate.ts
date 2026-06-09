import { evaluateWithSource } from '../evaluate';

import type { EvaluateOptions, EvaluateTestSuite } from '../types';

/**
 * Run an eval from a JavaScript or TypeScript program.
 *
 * `testSuite` uses the same concepts as a YAML config, but the Node.js API also
 * accepts function-valued prompts, providers, assertions, and transforms where
 * the corresponding types allow them.
 *
 * @param testSuite - Prompts, providers, tests, and other eval configuration.
 * @param options - Runtime-only evaluation options such as caching and
 * concurrency.
 * @returns The completed eval record. Use helpers such as
 * `toEvaluateSummary()` and `getTable()` to read results; persisted state is
 * written when `writeLatestResults` is enabled.
 *
 * @example
 * ```ts
 * import { evaluate } from 'promptfoo';
 *
 * const evalRecord = await evaluate({
 *   prompts: ['Answer briefly: {{question}}'],
 *   providers: ['openai:chat:gpt-5.5'],
 *   tests: [{ vars: { question: 'What is 2 + 2?' } }],
 * });
 *
 * const summary = await evalRecord.toEvaluateSummary();
 * console.log(summary.stats);
 * ```
 *
 * @public
 */
export async function evaluate(testSuite: EvaluateTestSuite, options: EvaluateOptions = {}) {
  return evaluateWithSource(testSuite, { ...options, eventSource: 'library' });
}

export { evaluateWithSource };
