import { useCallback, useMemo } from 'react';

import { type Plugin, type Strategy } from '@promptfoo/redteam/constants';
import { type RedteamStrategyObject, type StrategyConfig } from '@promptfoo/redteam/types';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { getStrategyPreviewPlugins, INCOMPATIBLE_PREVIEW_MESSAGE } from '../../utils/plugins';
import { useTestCaseGeneration } from '../TestCaseGenerationProvider';

import type { TargetPlugin } from '../testCaseGenerationTypes';

interface UseStrategyTestGenerationOptions {
  strategyId: Strategy;
}

interface UseStrategyTestGenerationResult {
  strategyConfig: StrategyConfig;
  testGenerationPlugin: Plugin | null;
  previewDisabledReason?: string;
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
  const testGenerationTargetPlugin = useMemo<TargetPlugin | null>(() => {
    const plugins = getStrategyPreviewPlugins(config.plugins, strategyId);
    if (!plugins.length) {
      return null;
    }
    const selectedPlugin = plugins[Math.floor(Math.random() * plugins.length)];
    return { ...selectedPlugin, isStatic: true };
  }, [config.plugins, strategyId]);

  const handleTestCaseGeneration = useCallback(async () => {
    if (!testGenerationTargetPlugin) {
      return;
    }
    await generateTestCase(testGenerationTargetPlugin, {
      id: strategyId,
      config: strategyConfig,
      isStatic: false,
    });
  }, [strategyConfig, generateTestCase, strategyId, testGenerationTargetPlugin]);

  return {
    strategyConfig,
    testGenerationPlugin: testGenerationTargetPlugin?.id ?? null,
    previewDisabledReason: testGenerationTargetPlugin ? undefined : INCOMPATIBLE_PREVIEW_MESSAGE,
    handleTestCaseGeneration,
    isGenerating,
    isCurrentStrategy: currentStrategy === strategyId,
  };
}
