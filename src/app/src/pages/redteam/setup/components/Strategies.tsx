import React, { useState, useEffect } from 'react';
import { useTelemetry } from '@app/hooks/useTelemetry';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { Alert } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { RedteamStrategy } from '@promptfoo/redteam/types';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

interface StrategiesProps {
  onNext: () => void;
  onBack: () => void;
}

interface Strategy {
  id: string;
  name: string;
  description: string;
}

const availableStrategies: Strategy[] = [
  {
    id: 'base64',
    name: 'Base64 Encoding',
    description:
      "Tests AI's ability to handle encoded inputs, potentially bypassing content filters.",
  },
  {
    id: 'jailbreak',
    name: 'Iterative Jailbreaks',
    description: 'Systematically probes and refines prompts to bypass AI constraints.',
  },
  {
    id: 'leetspeak',
    name: 'Leetspeak',
    description:
      'Replaces letters with numbers or special characters to test obfuscation handling.',
  },
  {
    id: 'crescendo',
    name: 'Multi-turn Jailbreaks (Crescendo)',
    description:
      "Microsoft Research's technique for gradually escalates prompt harm to exploit fuzzy ethical boundaries.",
  },
  {
    id: 'multilingual',
    name: 'Multilingual',
    description: "Tests AI's consistency and safety across multiple languages.",
  },
  {
    id: 'prompt-injection',
    name: 'Prompt Injection',
    description: 'Tests common direct prompt injection vulnerabilities.',
  },
  {
    id: 'rot13',
    name: 'ROT13 Encoding',
    description: 'Simple letter substitution to test handling of obfuscated text.',
  },
  {
    id: 'jailbreak:tree',
    name: 'Tree-based Jailbreaks',
    description:
      'Creates a branching structure of prompts to explore AI constraints systematically.',
  },
  {
    id: 'goat',
    name: 'Generative Offensive Agent Tester',
    description: "Meta AI's technique for multi-step conversational testing.",
  },
];

const DEFAULT_STRATEGIES = ['jailbreak', 'prompt-injection'];

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
                      {DEFAULT_STRATEGIES.includes(strategy.id) && (
                        <Chip label="Recommended" size="small" color="default" />
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
