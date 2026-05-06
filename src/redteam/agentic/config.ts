import {
  getRemoteGenerationDisabledError,
  getRemoteGenerationExplicitlyDisabledError,
  neverGenerateRemote,
  shouldGenerateRemote,
} from '../remoteGeneration';

import type { RedteamFileConfig } from '../types';

export const AGENTIC_MODES = ['auto', 'local', 'remote'] as const;

export type AgenticMode = (typeof AGENTIC_MODES)[number];

export interface AgenticConfig {
  mode?: AgenticMode;
  provider?: RedteamFileConfig['provider'];
  promptAdjuster?: AgenticPromptAdjusterConfig;
}

export interface AgenticPromptAdjusterConfig {
  enabled?: boolean;
  instructions?: string;
  contextFiles?: string[];
  inlineContext?: boolean;
  maxContextChars?: number;
  capturePrompt?: boolean;
}

export interface AgenticStrategyConfig {
  agentic?: AgenticConfig;
  redteamProvider?: RedteamFileConfig['provider'];
}

export function getAgenticMode(config?: AgenticStrategyConfig): AgenticMode {
  return config?.agentic?.mode ?? 'auto';
}

export function getAgenticProvider(config?: AgenticStrategyConfig): RedteamFileConfig['provider'] {
  return config?.agentic?.provider ?? config?.redteamProvider;
}

export function getAgenticPromptAdjuster(
  config?: AgenticStrategyConfig,
): AgenticPromptAdjusterConfig | undefined {
  return config?.agentic?.promptAdjuster;
}

export function shouldUseRemoteAgentic(config?: AgenticStrategyConfig): boolean {
  const mode = getAgenticMode(config);

  if (mode === 'local') {
    return false;
  }
  if (mode === 'remote') {
    return true;
  }

  return shouldGenerateRemote({ canUseCodexDefaultProvider: true });
}

export function assertRemoteAgenticAvailable(
  strategyName: string,
  config?: AgenticStrategyConfig,
): void {
  if (!shouldUseRemoteAgentic(config)) {
    return;
  }

  if (!shouldGenerateRemote()) {
    throw new Error(
      neverGenerateRemote()
        ? getRemoteGenerationExplicitlyDisabledError(strategyName)
        : getRemoteGenerationDisabledError(strategyName),
    );
  }
}
