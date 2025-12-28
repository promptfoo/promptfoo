/**
 * Redteam Generate UI module exports.
 *
 * Note: RedteamGenerateApp and createRedteamGenerateController are intentionally
 * NOT exported here to avoid loading ink at import time. They are dynamically
 * imported inside the runner functions when needed.
 */
export {
  initInkRedteamGenerate,
  type RedteamGenerateResult,
  type RedteamGenerateRunnerOptions,
  type RedteamGenerateUIResult,
  shouldUseInkRedteamGenerate,
} from './redteamGenerateRunner';

// Re-export types only (no runtime loading)
export type {
  GenerateProgress,
  PluginProgress,
  RedteamGenerateAppProps,
  RedteamGenerateController,
  StrategyProgress,
} from './RedteamGenerateApp';
