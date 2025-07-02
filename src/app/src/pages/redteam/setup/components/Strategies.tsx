import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTelemetry } from '@app/hooks/useTelemetry';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { Box, Typography, Button, Tooltip, Link } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  ALL_STRATEGIES,
  MULTI_TURN_STRATEGIES,
  AGENTIC_STRATEGIES,
  DEFAULT_STRATEGIES,
  strategyDescriptions,
  strategyDisplayNames,
} from '@promptfoo/redteam/constants';
import type { RedteamStrategyObject } from '@promptfoo/redteam/types';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import StrategyConfigDialog from './StrategyConfigDialog';
import { PresetSelector } from './strategies/PresetSelector';
import { RecommendedOptions } from './strategies/RecommendedOptions';
import { StrategySection } from './strategies/StrategySection';
import { SystemConfiguration } from './strategies/SystemConfiguration';
import { MULTI_MODAL_STRATEGIES } from './strategies/constants';
import {
  STRATEGY_PRESETS,
  PRESET_IDS,
  type PresetId,
  type StrategyPreset,
} from './strategies/types';
import type { ConfigDialogState, StrategyCardData } from './strategies/types';
import { getEstimatedProbes, getStrategyId } from './strategies/utils';

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

// Define recommended strategies based on DEFAULT_STRATEGIES for consistency
const RECOMMENDED_STRATEGIES = DEFAULT_STRATEGIES;

// UI-friendly description overrides
const UI_STRATEGY_DESCRIPTIONS: Record<string, string> = {
  basic:
    'Standard testing without additional attack strategies. Tests prompts as-is to establish baseline behavior.',
};

const availableStrategies: StrategyCardData[] = ALL_STRATEGIES.filter((id) => id !== 'default').map(
  (id) => ({
    id,
    name: strategyDisplayNames[id] || id,
    description: UI_STRATEGY_DESCRIPTIONS[id] || strategyDescriptions[id],
  }),
);

export default function Strategies({ onNext, onBack }: StrategiesProps) {
  const { config, updateConfig } = useRedTeamConfig();
  const { recordEvent } = useTelemetry();
  const theme = useTheme();

  const [isStatefulValue, setIsStatefulValue] = useState(config.target?.config?.stateful === true);
  const [isMultiTurnEnabled, setIsMultiTurnEnabled] = useState(false);

  const [configDialog, setConfigDialog] = useState<ConfigDialogState>({
    isOpen: false,
    selectedStrategy: null,
  });

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_strategies' });
  }, [recordEvent]);

  // Categorize strategies by type
  const categorizedStrategies = useMemo(() => {
    const recommended = availableStrategies.filter((s) =>
      RECOMMENDED_STRATEGIES.includes(s.id as any),
    );

    const allAgentic = availableStrategies.filter((s) => AGENTIC_STRATEGIES.includes(s.id as any));

    // Split agentic into single-turn and multi-turn
    const agenticSingleTurn = allAgentic.filter(
      (s) => !MULTI_TURN_STRATEGIES.includes(s.id as any),
    );

    const agenticMultiTurn = allAgentic.filter((s) => MULTI_TURN_STRATEGIES.includes(s.id as any));

    const multiModal = availableStrategies.filter((s) =>
      MULTI_MODAL_STRATEGIES.includes(s.id as any),
    );

    // Get other strategies that aren't in the above categories
    const other = availableStrategies.filter(
      (s) =>
        !RECOMMENDED_STRATEGIES.includes(s.id as any) &&
        !AGENTIC_STRATEGIES.includes(s.id as any) &&
        !MULTI_MODAL_STRATEGIES.includes(s.id as any),
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
      (s) => s && MULTI_TURN_STRATEGIES.includes(getStrategyId(s) as any),
    );

    if (hasMultiTurn) {
      setIsMultiTurnEnabled(true);
    }

    const matchedPresetId = Object.entries(STRATEGY_PRESETS).find(([presetId, preset]) => {
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
      if (strategyPreset.options?.multiTurn && isMultiTurnEnabled) {
        const nextStrats = [
          ...strategyPreset.strategies,
          ...strategyPreset.options.multiTurn.strategies,
        ].map((id: string) => ({ id }));
        updateConfig('strategies', nextStrats);
      } else {
        updateConfig(
          'strategies',
          strategyPreset.strategies.map((id: string) => ({ id })),
        );
      }
    },
    [recordEvent, isMultiTurnEnabled, updateConfig],
  );

  const handleStrategyToggle = useCallback(
    (strategyId: string) => {
      const isSelected = config.strategies.some((s) => getStrategyId(s) === strategyId);

      if (!isSelected) {
        recordEvent('feature_used', {
          feature: 'redteam_config_strategy_selected',
          strategy: strategyId,
        });
      }

      // Once user toggles, it's definitely "Custom" preset
      setSelectedPreset('Custom');

      if (isSelected) {
        // Remove strategy
        updateConfig(
          'strategies',
          config.strategies.filter((s) => getStrategyId(s) !== strategyId),
        );
      } else {
        // Add strategy with stateful config if it's multi-turn
        const newStrategy: RedteamStrategyObject = {
          id: strategyId,
          config: {},
        };

        if (MULTI_TURN_STRATEGIES.includes(strategyId as any)) {
          newStrategy.config = { ...newStrategy.config, stateful: isStatefulValue };
        }

        updateConfig('strategies', [...config.strategies, newStrategy]);
      }
    },
    [config.strategies, recordEvent, updateConfig, isStatefulValue],
  );

  const handleSelectNoneInSection = useCallback(
    (strategyIds: string[]) => {
      // Once user deselects all, it's definitely "Custom" preset
      setSelectedPreset('Custom');

      // Remove all strategies in the given section
      updateConfig(
        'strategies',
        config.strategies.filter((s) => !strategyIds.includes(getStrategyId(s))),
      );
    },
    [config.strategies, updateConfig],
  );

  const handleMultiTurnChange = useCallback(
    (checked: boolean) => {
      setIsMultiTurnEnabled(checked);

      const preset = STRATEGY_PRESETS[selectedPreset as PresetId];

      const multiTurnStrategies = preset?.options?.multiTurn?.strategies;
      if (!multiTurnStrategies) {
        return;
      }

      const multiTurnStrats = multiTurnStrategies.map((id: string) => ({
        id,
        config: { stateful: isStatefulValue },
      }));

      if (checked) {
        // Add multi-turn strategies
        const newStrats = [
          ...config.strategies,
          ...multiTurnStrats.filter(
            (mts) => !config.strategies.some((existing) => getStrategyId(existing) === mts.id),
          ),
        ];
        updateConfig('strategies', newStrats);
      } else {
        // Remove multi-turn strategies
        const filtered = config.strategies.filter(
          (s) => !multiTurnStrategies.includes(getStrategyId(s) as string),
        );
        updateConfig('strategies', filtered);
      }
    },
    [config.strategies, updateConfig, isStatefulValue, selectedPreset],
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
        if (MULTI_TURN_STRATEGIES.includes(id as any)) {
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
    (strategyId: string, newConfig: Record<string, any>) => {
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

  // ----------------------------------------------
  // Derived states
  // ----------------------------------------------

  const selectedStrategyIds = useMemo(
    () => config.strategies.map((s) => getStrategyId(s)),
    [config.strategies],
  );

  const showSystemConfig = config.strategies.some((s) =>
    ['goat', 'crescendo'].includes(getStrategyId(s)),
  );

  const hasSessionParser = Boolean(
    config.target.config?.sessionParser || config.target.config?.sessionSource === 'client',
  );

  // ----------------------------------------------
  // Render
  // ----------------------------------------------

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
          Strategy Configuration
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HelpOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
          <Typography variant="body2" color="text.secondary">
            Strategies modify how prompts are delivered to test different attack vectors.{' '}
            <Link
              href="https://www.promptfoo.dev/docs/red-team/strategies/"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: 'primary.main' }}
            >
              Learn more about strategies
            </Link>
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 3,
          p: 2,
          borderRadius: 1,
          backgroundColor: theme.palette.background.paper,
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="body1" color="text.secondary">
            Estimated Probes:
          </Typography>
        </Box>
        <Typography variant="body1" fontWeight="bold" color="primary.main">
          {getEstimatedProbes(config).toLocaleString()}
        </Typography>
        <Tooltip title="Probes are the number of requests to target application">
          <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
        </Tooltip>
      </Box>

      {/* Preset Selector */}
      <PresetSelector
        presets={Object.values(STRATEGY_PRESETS)}
        selectedPreset={selectedPreset}
        onSelect={handlePresetSelect}
      />

      {/* Recommended-specific options */}
      {(selectedPreset === PRESET_IDS.MEDIUM || selectedPreset === PRESET_IDS.LARGE) && (
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
        />
      )}

      {/* Agentic strategies */}
      {categorizedStrategies.agenticSingleTurn.length > 0 && (
        <StrategySection
          title="Agentic Strategies (Single-turn)"
          description="Advanced AI-powered strategies that dynamically adapt their attack patterns"
          strategies={categorizedStrategies.agenticSingleTurn}
          selectedIds={selectedStrategyIds}
          onToggle={handleStrategyToggle}
          onConfigClick={handleConfigClick}
          onSelectNone={handleSelectNoneInSection}
        />
      )}

      {/* Multi-turn agentic strategies */}
      {categorizedStrategies.agenticMultiTurn.length > 0 && (
        <StrategySection
          title="Agentic Strategies (Multi-turn)"
          description="AI-powered strategies that evolve across multiple conversation turns"
          strategies={categorizedStrategies.agenticMultiTurn}
          selectedIds={selectedStrategyIds}
          onToggle={handleStrategyToggle}
          onConfigClick={handleConfigClick}
          onSelectNone={handleSelectNoneInSection}
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
        />
      )}

      {/* Additional system config section, if needed */}
      {showSystemConfig && (
        <SystemConfiguration
          isStatefulValue={isStatefulValue}
          onStatefulChange={handleStatefulChange}
          hasSessionParser={hasSessionParser}
        />
      )}

      {/* Footer Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
        <Button
          variant="outlined"
          onClick={onBack}
          startIcon={<KeyboardArrowLeftIcon />}
          sx={{ px: 4, py: 1 }}
        >
          Back
        </Button>
        <Button
          variant="contained"
          onClick={onNext}
          endIcon={<KeyboardArrowRightIcon />}
          sx={{ px: 4, py: 1 }}
        >
          Next
        </Button>
      </Box>

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
      />
    </Box>
  );
}
