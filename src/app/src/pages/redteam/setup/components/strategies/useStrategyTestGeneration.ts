import { useCallback, useMemo } from 'react';

import { type Plugin, type Strategy } from '@promptfoo/redteam/constants';
import { type RedteamStrategyObject, type StrategyConfig } from '@promptfoo/redteam/types';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { useTestCaseGeneration } from '../TestCaseGenerationProvider';

const DEFAULT_TEST_GENERATION_PLUGIN = 'harmful:hate';

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

  // Select a random plugin from the user's configured plugins, or fall back to default
  const testGenerationPlugin = useMemo(() => {
    const plugins = config.plugins?.map((p) => (typeof p === 'string' ? p : p.id)) ?? [];
    if (plugins.length === 0) {
      return DEFAULT_TEST_GENERATION_PLUGIN;
    }
    return plugins[Math.floor(Math.random() * plugins.length)] as Plugin;
  }, [config.plugins]);

  const handleTestCaseGeneration = useCallback(async () => {
    await generateTestCase(
      { id: testGenerationPlugin, config: {}, isStatic: true },
      { id: strategyId, config: strategyConfig, isStatic: false },
    );
  }, [strategyConfig, generateTestCase, strategyId, testGenerationPlugin]);

  return {
    strategyConfig,
    testGenerationPlugin,
    handleTestCaseGeneration,
    isGenerating,
    isCurrentStrategy: currentStrategy === strategyId,
  };
}
