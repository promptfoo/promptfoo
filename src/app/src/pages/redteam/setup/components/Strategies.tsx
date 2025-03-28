import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTelemetry } from '@app/hooks/useTelemetry';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { Box, Typography, Button, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  ALL_STRATEGIES,
  MULTI_TURN_STRATEGIES,
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

const availableStrategies: StrategyCardData[] = ALL_STRATEGIES.filter((id) => id !== 'default').map(
  (id) => ({
    id,
    name: strategyDisplayNames[id] || id,
    description: strategyDescriptions[id],
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

  // Separate single vs. multi-turn
  const { singleTurnStrategies, multiTurnStrategies } = useMemo(() => {
    return {
      singleTurnStrategies: availableStrategies.filter(
        (s) => !MULTI_TURN_STRATEGIES.includes(s.id as any),
      ),
      multiTurnStrategies: availableStrategies.filter((s) =>
        MULTI_TURN_STRATEGIES.includes(s.id as any),
      ),
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

  const handleMultiTurnChange = useCallback(
    (checked: boolean) => {
      setIsMultiTurnEnabled(checked);

      const preset = STRATEGY_PRESETS[selectedPreset as PresetId];

      const multiTurnStrategies = preset.options?.multiTurn?.strategies;
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
    [config.strategies, updateConfig, isStatefulValue],
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
    config.target.config.sessionParser || config.target.config.sessionSource === 'client',
  );

  // ----------------------------------------------
  // Render
  // ----------------------------------------------

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 3 }}>
        Strategy Configuration
      </Typography>

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
          {getEstimatedProbes(config)}
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

      {/* Single-turn strategies */}
      <StrategySection
        title="Single-turn Strategies"
        strategies={singleTurnStrategies}
        selectedIds={selectedStrategyIds}
        onToggle={handleStrategyToggle}
        onConfigClick={handleConfigClick}
      />

      {/* Multi-turn strategies */}
      <StrategySection
        title="Multi-turn Strategies"
        strategies={multiTurnStrategies}
        selectedIds={selectedStrategyIds}
        onToggle={handleStrategyToggle}
        onConfigClick={handleConfigClick}
      />

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
          sx={{
            backgroundColor: theme.palette.primary.main,
            '&:hover': { backgroundColor: theme.palette.primary.dark },
            px: 4,
            py: 1,
          }}
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
