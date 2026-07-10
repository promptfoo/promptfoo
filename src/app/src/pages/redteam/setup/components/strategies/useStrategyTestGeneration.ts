import { useCallback, useMemo } from 'react';

import { type Plugin, type Strategy } from '@promptfoo/redteam/constants';
import { type RedteamStrategyObject, type StrategyConfig } from '@promptfoo/redteam/types';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { useTestCaseGeneration } from '../TestCaseGenerationProvider';
import { isPluginCompatibleWithStrategy } from './utils';

import type { TargetPlugin } from '../testCaseGenerationTypes';

const DEFAULT_TEST_GENERATION_PLUGIN: Plugin = 'harmful:hate';

interface UseStrategyTestGenerationOptions {
  strategyId: Strategy;
}

interface UseStrategyTestGenerationResult {
  strategyConfig: StrategyConfig;
  testGenerationPlugin: Plugin | null;
  handleTestCaseGeneration: () => Promise<void>;
  isGenerating: boolean;
  isCurrentStrategy: boolean;
  isTestCaseGenerationAvailable: boolean;
}

/**
 * Shared hook for strategy test case generation logic.
 * Used by both StrategyItem and HeroStrategyCard components.
 */
export function useStrategyTestGeneration({
  strategyId,
}: UseStrategyTestGenerationOptions): UseStrategyTestGenerationResult {
  const { config } = useRedTeamConfig();
  const { generateTestCase, isGenerating, strategy: currentStrategy } = useTestCaseGeneration();

  const strategyConfig = useMemo(() => {
    const found = config.strategies.find(
      (s) => typeof s === 'object' && 'id' in s && s.id === strategyId,
    ) as RedteamStrategyObject | undefined;
    return (found?.config ?? {}) as StrategyConfig;
  }, [config.strategies, strategyId]);

  // Select a random plugin from the user's configured plugins, preserving any plugin config.
  const testGenerationTargetPlugin = useMemo<TargetPlugin | null>(() => {
    const configuredPlugins = config.plugins ?? [];
    const plugins =
      configuredPlugins.length > 0
        ? configuredPlugins
        : [
            {
              id: DEFAULT_TEST_GENERATION_PLUGIN,
              config: {},
            },
          ];
    const compatiblePlugins = plugins.filter((plugin) =>
      isPluginCompatibleWithStrategy(plugin, strategyId, strategyConfig),
    );
    if (compatiblePlugins.length === 0) {
      return null;
    }

    const selectedPlugin = compatiblePlugins[Math.floor(Math.random() * compatiblePlugins.length)];
    if (typeof selectedPlugin === 'string') {
      return {
        id: selectedPlugin as Plugin,
        config: {},
        isStatic: true,
      };
    }

    return {
      id: selectedPlugin.id as Plugin,
      config: selectedPlugin.config ?? {},
      isStatic: true,
    };
  }, [config.plugins, strategyConfig, strategyId]);

  const handleTestCaseGeneration = useCallback(async () => {
    if (testGenerationTargetPlugin) {
      await generateTestCase(testGenerationTargetPlugin, {
        id: strategyId,
        config: strategyConfig,
        isStatic: false,
      });
    }
  }, [strategyConfig, generateTestCase, strategyId, testGenerationTargetPlugin]);

  return {
    strategyConfig,
    testGenerationPlugin: testGenerationTargetPlugin?.id ?? null,
    handleTestCaseGeneration,
    isGenerating,
    isCurrentStrategy: currentStrategy === strategyId,
    isTestCaseGenerationAvailable: testGenerationTargetPlugin !== null,
  };
}
