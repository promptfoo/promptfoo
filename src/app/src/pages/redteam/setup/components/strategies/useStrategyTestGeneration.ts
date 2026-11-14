import { useCallback, useMemo } from 'react';

import { type Plugin, type Strategy } from '@promptfoo/redteam/constants';
import { type RedteamStrategyObject, type StrategyConfig } from '@promptfoo/redteam/types';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { useTestCaseGeneration } from '../TestCaseGenerationProvider';

import type { TargetPlugin } from '../testCaseGenerationTypes';

const DEFAULT_TEST_GENERATION_PLUGIN: Plugin = 'harmful:hate';

interface UseStrategyTestGenerationOptions {
  strategyId: Strategy;
}

interface UseStrategyTestGenerationResult {
  strategyConfig: StrategyConfig;
  testGenerationPlugin: Plugin;
  handleTestCaseGeneration: () => Promise<void>;
  isGenerating: boolean;
  isCurrentStrategy: boolean;
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
  const testGenerationTargetPlugin = useMemo<TargetPlugin>(() => {
    const plugins = config.plugins ?? [];
    if (plugins.length === 0) {
      return {
        id: DEFAULT_TEST_GENERATION_PLUGIN,
        config: {},
        isStatic: true,
      };
    }

    const selectedPlugin = plugins[Math.floor(Math.random() * plugins.length)];
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
  }, [config.plugins]);

  const handleTestCaseGeneration = useCallback(async () => {
    await generateTestCase(testGenerationTargetPlugin, {
      id: strategyId,
      config: strategyConfig,
      isStatic: false,
    });
  }, [strategyConfig, generateTestCase, strategyId, testGenerationTargetPlugin]);

  return {
    strategyConfig,
    testGenerationPlugin: testGenerationTargetPlugin.id,
    handleTestCaseGeneration,
    isGenerating,
    isCurrentStrategy: currentStrategy === strategyId,
  };
}
