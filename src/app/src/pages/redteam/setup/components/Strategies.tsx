import { useCallback, useEffect, useMemo, useState } from 'react';

import { Alert, AlertContent, AlertDescription, AlertTitle } from '@app/components/ui/alert';
import { Separator } from '@app/components/ui/separator';
import { useApiHealth } from '@app/hooks/useApiHealth';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import {
  AGENTIC_STRATEGIES_SET,
  ALL_STRATEGIES,
  DEFAULT_STRATEGIES_SET,
  MULTI_MODAL_STRATEGIES_SET,
  MULTI_TURN_STRATEGIES,
  MULTI_TURN_STRATEGY_SET,
  STRATEGIES_REQUIRING_REMOTE_SET,
  strategyDescriptions,
  strategyDisplayNames,
} from '@promptfoo/redteam/constants';
import { AlertTriangle } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import EstimationsDisplay from './EstimationsDisplay';
import PageWrapper from './PageWrapper';
import StrategyConfigDialog from './StrategyConfigDialog';
import { AgenticStrategiesGroup } from './strategies/AgenticStrategiesGroup';
import { PresetSelector } from './strategies/PresetSelector';
import { RecommendedOptions } from './strategies/RecommendedOptions';
import { StrategySection } from './strategies/StrategySection';
import { SystemConfiguration } from './strategies/SystemConfiguration';
import { type PresetId, STRATEGY_PRESETS, type StrategyPreset } from './strategies/types';
import {
  getStrategyId,
  isStrategyConfigured,
  STRATEGIES_REQUIRING_CONFIG,
} from './strategies/utils';
import { TestCaseGenerationProvider } from './TestCaseGenerationProvider';
import type { RedteamStrategyObject, StrategyConfig } from '@promptfoo/redteam/types';

import type { ConfigDialogState, StrategyCardData } from './strategies/types';

// ------------------------------------------------------------------
// Types & Interfaces
// ------------------------------------------------------------------

interface StrategiesProps {
  onNext: () => void;
  onBack: () => void;
}

interface CustomPreset {
  name: 'Custom';
}

type PresetWithName = StrategyPreset | CustomPreset;

// UI-friendly description overrides
const UI_STRATEGY_DESCRIPTIONS: Record<string, string> = {
  basic:
    'Standard testing without additional attack strategies. Tests prompts as-is to establish baseline behavior.',
  layer:
    'Applies multiple transformation strategies sequentially, where each step modifies test cases before passing to the next step.',
};

const availableStrategies: StrategyCardData[] = ALL_STRATEGIES.filter(
  (id) => id !== 'default' && id !== 'multilingual',
).map((id) => ({
  id,
  name: strategyDisplayNames[id] || id,
  description: UI_STRATEGY_DESCRIPTIONS[id] || strategyDescriptions[id],
}));

export default function Strategies({ onNext, onBack }: StrategiesProps) {
  const { config, updateConfig } = useRedTeamConfig();
  const { recordEvent } = useTelemetry();
  const toast = useToast();
  const {
    data: { status: apiHealthStatus },
  } = useApiHealth();

  const [isStatefulValue, setIsStatefulValue] = useState(config.target?.config?.stateful === true);
  const [isMultiTurnEnabled, setIsMultiTurnEnabled] = useState(() =>
    config.strategies.some((s) => s && MULTI_TURN_STRATEGY_SET.has(getStrategyId(s))),
  );

  const [configDialog, setConfigDialog] = useState<ConfigDialogState>({
    isOpen: false,
    selectedStrategy: null,
  });

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_strategies' });
  }, [recordEvent]);

  const isRemoteGenerationDisabled = apiHealthStatus === 'disabled';

  const isStrategyDisabled = useCallback(
    (strategyId: string) => {
      return isRemoteGenerationDisabled && STRATEGIES_REQUIRING_REMOTE_SET.has(strategyId);
    },
    [isRemoteGenerationDisabled],
  );

  const selectedStrategyIds = useMemo(() => {
    return config.strategies
      .filter((s) => {
        const id = getStrategyId(s);
        // Special handling for 'basic' strategy - only consider it selected if enabled !== false
        if (id === 'basic' && typeof s === 'object' && s.config?.enabled === false) {
          return false;
        }
        return true;
      })
      .map((s) => getStrategyId(s));
  }, [config.strategies]);

  // Categorize strategies by type
  const categorizedStrategies = useMemo(() => {
    const recommended = availableStrategies.filter((s) => DEFAULT_STRATEGIES_SET.has(s.id));

    const allAgentic = availableStrategies.filter((s) => AGENTIC_STRATEGIES_SET.has(s.id));

    // Split agentic into single-turn and multi-turn
    const agenticSingleTurn = allAgentic.filter((s) => !MULTI_TURN_STRATEGY_SET.has(s.id));

    // Preserve the order from MULTI_TURN_STRATEGIES for agentic multi-turn strategies
    const agenticMultiTurn = MULTI_TURN_STRATEGIES.map((strategyId) =>
      availableStrategies.find((s) => s.id === strategyId && AGENTIC_STRATEGIES_SET.has(s.id)),
    ).filter(Boolean) as StrategyCardData[];

    const multiModal = availableStrategies.filter((s) => MULTI_MODAL_STRATEGIES_SET.has(s.id));

    // Get other strategies that aren't in the above categories
    const other = availableStrategies.filter(
      (s) =>
        !DEFAULT_STRATEGIES_SET.has(s.id) &&
        !AGENTIC_STRATEGIES_SET.has(s.id) &&
        !MULTI_MODAL_STRATEGIES_SET.has(s.id),
    );

    return {
      recommended,
      agenticSingleTurn,
      agenticMultiTurn,
      multiModal,
      other,
    };
  }, []);

  // Determine the initially selected preset
  const initialPreset = useMemo(() => {
    if (!Array.isArray(config.strategies)) {
      console.warn('Invalid strategies configuration');
      return 'Custom';
    }
    const hasMultiTurn = config.strategies.some(
      (s) => s && MULTI_TURN_STRATEGY_SET.has(getStrategyId(s)),
    );

    const matchedPresetId = Object.entries(STRATEGY_PRESETS).find(([_presetId, preset]) => {
      if (!preset) {
        return false;
      }
      if (preset.options?.multiTurn) {
        const expected = hasMultiTurn
          ? [...preset.strategies, ...preset.options.multiTurn.strategies]
          : preset.strategies;

        return (
          expected.length === config.strategies.length &&
          expected.every((sid) => config.strategies.some((s) => getStrategyId(s) === sid))
        );
      }
      return (
        preset.strategies.length === config.strategies.length &&
        preset.strategies.every((sid) => config.strategies.some((s) => getStrategyId(s) === sid))
      );
    })?.[0];

    return matchedPresetId || 'Custom';
  }, [config.strategies]);

  const [selectedPreset, setSelectedPreset] = useState<PresetId | 'Custom'>(
    initialPreset as PresetId | 'Custom',
  );

  // ----------------------------------------------
  // Handlers
  // ----------------------------------------------

  const handlePresetSelect = useCallback(
    (preset: PresetWithName) => {
      recordEvent('feature_used', {
        feature: 'redteam_config_strategy_preset_selected',
        preset: preset.name,
      });

      if (preset.name === 'Custom') {
        setSelectedPreset('Custom');
        return;
      }

      // Find the preset ID by matching the name
      const presetId = Object.entries(STRATEGY_PRESETS).find(
        ([_, p]) => p.name === preset.name,
      )?.[0] as PresetId;

      if (!presetId) {
        console.warn('Invalid preset selected');
        return;
      }

      setSelectedPreset(presetId);

      // At this point we know it's a StrategyPreset
      const strategyPreset = STRATEGY_PRESETS[presetId];
      let allStrategyIds: string[];

      if (strategyPreset.options?.multiTurn && isMultiTurnEnabled) {
        allStrategyIds = [
          ...strategyPreset.strategies,
          ...strategyPreset.options.multiTurn.strategies,
        ];
      } else {
        allStrategyIds = [...strategyPreset.strategies];
      }

      // Filter out disabled strategies
      const enabledStrategyIds = allStrategyIds.filter((id) => !isStrategyDisabled(id));
      const skippedStrategyIds = allStrategyIds.filter((id) => isStrategyDisabled(id));

      // Show toast if any strategies were skipped
      if (skippedStrategyIds.length > 0) {
        const skippedNames = skippedStrategyIds
          .map((id) => (strategyDisplayNames as Record<string, string>)[id] || id)
          .join(', ');
        toast.showToast(
          `Skipped ${skippedStrategyIds.length} disabled ${skippedStrategyIds.length === 1 ? 'strategy' : 'strategies'}: ${skippedNames}`,
          'warning',
        );
      }

      updateConfig(
        'strategies',
        enabledStrategyIds.map((id: string) => ({ id })),
      );
    },
    [recordEvent, isMultiTurnEnabled, updateConfig, isStrategyDisabled, toast],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const handleStrategyToggle = useCallback(
    (strategyId: string) => {
      if (isStrategyDisabled(strategyId)) {
        toast.showToast(
          'This strategy requires remote generation to be enabled. Unset PROMPTFOO_DISABLE_REMOTE_GENERATION or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION.',
          'error',
        );
        return;
      }

      // Check if strategy is selected (for 'basic', only if enabled !== false)
      const isSelected = selectedStrategyIds.includes(strategyId);

      if (!isSelected) {
        recordEvent('feature_used', {
          feature: 'redteam_config_strategy_selected',
          strategy: strategyId,
        });
      }

      // Once user toggles, it's definitely "Custom" preset
      setSelectedPreset('Custom');

      if (isSelected) {
        // Special handling for 'basic' strategy
        // When unchecking, set enabled: false instead of removing it
        if (strategyId === 'basic') {
          const updated = config.strategies.map((s) => {
            if (getStrategyId(s) === 'basic') {
              return {
                id: 'basic',
                config: { ...(typeof s === 'object' ? s.config : {}), enabled: false },
              };
            }
            return s;
          });
          updateConfig('strategies', updated);
        } else {
          // Remove strategy
          updateConfig(
            'strategies',
            config.strategies.filter((s) => getStrategyId(s) !== strategyId),
          );
        }
      } else {
        // Special handling for 'basic' strategy when enabling
        if (strategyId === 'basic') {
          const existingBasic = config.strategies.find((s) => getStrategyId(s) === 'basic');

          if (existingBasic) {
            // Re-enable existing basic strategy by removing enabled: false or setting enabled: true
            const updated = config.strategies.map((s) => {
              if (getStrategyId(s) === 'basic') {
                // Remove the enabled: false config to return to default enabled state
                const config = typeof s === 'object' && s.config ? { ...s.config } : {};
                delete config.enabled;
                // If config is now empty, just return the id
                return Object.keys(config).length === 0 ? { id: 'basic' } : { id: 'basic', config };
              }
              return s;
            });
            updateConfig('strategies', updated);
          } else {
            // Add basic strategy if it doesn't exist
            updateConfig('strategies', [...config.strategies, { id: 'basic' }]);
          }
        } else {
          // Add strategy with stateful config if it's multi-turn
          const newStrategy: RedteamStrategyObject = {
            id: strategyId,
            config: {},
          };

          if (MULTI_TURN_STRATEGY_SET.has(strategyId)) {
            newStrategy.config = { ...newStrategy.config, stateful: isStatefulValue };
          }

          updateConfig('strategies', [...config.strategies, newStrategy]);

          // Auto-open config dialog for strategies that require configuration
          if (STRATEGIES_REQUIRING_CONFIG.includes(strategyId)) {
            setConfigDialog({
              isOpen: true,
              selectedStrategy: strategyId,
            });
          }
        }
      }
    },
    [
      config.strategies,
      recordEvent,
      updateConfig,
      isStatefulValue,
      isStrategyDisabled,
      toast,
      setConfigDialog,
    ],
  );

  const handleSelectNoneInSection = useCallback(
    (strategyIds: string[]) => {
      // Once user deselects all, it's definitely "Custom" preset
      setSelectedPreset('Custom');

      // Check if 'basic' is in the section being deselected
      const hasBasic = strategyIds.includes('basic');

      if (hasBasic) {
        // Special handling for basic strategy - set enabled: false instead of removing
        const updated = config.strategies.map((s) => {
          const id = getStrategyId(s);
          if (id === 'basic') {
            return {
              id: 'basic',
              config: { ...(typeof s === 'object' ? s.config : {}), enabled: false },
            };
          }
          return s;
        });

        // Remove all other strategies in the section (except basic)
        const filtered = updated.filter(
          (s) => !strategyIds.includes(getStrategyId(s)) || getStrategyId(s) === 'basic',
        );

        updateConfig('strategies', filtered);
      } else {
        // Remove all strategies in the given section
        updateConfig(
          'strategies',
          config.strategies.filter((s) => !strategyIds.includes(getStrategyId(s))),
        );
      }
    },
    [config.strategies, updateConfig],
  );

  const handleMultiTurnChange = useCallback(
    (checked: boolean) => {
      setIsMultiTurnEnabled(checked);

      // Get multi-turn strategies from the preset, or use the global MULTI_TURN_STRATEGIES
      const preset = STRATEGY_PRESETS[selectedPreset as PresetId];
      const presetMultiTurnStrategies = preset?.options?.multiTurn?.strategies;

      // Use preset strategies if available, otherwise use all multi-turn strategies
      const multiTurnStrategiesToUse = presetMultiTurnStrategies || MULTI_TURN_STRATEGIES;

      if (checked) {
        // Filter out disabled strategies
        const enabledMultiTurnIds = multiTurnStrategiesToUse.filter(
          (id) => !isStrategyDisabled(id),
        );
        const skippedMultiTurnIds = multiTurnStrategiesToUse.filter((id) => isStrategyDisabled(id));

        // Show toast if any strategies were skipped
        if (skippedMultiTurnIds.length > 0) {
          const skippedNames = skippedMultiTurnIds
            .map((id) => (strategyDisplayNames as Record<string, string>)[id] || id)
            .join(', ');
          toast.showToast(
            `Skipped ${skippedMultiTurnIds.length} disabled ${skippedMultiTurnIds.length === 1 ? 'strategy' : 'strategies'}: ${skippedNames}`,
            'warning',
          );
        }

        // Add enabled multi-turn strategies
        const multiTurnStrats = enabledMultiTurnIds.map((id: string) => ({
          id,
          config: { stateful: isStatefulValue },
        }));

        const newStrats = [
          ...config.strategies,
          ...multiTurnStrats.filter(
            (mts) => !config.strategies.some((existing) => getStrategyId(existing) === mts.id),
          ),
        ];
        updateConfig('strategies', newStrats);
      } else {
        // Remove all multi-turn strategies
        const filtered = config.strategies.filter(
          (s) => !MULTI_TURN_STRATEGY_SET.has(getStrategyId(s)),
        );
        updateConfig('strategies', filtered);
      }
    },
    [config.strategies, updateConfig, isStatefulValue, selectedPreset, isStrategyDisabled, toast],
  );

  const handleStatefulChange = useCallback(
    (isStateful: boolean) => {
      setIsStatefulValue(isStateful);

      // Update the target config
      updateConfig('target', {
        ...config.target,
        config: {
          ...config.target.config,
          stateful: isStateful,
        },
      });

      // Update existing multi-turn strategies with new stateful value
      const updated = config.strategies.map((s) => {
        const id = getStrategyId(s);
        if (MULTI_TURN_STRATEGY_SET.has(id)) {
          return {
            id,
            config: { ...(typeof s === 'object' ? s.config : {}), stateful: isStateful },
          };
        }
        return s;
      });

      updateConfig('strategies', updated);
    },
    [config.target, config.strategies, updateConfig],
  );

  const handleConfigClick = useCallback((strategyId: string) => {
    setConfigDialog({
      isOpen: true,
      selectedStrategy: strategyId,
    });
  }, []);

  const updateStrategyConfig = useCallback(
    (strategyId: string, newConfig: Partial<StrategyConfig>) => {
      const updated = config.strategies.map((s) => {
        if (getStrategyId(s) === strategyId) {
          return {
            id: strategyId,
            config: { ...(typeof s === 'object' ? s.config : {}), ...newConfig },
          };
        }
        return s;
      });
      updateConfig('strategies', updated);
    },
    [config.strategies, updateConfig],
  );

  // Check if a specific strategy is configured
  const isStrategyConfiguredById = useCallback(
    (strategyId: string): boolean => {
      const strategy = config.strategies.find((s) => getStrategyId(s) === strategyId);
      return strategy ? isStrategyConfigured(strategyId, strategy) : true;
    },
    [config.strategies],
  );

  // Validation function to check if all selected strategies are properly configured
  const isStrategyConfigValid = useCallback(() => {
    return config.strategies.every((strategy) =>
      isStrategyConfigured(getStrategyId(strategy), strategy),
    );
  }, [config.strategies]);

  const getNextButtonTooltip = useCallback(() => {
    if (!isStrategyConfigValid()) {
      const unconfiguredStrategies = config.strategies
        .filter((strategy) => {
          const strategyId = getStrategyId(strategy);
          return !isStrategyConfigured(strategyId, strategy);
        })
        .map((s) => getStrategyId(s));

      if (unconfiguredStrategies.length > 0) {
        return `Please configure the following ${unconfiguredStrategies.length === 1 ? 'strategy' : 'strategies'}: ${unconfiguredStrategies.join(', ')}`;
      }
    }
    return '';
  }, [config.strategies, isStrategyConfigValid]);

  // ----------------------------------------------
  // Derived states
  // ----------------------------------------------

  // Check if user has selected all or most strategies
  const hasSelectedMostStrategies = useMemo(() => {
    const totalAvailable = availableStrategies.length;
    const totalSelected = selectedStrategyIds.length;
    // Show warning if more than 80% of strategies are selected or all strategies are selected
    return totalSelected >= totalAvailable * 0.8 || totalSelected === totalAvailable;
  }, [selectedStrategyIds]);

  const showSystemConfig = config.strategies.some((s) =>
    ['goat', 'crescendo'].includes(getStrategyId(s)),
  );

  const selectedPresetHasAgenticStrategies =
    selectedPreset &&
    selectedPreset !== 'Custom' &&
    (STRATEGY_PRESETS[selectedPreset as PresetId]?.strategies ?? []).some((s) =>
      AGENTIC_STRATEGIES_SET.has(s),
    );

  // ----------------------------------------------
  // Render
  // ----------------------------------------------

  return (
    <PageWrapper
      title="Strategies"
      description={
        <div className="max-w-[1200px]">
          <p className="mb-4">
            Strategies are attack techniques that systematically probe LLM applications for
            vulnerabilities. While plugins generate adversarial inputs, strategies determine how
            these inputs are delivered to maximize attack success rates.{' '}
            <RouterLink
              className="underline"
              to="https://www.promptfoo.dev/docs/red-team/strategies/"
              target="_blank"
            >
              Learn More
            </RouterLink>
          </p>
          <p>
            Choose the red team strategies that will guide how attacks are generated and executed.
          </p>
        </div>
      }
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!isStrategyConfigValid()}
      warningMessage={getNextButtonTooltip()}
    >
      {/* Warning banner when remote generation is disabled - full width sticky */}
      {isRemoteGenerationDisabled && (
        <Alert variant="warning" className="sticky top-0 z-10 -mx-3 mb-3 rounded-none shadow-sm">
          <AlertTriangle className="size-4" />
          <AlertContent>
            <AlertTitle>Remote Generation Disabled</AlertTitle>
            <AlertDescription>
              Some strategies require remote generation and are currently unavailable. These
              strategies include GOAT, GCG, audio, video, and other advanced attack techniques. To
              enable them, unset the <code>PROMPTFOO_DISABLE_REMOTE_GENERATION</code> or{' '}
              <code>PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION</code> environment variables.
            </AlertDescription>
          </AlertContent>
        </Alert>
      )}

      {/* Warning banner when all/most strategies are selected - full width sticky */}
      {hasSelectedMostStrategies && (
        <Alert variant="warning" className="sticky top-0 z-[9] -mx-3 mb-3 rounded-none shadow-sm">
          <AlertTriangle className="size-4" />
          <AlertContent>
            <AlertTitle>Performance Warning: Too Many Strategies Selected</AlertTitle>
            <AlertDescription>
              Selecting many strategies is usually not efficient and will significantly increase
              evaluation time and cost. It's recommended to use the preset configurations or select
              only the strategies specifically needed for your use case.
            </AlertDescription>
          </AlertContent>
        </Alert>
      )}

      <TestCaseGenerationProvider redTeamConfig={config} allowPluginChange>
        <div>
          <EstimationsDisplay config={config} />

          <Separator className="my-8" />

          {/* Preset Selector */}
          <PresetSelector
            presets={Object.values(STRATEGY_PRESETS)}
            selectedPreset={selectedPreset}
            onSelect={handlePresetSelect}
          />

          {/* Recommended-specific options */}
          {selectedPresetHasAgenticStrategies && (
            <RecommendedOptions
              isMultiTurnEnabled={isMultiTurnEnabled}
              isStatefulValue={isStatefulValue}
              onMultiTurnChange={handleMultiTurnChange}
              onStatefulChange={handleStatefulChange}
            />
          )}

          {/* Recommended strategies */}
          {categorizedStrategies.recommended.length > 0 && (
            <StrategySection
              title="Recommended Strategies"
              description="Core strategies that provide comprehensive coverage for most use cases"
              strategies={categorizedStrategies.recommended}
              selectedIds={selectedStrategyIds}
              onToggle={handleStrategyToggle}
              onConfigClick={handleConfigClick}
              onSelectNone={handleSelectNoneInSection}
              isStrategyDisabled={isStrategyDisabled}
              isRemoteGenerationDisabled={isRemoteGenerationDisabled}
              isStrategyConfigured={isStrategyConfiguredById}
            />
          )}

          {/* Agentic strategies grouped */}
          {(categorizedStrategies.agenticSingleTurn.length > 0 ||
            categorizedStrategies.agenticMultiTurn.length > 0) && (
            <AgenticStrategiesGroup
              singleTurnStrategies={categorizedStrategies.agenticSingleTurn}
              multiTurnStrategies={categorizedStrategies.agenticMultiTurn}
              selectedIds={selectedStrategyIds}
              onToggle={handleStrategyToggle}
              onConfigClick={handleConfigClick}
              onSelectNone={handleSelectNoneInSection}
              isStrategyDisabled={isStrategyDisabled}
              isRemoteGenerationDisabled={isRemoteGenerationDisabled}
              isStrategyConfigured={isStrategyConfiguredById}
            />
          )}

          {/* Multi-modal strategies */}
          {categorizedStrategies.multiModal.length > 0 && (
            <StrategySection
              title="Multi-modal Strategies"
              description="Test handling of non-text content including audio, video, and images"
              strategies={categorizedStrategies.multiModal}
              selectedIds={selectedStrategyIds}
              onToggle={handleStrategyToggle}
              onConfigClick={handleConfigClick}
              onSelectNone={handleSelectNoneInSection}
              isStrategyDisabled={isStrategyDisabled}
              isRemoteGenerationDisabled={isRemoteGenerationDisabled}
              isStrategyConfigured={isStrategyConfiguredById}
            />
          )}

          {/* Other strategies */}
          {categorizedStrategies.other.length > 0 && (
            <StrategySection
              title="Other Strategies"
              description="Additional specialized strategies for specific attack vectors and edge cases"
              strategies={categorizedStrategies.other}
              selectedIds={selectedStrategyIds}
              onToggle={handleStrategyToggle}
              onConfigClick={handleConfigClick}
              onSelectNone={handleSelectNoneInSection}
              isStrategyDisabled={isStrategyDisabled}
              isRemoteGenerationDisabled={isRemoteGenerationDisabled}
              isStrategyConfigured={isStrategyConfiguredById}
            />
          )}

          {/* Additional system config section, if needed */}
          {showSystemConfig && !selectedPresetHasAgenticStrategies && (
            <SystemConfiguration
              isStatefulValue={isStatefulValue}
              onStatefulChange={handleStatefulChange}
            />
          )}

          {/* Config Dialog */}
          <StrategyConfigDialog
            open={configDialog.isOpen}
            strategy={configDialog.selectedStrategy}
            config={
              configDialog.selectedStrategy
                ? ((
                    config.strategies.find(
                      (s) => getStrategyId(s) === configDialog.selectedStrategy,
                    ) as RedteamStrategyObject
                  )?.config ?? {})
                : {}
            }
            onClose={() =>
              setConfigDialog({
                isOpen: false,
                selectedStrategy: null,
              })
            }
            onSave={updateStrategyConfig}
            strategyData={
              availableStrategies.find((s) => s.id === configDialog.selectedStrategy) ?? null
            }
            selectedPlugins={config.plugins?.map((p) => (typeof p === 'string' ? p : p.id)) ?? []}
            allStrategies={config.strategies}
          />
        </div>
      </TestCaseGenerationProvider>
    </PageWrapper>
  );
}
