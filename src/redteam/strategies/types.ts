import { redteamProviderManager } from '../providers/shared';

import type { ApiProvider, TestCase, TestCaseWithPlugin } from '../../types/index';
import type { RedteamProviderSelection } from '../providers/shared';

/**
 * Values needed while a strategy is executing but which must never become part of its config.
 * Strategy config is serialized for remote generation and persisted in generated test cases.
 */
export interface StrategyRuntimeContext {
  generationProviderSelection?: RedteamProviderSelection;
  wrapGenerationProvider?: (provider: ApiProvider) => ApiProvider;
}

/**
 * Remote task handlers can reproduce only the built-in default selection today.
 * Explicit, cached, and route-fallback providers stay local so generation does
 * not silently switch to the remote service's default backend.
 */
export function canGenerateRemoteWithSelection(runtimeContext?: StrategyRuntimeContext): boolean {
  const selection = runtimeContext?.generationProviderSelection;
  return !selection || selection.source === 'default';
}

/**
 * Resolves the provider a local strategy phase should call without re-running
 * global precedence. Declarative specs remain runtime-only here, allowing JSON
 * variants without ever serializing provider options.
 */
export async function getStrategyGenerationProvider({
  runtimeContext,
  jsonOnly = false,
  preferSmallModel = false,
  preferMultilingualProvider = false,
}: {
  runtimeContext?: StrategyRuntimeContext;
  jsonOnly?: boolean;
  preferSmallModel?: boolean;
  preferMultilingualProvider?: boolean;
}): Promise<ApiProvider> {
  const selection = runtimeContext?.generationProviderSelection;
  const wrap = (provider: ApiProvider) =>
    runtimeContext?.wrapGenerationProvider
      ? runtimeContext.wrapGenerationProvider(provider)
      : provider;

  if (!selection || selection.source === 'default') {
    if (preferMultilingualProvider) {
      const multilingualProvider = await redteamProviderManager.getMultilingualProvider();
      if (multilingualProvider) {
        return wrap(multilingualProvider);
      }
    }

    const provider = selection
      ? await redteamProviderManager.getDefaultProvider({ jsonOnly, preferSmallModel })
      : await redteamProviderManager.getProvider({ jsonOnly, preferSmallModel });
    return wrap(provider);
  }

  if (selection.localProviderSpec) {
    const provider = await redteamProviderManager.getProvider({
      provider: selection.localProviderSpec,
      jsonOnly,
      preferSmallModel,
    });
    return wrap(provider);
  }

  return selection.provider;
}

/**
 * Adds the request-scoped generation provider to a generated attack-provider config
 * only when it has a persistable provider ID. Provider option objects are deliberately
 * excluded: they can contain resolved env values, API keys, or authorization headers.
 */
export function withPersistableGenerationProvider(
  config: Record<string, any>,
  runtimeContext?: StrategyRuntimeContext,
): Record<string, any> {
  const persistableId = runtimeContext?.generationProviderSelection?.persistableId;
  if (!persistableId || config.redteamProvider !== undefined) {
    return config;
  }

  return {
    ...config,
    redteamProvider: persistableId,
  };
}

export interface Strategy {
  id: string;
  action: (
    testCases: TestCaseWithPlugin[],
    injectVar: string,
    config: Record<string, any>,
    strategyId?: string,
    runtimeContext?: StrategyRuntimeContext,
  ) => Promise<TestCase[]>;
  /** Whether this strategy requires pre-extracted intent/goal metadata on test cases. */
  requiresGoalExtraction?: boolean;
}
