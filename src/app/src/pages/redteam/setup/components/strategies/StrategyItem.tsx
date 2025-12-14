import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import { alpha } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  AGENTIC_STRATEGIES,
  CONFIGURABLE_STRATEGIES,
  DEFAULT_STRATEGIES,
  MULTI_MODAL_STRATEGIES,
  type Plugin,
} from '@promptfoo/redteam/constants';
import { TestCaseGenerateButton } from './../TestCaseDialog';
import { useTestCaseGeneration } from './../TestCaseGenerationProvider';
import type { StrategyCardData } from './types';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { useCallback, useMemo } from 'react';
import { type StrategyConfig, type RedteamStrategyObject } from '@promptfoo/redteam/types';

const DEFAULT_TEST_GENERATION_PLUGIN = 'harmful:hate';

// Strategies that do not support test case generation
// These strategies will have the test case generation button disabled in the UI
const STRATEGIES_WITHOUT_TEST_CASE_GENERATION = ['retry', 'other-encodings'] as const;

interface StrategyItemProps {
  strategy: StrategyCardData;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onConfigClick: (id: string) => void;
  isDisabled: boolean;
  isRemoteGenerationDisabled: boolean;
  isConfigured?: boolean;
}

export function StrategyItem({
  strategy,
  isSelected,
  onToggle,
  onConfigClick,
  isDisabled,
  isRemoteGenerationDisabled,
  isConfigured = true,
}: StrategyItemProps) {
  const { config } = useRedTeamConfig();

  const {
    generateTestCase,
    isGenerating: generatingTestCase,
    strategy: currentStrategy,
  } = useTestCaseGeneration();

  const strategyConfig = useMemo(() => {
    return (
      (
        config.strategies.find(
          (s) => typeof s === 'object' && 'id' in s && s!.id === strategy.id,
        ) as RedteamStrategyObject
      )?.config ?? {}
    );
  }, [config, strategy.id]) as StrategyConfig;

  // Select a random plugin from the user's configured plugins, or fall back to default
  const testGenerationPlugin = useMemo(() => {
    const plugins =
      config.plugins?.map((p) => (typeof p === 'string' ? p : p.id)).filter(Boolean) ?? [];
    if (plugins.length === 0) {
      return DEFAULT_TEST_GENERATION_PLUGIN;
    }
    const randomIndex = Math.floor(Math.random() * plugins.length);
    return plugins[randomIndex] as Plugin;
  }, [config.plugins]);

  const requiresConfig = isSelected && !isConfigured;

  const hasSettingsButton =
    requiresConfig || (isSelected && CONFIGURABLE_STRATEGIES.includes(strategy.id as any));

  const isTestCaseGenerationDisabled = STRATEGIES_WITHOUT_TEST_CASE_GENERATION.includes(
    strategy.id as any,
  );

  const { tooltipTitle, settingsTooltipTitle } = useMemo(() => {
    if (requiresConfig) {
      const reason =
        strategy.id === 'custom'
          ? 'Strategy text is required'
          : strategy.id === 'simba'
            ? 'At least one goal is required'
            : 'Configuration is required';
      const configRequiredTooltip = `Configuration required: ${reason}. Click the settings icon to configure.`;

      return {
        tooltipTitle: configRequiredTooltip,
        settingsTooltipTitle: configRequiredTooltip,
      };
    }

    if (isTestCaseGenerationDisabled) {
      return {
        tooltipTitle: `Test case generation is not available for ${strategy.name} strategy.`,
        settingsTooltipTitle: 'Configure strategy settings',
      };
    }

    return {
      tooltipTitle: `Generate an example test case using the ${strategy.name} Strategy.`,
      settingsTooltipTitle: 'Configure strategy settings',
    };
  }, [requiresConfig, strategy.id, strategy.name, isTestCaseGenerationDisabled]);

  const handleTestCaseGeneration = useCallback(async () => {
    await generateTestCase(
      { id: testGenerationPlugin, config: {}, isStatic: true },
      { id: strategy.id, config: strategyConfig, isStatic: false },
    );
  }, [strategyConfig, generateTestCase, strategy.id, testGenerationPlugin]);

  const handleToggle = useCallback(() => {
    // If selecting simba for the first time, auto-open config dialog
    if (strategy.id === 'simba' && !isSelected && !isDisabled) {
      onToggle(strategy.id);
      // Use setTimeout to ensure the toggle completes before opening config
      setTimeout(() => onConfigClick(strategy.id), 0);
    } else {
      onToggle(strategy.id);
    }
  }, [strategy.id, isSelected, isDisabled, onToggle, onConfigClick]);

  return (
    <Paper
      elevation={2}
      onClick={handleToggle}
      sx={(theme) => ({
        height: '100%',
        display: 'flex',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        opacity: isDisabled ? 0.5 : 1,
        border: isSelected
          ? `1px solid ${requiresConfig ? theme.palette.error.main : theme.palette.primary.main}`
          : undefined,
        backgroundColor: isDisabled
          ? theme.palette.action.disabledBackground
          : isSelected
            ? alpha(requiresConfig ? theme.palette.error.main : theme.palette.primary.main, 0.04)
            : theme.palette.background.paper,
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          backgroundColor: isDisabled
            ? theme.palette.action.disabledBackground
            : isSelected
              ? alpha(requiresConfig ? theme.palette.error.main : theme.palette.primary.main, 0.08)
              : alpha(theme.palette.action.hover, 0.04),
        },
        p: 1,
        gap: 2,
      })}
    >
      {/* Checkbox container */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Checkbox
          checked={isSelected}
          disabled={isDisabled}
          onChange={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
          onClick={(e) => e.stopPropagation()}
          color="primary"
        />
      </Box>

      {/* Content container */}
      <Box sx={{ flex: 1, py: 2, minWidth: 0, position: 'relative' }}>
        {/* Title and badges section - add right padding when settings button is present */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
            mb: 1,
            pr: hasSettingsButton ? 5 : 0, // Add padding-right to avoid overlap with settings button
          }}
        >
          <Typography variant="subtitle1" component="div">
            {strategy.name}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {DEFAULT_STRATEGIES.includes(strategy.id as any) && (
              <Chip label="Recommended" size="small" color="default" />
            )}
            {AGENTIC_STRATEGIES.includes(strategy.id as any) && (
              <Chip
                label="Agent"
                size="small"
                sx={{
                  backgroundColor: (theme) => alpha(theme.palette.warning.main, 0.1),
                  color: 'warning.main',
                  borderColor: 'warning.main',
                  border: 1,
                }}
              />
            )}
            {MULTI_MODAL_STRATEGIES.includes(strategy.id as any) && (
              <Chip
                label="Multi-modal"
                size="small"
                sx={{
                  backgroundColor: (theme) => alpha(theme.palette.info.main, 0.1),
                  color: 'info.main',
                  borderColor: 'info.main',
                  border: 1,
                }}
              />
            )}
            {isDisabled && isRemoteGenerationDisabled && (
              <Tooltip title="This strategy requires remote generation. Unset PROMPTFOO_DISABLE_REMOTE_GENERATION or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION to enable.">
                <Typography
                  variant="caption"
                  sx={(theme) => ({
                    fontSize: '0.7rem',
                    color: 'error.main',
                    fontWeight: 500,
                    backgroundColor: alpha(theme.palette.error.main, 0.08),
                    px: 0.5,
                    py: 0.25,
                    borderRadius: 0.5,
                    border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`,
                  })}
                >
                  Remote generation required
                </Typography>
              </Tooltip>
            )}
          </Box>
        </Box>

        {/* Description section */}
        <Typography variant="body2" color="text.secondary">
          {strategy.description}
        </Typography>
      </Box>

      {/* Secondary Actions Container */}
      <Box>
        <TestCaseGenerateButton
          onClick={handleTestCaseGeneration}
          disabled={
            isDisabled || generatingTestCase || requiresConfig || isTestCaseGenerationDisabled
          }
          isGenerating={generatingTestCase && currentStrategy === strategy.id}
          size="small"
          tooltipTitle={tooltipTitle}
        />

        {/* Settings button - positioned absolutely in the top-right corner */}
        {hasSettingsButton && (
          <Tooltip title={settingsTooltipTitle}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onConfigClick(strategy.id);
              }}
              sx={(theme) => {
                const needsConfig = isSelected && requiresConfig;
                return {
                  opacity: requiresConfig ? 1 : 0.6,
                  color: needsConfig ? theme.palette.error.main : 'inherit',
                  '&:hover': {
                    opacity: 1,
                    backgroundColor: needsConfig
                      ? alpha(theme.palette.error.main, 0.1)
                      : alpha(theme.palette.primary.main, 0.08),
                  },
                };
              }}
            >
              <SettingsOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Paper>
  );
}
