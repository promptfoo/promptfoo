import assertions from './assertions/index';
import * as cache from './cache';
import guardrails from './guardrails';
import { evaluate } from './node';
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

export { EmailValidationError } from './globalConfig/accounts';
export { generateTable } from './table';
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
  run: doRedteamRun,
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
