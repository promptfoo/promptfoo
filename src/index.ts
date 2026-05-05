/**
 * Programmatic API for running promptfoo evals from Node.js.
 *
 * The root package entrypoint is the supported public boundary for the Node.js
 * API. Use the exported functions, namespaces, and types from this module rather
 * than importing deep source files directly.
 *
 * @packageDocumentation
 */

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

import type Eval from './models/eval';
import type { RedteamGenerateOptions, RedteamRunOptions } from './redteam/types';
import type { EvaluateOptions, EvaluateTestSuite, UnifiedConfig } from './types/index';

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
export type {
  AdaptiveModification,
  AdaptiveRequest,
  AdaptiveResult,
  GuardPiiFinding,
  GuardResult,
  GuardResultEntry,
} from './guardrails';
export type { EnvOverrides } from './types/env';
export type { TransformContext, TransformFunction, TransformPrompt } from './types/transform';

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
async function evaluate(
  testSuite: EvaluateTestSuite,
  options: EvaluateOptions = {},
): Promise<Eval> {
  return evaluateWithSource(testSuite, { ...options, eventSource: 'library' });
}

type LibraryRedteamRunOptions = Omit<RedteamRunOptions, 'eventSource'>;

async function runRedteam(options: LibraryRedteamRunOptions = {}) {
  return doRedteamRun({ ...options, eventSource: 'library' });
}

/**
 * Return type produced by `redteam.generate()`.
 *
 * @beta
 */
export type RedteamGenerateResult = Partial<UnifiedConfig> | null;

/**
 * Resolved eval record returned by `redteam.run()`. `undefined` when the run
 * was started but produced no eval (for example, when the operation was
 * cancelled before any results were written).
 *
 * @beta
 */
export type RedteamRunResult = Eval | undefined;

/**
 * Advanced red team helpers exposed through the Node.js package.
 *
 * This surface is still evolving; prefer the CLI and documented red team config
 * flows unless you specifically need programmatic orchestration.
 *
 * @beta
 */
export interface RedteamApi {
  /** Helpers for extracting target metadata before generation. */
  Extractors: {
    extractEntities: typeof extractEntities;
    extractMcpToolsInfo: typeof extractMcpToolsInfo;
    extractSystemPurpose: typeof extractSystemPurpose;
  };
  /** Registered red team graders. */
  Graders: typeof GRADERS;
  /** Built-in red team plugins. */
  Plugins: typeof Plugins;
  /** Built-in red team strategies. */
  Strategies: typeof Strategies;
  /** Base classes for advanced extension points. */
  Base: {
    Plugin: typeof RedteamPluginBase;
    Grader: typeof RedteamGraderBase;
  };
  /** Generate a red team config programmatically. */
  generate(options: RedteamGenerateOptions): Promise<RedteamGenerateResult>;
  /** Run a red team eval programmatically. */
  run(options: RedteamRunOptions): Promise<RedteamRunResult>;
}

/** Implementation of {@link RedteamApi}. @beta */
const redteam: RedteamApi = {
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
