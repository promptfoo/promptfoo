import React, { useState, useEffect } from 'react';
import { useTelemetry } from '@app/hooks/useTelemetry';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { Alert, Paper, Box, Typography, Chip } from '@mui/material';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import { useTheme } from '@mui/material/styles';
import { alpha } from '@mui/material/styles';
import {
  DEFAULT_STRATEGIES,
  ALL_STRATEGIES,
  strategyDescriptions,
  strategyDisplayNames,
  MULTI_TURN_STRATEGIES,
} from '@promptfoo/redteam/constants';
import type { RedteamStrategy } from '@promptfoo/redteam/types';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

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
  const [isStateless, setIsStateless] = useState<boolean>(true);

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_strategies' });
  }, []);

  useEffect(() => {
    updateConfig('strategies', selectedStrategies);
  }, [selectedStrategies, updateConfig]);

  useEffect(() => {
    setSelectedStrategies((prev) =>
      prev.map((strategy) => {
        const strategyId = getStrategyId(strategy);
        if (strategyId === 'goat' || strategyId === 'crescendo') {
          return {
            id: strategyId,
            config: { stateless: isStateless },
          };
        }
        return strategy;
      }),
    );
  }, [isStateless]);

  const handleStrategyToggle = (strategyId: string) => {
    if (!selectedStrategies.find((strategy) => getStrategyId(strategy) === strategyId)) {
      recordEvent('feature_used', {
        feature: 'redteam_config_strategy_deselected',
        strategy: strategyId,
      });
    }

    setSelectedStrategies((prev) =>
      prev.some((strategy) => getStrategyId(strategy) === strategyId)
        ? prev.filter((strategy) => getStrategyId(strategy) !== strategyId)
        : [...prev, { id: strategyId }],
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
          <Typography variant="body2" color="text.secondary" paragraph>
            • <strong>Single-turn strategies</strong> test individual prompts in isolation. These
            are ideal for:
            <Box component="ul" sx={{ mt: 1, mb: 2 }}>
              <li>Systems where each prompt is independent</li>
              <li>API endpoints (e.g., text classification, content generation)</li>
              <li>Completion tasks (e.g., code generation, text summarization)</li>
            </Box>
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            • <strong>Multi-turn strategies</strong> simulate realistic conversations through
            multiple exchanges. These are ideal for:
            <Box component="ul" sx={{ mt: 1, mb: 2 }}>
              <li>Chatbots and conversational agents</li>
              <li>Systems that maintain conversation history</li>
              <li>Applications where context builds over time</li>
            </Box>
          </Typography>
        </Box>
      </Paper>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {availableStrategies.map((strategy) => (
          <Grid item xs={12} sm={6} md={4} key={strategy.id}>
            <Paper elevation={1} sx={{ p: 2, height: '100%' }}>
              <FormControlLabel
                sx={{ width: '100%' }}
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
                      {MULTI_TURN_STRATEGIES.includes(
                        strategy.id as (typeof MULTI_TURN_STRATEGIES)[number],
                      ) && (
                        <Chip
                          label="Multi-turn"
                          size="small"
                          color="secondary"
                          sx={{
                            backgroundColor: (theme) =>
                              theme.palette.mode === 'dark'
                                ? alpha(theme.palette.secondary.main, 0.1)
                                : alpha(theme.palette.secondary.main, 0.1),
                            color: 'secondary.main',
                            borderColor: 'secondary.main',
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
              Is the target system stateless? (Does it maintain conversation history?)
            </Typography>
            <RadioGroup
              value={isStateless}
              onChange={(e) => setIsStateless(e.target.value === 'true')}
            >
              <FormControlLabel
                value={true}
                control={<Radio />}
                label="Yes - System is stateless (no conversation history)"
              />
              <FormControlLabel
                value={false}
                control={<Radio />}
                label="No - System maintains conversation history"
              />
            </RadioGroup>

            {!config.target.config.sessionParser && (
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
    </Box>
  );
}
