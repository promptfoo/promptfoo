import React, { useState, useEffect } from 'react';
import { useTelemetry } from '@app/hooks/useTelemetry';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { Alert, Paper, Box, Typography, Chip } from '@mui/material';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import { useTheme } from '@mui/material/styles';
import { alpha } from '@mui/material/styles';
import {
  DEFAULT_STRATEGIES,
  ALL_STRATEGIES,
  AGENTIC_STRATEGIES,
  strategyDescriptions,
  strategyDisplayNames,
  MULTI_TURN_STRATEGIES,
} from '@promptfoo/redteam/constants';
import type { RedteamStrategy } from '@promptfoo/redteam/types';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';
import StrategyConfigDialog from './StrategyConfigDialog';

interface StrategiesProps {
  onNext: () => void;
  onBack: () => void;
}

const availableStrategies = ALL_STRATEGIES.filter((id) => id !== 'default').map((id) => ({
  id,
  name: strategyDisplayNames[id] || id,
  description: strategyDescriptions[id],
}));

const getStrategyId = (strategy: RedteamStrategy): string => {
  return typeof strategy === 'string' ? strategy : strategy.id;
};

// Add this constant at the top of the file to track which strategies have config options
const CONFIGURABLE_STRATEGIES = ['basic', 'jailbreak', 'multilingual'] as const;

// Split strategies into two groups
const singleTurnStrategies = availableStrategies
  .filter((strategy) => !MULTI_TURN_STRATEGIES.includes(strategy.id as any))
  .sort((a, b) => {
    const aIsRecommended = DEFAULT_STRATEGIES.includes(a.id as any);
    const bIsRecommended = DEFAULT_STRATEGIES.includes(b.id as any);
    if (aIsRecommended !== bIsRecommended) {
      return aIsRecommended ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
const multiTurnStrategies = availableStrategies.filter((strategy) =>
  MULTI_TURN_STRATEGIES.includes(strategy.id as any),
);

export default function Strategies({ onNext, onBack }: StrategiesProps) {
  const { config, updateConfig } = useRedTeamConfig();
  const { recordEvent } = useTelemetry();
  const theme = useTheme();

  const [selectedStrategies, setSelectedStrategies] = useState<RedteamStrategy[]>(
    () =>
      config.strategies.map((strategy) =>
        typeof strategy === 'string' ? { id: strategy } : strategy,
      ) as RedteamStrategy[],
  );

  const [isStatefulValue, setIsStatefulValue] = useState(config.target?.config?.stateful === true);

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedConfigStrategy, setSelectedConfigStrategy] = useState<string | null>(null);
  const [strategyConfig, setStrategyConfig] = useState<Record<string, any>>(() => {
    const initialConfig: Record<string, any> = {};
    config.strategies.forEach((strategy) => {
      if (typeof strategy === 'object' && strategy.config) {
        initialConfig[strategy.id] = strategy.config;
      }
    });
    return initialConfig;
  });

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_strategies' });
  }, []);

  useEffect(() => {
    updateConfig('strategies', selectedStrategies);
  }, [selectedStrategies, updateConfig]);

  useEffect(() => {
    const target = { ...config.target };
    target.config = { ...target.config, stateful: isStatefulValue };
    updateConfig('target', target);
  }, [isStatefulValue]);

  const handleStrategyToggle = (strategyId: string) => {
    if (!selectedStrategies.find((strategy) => getStrategyId(strategy) === strategyId)) {
      recordEvent('feature_used', {
        feature: 'redteam_config_strategy_deselected',
        strategy: strategyId,
      });
    }

    setSelectedStrategies((prev) => {
      if (prev.some((strategy) => getStrategyId(strategy) === strategyId)) {
        // Remove strategy
        return prev.filter((strategy) => getStrategyId(strategy) !== strategyId);
      } else {
        // Add strategy with any existing config
        const config = strategyConfig[strategyId];

        const newStrategy: RedteamStrategy = config
          ? { id: strategyId, config }
          : { id: strategyId };
        if (MULTI_TURN_STRATEGIES.includes(strategyId as any)) {
          const existingConfig = newStrategy.config ?? {};
          newStrategy.config = { ...existingConfig, stateful: isStatefulValue };
        }
        return [...prev, newStrategy];
      }
    });
  };

  const handleConfigClick = (strategyId: string) => {
    setSelectedConfigStrategy(strategyId);
    setConfigDialogOpen(true);
  };

  const updateStrategyConfig = (strategyId: string, newConfig: Record<string, any>) => {
    setStrategyConfig((prev) => ({
      ...prev,
      [strategyId]: newConfig,
    }));

    setSelectedStrategies((prev) =>
      prev.map((strategy) => {
        const id = getStrategyId(strategy);
        if (id === strategyId) {
          return {
            id: strategyId,
            config: { ...newConfig }, // spread the config to create a new object
          };
        }
        return strategy;
      }),
    );
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 3 }}>
        Strategy Configuration
      </Typography>

      <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          About Testing Strategies
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          LLM applications typically interact with users in one of two ways: single-turn (one-shot)
          or multi-turn (conversational) interactions. Your choice of testing strategy should match
          your application's interaction model.
        </Typography>
        <Box sx={{ ml: 2, mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            <strong>Single-turn strategies</strong> test individual prompts in isolation. These are
            ideal for:
          </Typography>
          <Box component="ul" sx={{ mt: 1, mb: 2, typography: 'body2', color: 'text.secondary' }}>
            <li>Systems where each prompt is independent</li>
            <li>API endpoints (e.g., text classification, content generation)</li>
            <li>Completion tasks (e.g., code generation, text summarization)</li>
          </Box>

          <Typography variant="body2" color="text.secondary">
            <strong>Multi-turn strategies</strong> simulate realistic back-and-forth conversations.
            These are ideal for:
          </Typography>
          <Box component="ul" sx={{ mt: 1, mb: 2, typography: 'body2', color: 'text.secondary' }}>
            <li>Chatbots and conversational agents</li>
            <li>Systems that maintain conversation history</li>
            <li>Applications where context builds over time</li>
          </Box>

          <Typography variant="body2" color="text.secondary">
            <strong>Agentic strategies</strong> have reasoning capabilities that are better at
            circumventing guardrails.
          </Typography>
        </Box>
      </Paper>

      <Typography variant="h6" gutterBottom sx={{ mt: 4, mb: 2 }}>
        Single-turn Strategies
      </Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {singleTurnStrategies.map((strategy) => (
          <Grid item xs={12} sm={6} md={4} key={strategy.id}>
            <Paper
              elevation={1}
              sx={{
                p: 2,
                height: '100%',
                borderRadius: 2,
                border: (theme) =>
                  selectedStrategies.some((s) => getStrategyId(s) === strategy.id)
                    ? `1px solid ${theme.palette.primary.main}`
                    : '1px solid transparent',
                backgroundColor: (theme) =>
                  selectedStrategies.some((s) => getStrategyId(s) === strategy.id)
                    ? alpha(theme.palette.primary.main, 0.04)
                    : 'background.paper',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  backgroundColor: (theme) =>
                    selectedStrategies.some((s) => getStrategyId(s) === strategy.id)
                      ? alpha(theme.palette.primary.main, 0.08)
                      : alpha(theme.palette.action.hover, 0.04),
                },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  width: '100%',
                }}
              >
                <FormControlLabel
                  sx={{ flex: 1 }}
                  control={
                    <Checkbox
                      checked={selectedStrategies.some((s) => getStrategyId(s) === strategy.id)}
                      onChange={() => handleStrategyToggle(strategy.id)}
                      color="primary"
                    />
                  }
                  label={
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle1">{strategy.name}</Typography>
                        {DEFAULT_STRATEGIES.includes(
                          strategy.id as (typeof DEFAULT_STRATEGIES)[number],
                        ) && <Chip label="Recommended" size="small" color="default" />}
                        {AGENTIC_STRATEGIES.includes(
                          strategy.id as (typeof AGENTIC_STRATEGIES)[number],
                        ) && (
                          <Chip
                            label="Agent"
                            size="small"
                            sx={{
                              backgroundColor: (theme) =>
                                theme.palette.mode === 'dark'
                                  ? alpha(theme.palette.warning.main, 0.1)
                                  : alpha(theme.palette.warning.main, 0.1),
                              color: 'warning.main',
                              borderColor: 'warning.main',
                              border: 1,
                            }}
                          />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {strategy.description}
                      </Typography>
                    </Box>
                  }
                />
                {selectedStrategies.some((s) => getStrategyId(s) === strategy.id) &&
                  CONFIGURABLE_STRATEGIES.includes(
                    strategy.id as (typeof CONFIGURABLE_STRATEGIES)[number],
                  ) && (
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConfigClick(strategy.id);
                      }}
                      sx={{
                        ml: 1,
                        opacity: 0.6,
                        '&:hover': {
                          opacity: 1,
                          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
                        },
                      }}
                    >
                      <SettingsOutlinedIcon fontSize="small" />
                    </IconButton>
                  )}
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
        Multi-turn Strategies
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {multiTurnStrategies.map((strategy) => (
          <Grid item xs={12} sm={6} md={4} key={strategy.id}>
            <Paper
              elevation={1}
              sx={{
                p: 2,
                height: '100%',
                borderRadius: 2,
                border: (theme) =>
                  selectedStrategies.some((s) => getStrategyId(s) === strategy.id)
                    ? `1px solid ${theme.palette.primary.main}`
                    : '1px solid transparent',
                backgroundColor: (theme) =>
                  selectedStrategies.some((s) => getStrategyId(s) === strategy.id)
                    ? alpha(theme.palette.primary.main, 0.04)
                    : 'background.paper',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  backgroundColor: (theme) =>
                    selectedStrategies.some((s) => getStrategyId(s) === strategy.id)
                      ? alpha(theme.palette.primary.main, 0.08)
                      : alpha(theme.palette.action.hover, 0.04),
                },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  width: '100%',
                }}
              >
                <FormControlLabel
                  sx={{ flex: 1 }}
                  control={
                    <Checkbox
                      checked={selectedStrategies.some((s) => getStrategyId(s) === strategy.id)}
                      onChange={() => handleStrategyToggle(strategy.id)}
                      color="primary"
                    />
                  }
                  label={
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle1">{strategy.name}</Typography>
                        {DEFAULT_STRATEGIES.includes(
                          strategy.id as (typeof DEFAULT_STRATEGIES)[number],
                        ) && <Chip label="Recommended" size="small" color="default" />}
                        {AGENTIC_STRATEGIES.includes(
                          strategy.id as (typeof AGENTIC_STRATEGIES)[number],
                        ) && (
                          <Chip
                            label="Agent"
                            size="small"
                            sx={{
                              backgroundColor: (theme) =>
                                theme.palette.mode === 'dark'
                                  ? alpha(theme.palette.warning.main, 0.1)
                                  : alpha(theme.palette.warning.main, 0.1),
                              color: 'warning.main',
                              borderColor: 'warning.main',
                              border: 1,
                            }}
                          />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {strategy.description}
                      </Typography>
                    </Box>
                  }
                />
                {selectedStrategies.some((s) => getStrategyId(s) === strategy.id) &&
                  CONFIGURABLE_STRATEGIES.includes(
                    strategy.id as (typeof CONFIGURABLE_STRATEGIES)[number],
                  ) && (
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConfigClick(strategy.id);
                      }}
                      sx={{
                        ml: 1,
                        opacity: 0.6,
                        '&:hover': {
                          opacity: 1,
                          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
                        },
                      }}
                    >
                      <SettingsOutlinedIcon fontSize="small" />
                    </IconButton>
                  )}
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {selectedStrategies.some((s) => ['goat', 'crescendo'].includes(getStrategyId(s))) && (
        <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            System Configuration
          </Typography>
          <FormControl component="fieldset">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Is the target system Stateful? (Does it maintain conversation history?)
            </Typography>
            <RadioGroup
              value={isStatefulValue}
              onChange={(e) => {
                const isStateful = e.target.value === 'true';
                const updatedStrategies = config.strategies.map((strategy) => {
                  if (typeof strategy === 'string') {
                    return strategy;
                  }

                  if (MULTI_TURN_STRATEGIES.includes(strategy.id as any)) {
                    strategy.config = strategy.config || {};
                    strategy.config.stateful = isStateful;
                  }
                  return strategy;
                });
                updateConfig('strategies', updatedStrategies);
                setIsStatefulValue(isStateful);
              }}
            >
              <FormControlLabel
                value="true"
                control={<Radio />}
                label="Yes - System is stateful, system maintains conversation history."
              />
              <FormControlLabel
                value="false"
                control={<Radio />}
                label="No - System does not maintains conversation history"
              />
            </RadioGroup>

            {!config.target.config.sessionParser && config.target.config.stateful && (
              <Alert severity="warning">
                Your system is stateful but you don't have session handling setup. Please return to
                your Target setup to configure it.
              </Alert>
            )}
          </FormControl>
        </Paper>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
        <Button
          variant="outlined"
          onClick={onBack}
          startIcon={<KeyboardArrowLeftIcon />}
          sx={{
            px: 4,
            py: 1,
          }}
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

      <StrategyConfigDialog
        open={configDialogOpen}
        strategy={selectedConfigStrategy}
        config={selectedConfigStrategy ? strategyConfig[selectedConfigStrategy] || {} : {}}
        onClose={() => {
          setConfigDialogOpen(false);
          setSelectedConfigStrategy(null);
        }}
        onSave={(strategy: string, newConfig: Record<string, any>) => {
          updateStrategyConfig(strategy, newConfig);
        }}
      />
    </Box>
  );
}
