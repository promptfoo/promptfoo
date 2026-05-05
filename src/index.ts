import assertions from './assertions/index';
import * as cache from './cache';
import { evaluateWithSource } from './evaluate';
import guardrails from './guardrails';
import { loadApiProvider, loadApiProviders } from './providers/index';
import { doGenerateRedteam } from './redteam/commands/generate';
import { extractEntities } from './redteam/extraction/entities';
import { extractMcpToolsInfo } from './redteam/extraction/mcpTools';
import { extractSystemPurpose } from './redteam/extraction/purpose';
import { GRADERS } from './redteam/graders';
import { RedteamGraderBase, RedteamPluginBase } from './redteam/plugins/base';
import { Plugins } from './redteam/plugins/index';
import { doRedteamRun } from './redteam/shared';
import { Strategies } from './redteam/strategies/index';

import type { RedteamRunOptions } from './redteam/types';
import type { EvaluateOptions, EvaluateTestSuite } from './types/index';

export { EvalRunError } from './commands/eval';
export { PromptSuggestionsRejectedError } from './evaluator';
export { EmailValidationError } from './globalConfig/accounts';
export { ServerError, type ServerErrorPhase } from './server/errors';
export { generateTable } from './table';
// EVENT_SOURCES, EventSource, EventSourceSchema, isCliEventSource flow through ./types/index.
export * from './types/index';
// Transform types and runtime guard for users passing inline transform functions
// via the Node.js package.
export { isTransformFunction } from './types/transform';
export { ConfigResolutionError } from './util/config/load';

// Extension hook context types for users writing custom extensions
export type {
  AfterAllExtensionHookContext,
  AfterEachExtensionHookContext,
  BeforeAllExtensionHookContext,
  BeforeEachExtensionHookContext,
  ExtensionHookContextMap,
} from './evaluatorHelpers';
export type { TransformContext, TransformFunction, TransformPrompt } from './types/transform';

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
async function evaluate(testSuite: EvaluateTestSuite, options: EvaluateOptions = {}) {
  return evaluateWithSource(testSuite, { ...options, eventSource: 'library' });
}

type LibraryRedteamRunOptions = Omit<RedteamRunOptions, 'eventSource'>;

async function runRedteam(options: LibraryRedteamRunOptions = {}) {
  return doRedteamRun({ ...options, eventSource: 'library' });
}

const redteam = {
  Extractors: {
    extractEntities,
    extractMcpToolsInfo,
    extractSystemPurpose,
  },
  Graders: GRADERS,
  Plugins,
  Strategies,
  Base: {
    Plugin: RedteamPluginBase,
    Grader: RedteamGraderBase,
  },
  generate: doGenerateRedteam,
  run: runRedteam,
};

export { assertions, cache, evaluate, guardrails, loadApiProvider, loadApiProviders, redteam };

export default {
  assertions,
  cache,
  evaluate,
  guardrails,
  loadApiProvider,
  loadApiProviders,
  redteam,
};
