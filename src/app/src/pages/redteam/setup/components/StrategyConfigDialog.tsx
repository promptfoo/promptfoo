import React from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  MULTI_TURN_STRATEGIES,
  type MultiTurnStrategy,
} from '@promptfoo/redteam/constants/strategies';

import type { StrategyCardData } from './strategies/types';

const DEFAULT_LANGUAGES: Record<string, string> = {
  bn: 'Bengali',
  sw: 'Swahili',
  jv: 'Javanese',
};

interface StrategyConfigDialogProps {
  open: boolean;
  strategy: string | null;
  config: Record<string, any>;
  onClose: () => void;
  onSave: (strategy: string, config: Record<string, any>) => void;
  strategyData: StrategyCardData | null;
}

export default function StrategyConfigDialog({
  open,
  strategy,
  config,
  onClose,
  onSave,
  strategyData,
}: StrategyConfigDialogProps) {
  const [localConfig, setLocalConfig] = React.useState<Record<string, any>>(config || {});
  const [languages, setLanguages] = React.useState<string[]>(
    config.languages || Object.keys(DEFAULT_LANGUAGES),
  );
  const [enabled, setEnabled] = React.useState<boolean>(
    config.enabled === undefined ? true : config.enabled,
  );
  const [numTests, setNumTests] = React.useState<string>(config.numTests?.toString() || '10');
  const [newLanguage, setNewLanguage] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');

  const handleAddLanguage = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newLanguage.trim()) {
      setLanguages([...languages, newLanguage.trim().toLowerCase()]);
      setNewLanguage('');
    }
  };

  const handleRemoveLanguage = (lang: string) => {
    setLanguages(languages.filter((l) => l !== lang));
  };

  const handleNumTestsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const num = Number.parseInt(value, 10);

    if (num < 1) {
      setError('Must be at least 1');
    } else {
      setError('');
    }

    setNumTests(value);
  };

  const isCustomStrategyValid = () => {
    if (strategy === 'custom') {
      return localConfig.strategyText && localConfig.strategyText.trim().length > 0;
    }
    return true;
  };

  const handleSave = () => {
    if (!strategy) {
      return;
    }

    if (strategy === 'basic') {
      onSave(strategy, {
        ...config,
        enabled,
      });
    } else if (
      strategy === 'jailbreak' ||
      strategy === 'jailbreak:tree' ||
      strategy === 'best-of-n' ||
      strategy === 'goat' ||
      strategy === 'crescendo' ||
      strategy === 'custom' ||
      strategy === 'pandamonium' ||
      strategy === 'gcg' ||
      strategy === 'citation' ||
      strategy === 'mischievous-user'
    ) {
      if (!isCustomStrategyValid()) {
        return;
      }
      onSave(strategy, localConfig);
    } else if (strategy === 'multilingual') {
      onSave(strategy, {
        ...config,
        languages,
      });
    } else if (strategy === 'retry') {
      const num = Number.parseInt(numTests, 10);
      if (num >= 1) {
        onSave(strategy, {
          ...config,
          numTests: num,
        });
      }
    }

    onClose();
  };

  const renderStrategyConfig = () => {
    if (strategy === 'basic') {
      return (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            The basic strategy determines whether to include the original plugin-generated test
            cases in your evaluation. These are the default test cases created by each plugin before
            any strategies are applied.
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Box>
                <Typography variant="body1">Include plugin-generated test cases</Typography>
                <Typography variant="body2" color="text.secondary">
                  Turn off to run only strategy-modified tests
                </Typography>
              </Box>
            }
          />
        </>
      );
    } else if (strategy === 'jailbreak') {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Configure the Iterative Jailbreak strategy parameters.
          </Typography>

          <TextField
            fullWidth
            label="Number of Iterations"
            type="number"
            value={localConfig.numIterations || 10}
            onChange={(e) => {
              const value = e.target.value ? Number.parseInt(e.target.value, 10) : 10;
              setLocalConfig({ ...localConfig, numIterations: value });
            }}
            placeholder="Number of iterations (default: 10)"
            InputProps={{ inputProps: { min: 3, max: 50 } }}
            helperText="Number of iterations to try (more iterations increase chance of success)"
          />
        </Box>
      );
    } else if (strategy === 'multilingual') {
      return (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Configure languages for testing. By default, we test with low-resource languages that
            are more likely to bypass safety mechanisms. This will generate a duplicate set of tests
            for each language.
          </Typography>
          <Box sx={{ mb: 2, pl: 2 }}>
            <Typography variant="body2" component="ul">
              <li>Bengali (bn)</li>
              <li>Swahili (sw)</li>
              <li>Javanese (jv)</li>
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            You can add additional languages or leave blank to use defaults. We support standard
            languages (French, German, Chinese) as well as cyphers (pig-latin), creoles (pirate),
            and derived languages (klingon).
          </Typography>
          <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {languages.map((lang) => (
              <Chip
                key={lang}
                label={`${DEFAULT_LANGUAGES[lang] || lang}`}
                onDelete={() => handleRemoveLanguage(lang)}
                color="primary"
                variant="outlined"
              />
            ))}
          </Box>
          <TextField
            fullWidth
            label="Add Language (press Enter)"
            value={newLanguage}
            onChange={(e) => setNewLanguage(e.target.value)}
            onKeyPress={handleAddLanguage}
            helperText="Leave blank to use defaults"
            sx={{ mt: 1 }}
          />
        </>
      );
    } else if (strategy === 'retry') {
      return (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Automatically reuse previously failed test cases to identify additional vulnerabilities
            and identify regressions.
          </Typography>
          <TextField
            fullWidth
            label="Maximum Tests Per Plugin"
            type="number"
            value={numTests}
            onChange={handleNumTestsChange}
            error={!!error}
            helperText={error || 'Default: 10'}
            inputProps={{
              min: 1,
              max: 100,
              step: 1,
            }}
            sx={{ mt: 1 }}
          />
        </>
      );
    } else if (strategy === 'best-of-n') {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Configure the Best-of-N strategy parameters. This strategy tries multiple variations of
            the input prompt.
          </Typography>

          <TextField
            fullWidth
            label="Max Concurrency"
            type="number"
            value={localConfig.maxConcurrency || 3}
            onChange={(e) =>
              setLocalConfig({
                ...localConfig,
                maxConcurrency: Number.parseInt(e.target.value, 10),
              })
            }
            placeholder="Maximum number of concurrent requests (default: 3)"
            InputProps={{ inputProps: { min: 1 } }}
            helperText="Maximum number of concurrent prompt variations to try"
          />

          <TextField
            fullWidth
            label="Number of Steps"
            type="number"
            value={localConfig.nSteps || ''}
            onChange={(e) => {
              const value = e.target.value ? Number.parseInt(e.target.value, 10) : undefined;
              setLocalConfig({ ...localConfig, nSteps: value });
            }}
            placeholder="Number of steps (optional)"
            InputProps={{ inputProps: { min: 1 } }}
            helperText="Number of steps to explore in the best-of-N search (optional)"
          />

          <TextField
            fullWidth
            label="Max Candidates Per Step"
            type="number"
            value={localConfig.maxCandidatesPerStep || ''}
            onChange={(e) => {
              const value = e.target.value ? Number.parseInt(e.target.value, 10) : undefined;
              setLocalConfig({ ...localConfig, maxCandidatesPerStep: value });
            }}
            placeholder="Maximum candidates per step (optional)"
            InputProps={{ inputProps: { min: 1 } }}
            helperText="Maximum number of candidate prompts to generate in each step (optional)"
          />
        </Box>
      );
    } else if (strategy && MULTI_TURN_STRATEGIES.includes(strategy as MultiTurnStrategy)) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Configure the multi-turn strategy parameters.
          </Typography>

          <TextField
            fullWidth
            label="Max Turns"
            type="number"
            value={localConfig.maxTurns || 5}
            onChange={(e) => {
              const value = e.target.value ? Number.parseInt(e.target.value, 10) : 5;
              setLocalConfig({ ...localConfig, maxTurns: value });
            }}
            placeholder="Maximum number of conversation turns (default: 5)"
            InputProps={{ inputProps: { min: 1, max: 20 } }}
            helperText="Maximum number of back-and-forth exchanges with the model"
          />

          <FormControlLabel
            control={
              <Switch
                checked={localConfig.stateful !== false}
                onChange={(e) => setLocalConfig({ ...localConfig, stateful: e.target.checked })}
                color="primary"
              />
            }
            label={
              <Box component="span">
                <Typography variant="body2" component="span">
                  Stateful
                </Typography>
                <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 1 }}>
                  - Enable to maintain conversation history (recommended)
                </Typography>
              </Box>
            }
          />
        </Box>
      );
    } else if (strategy === 'custom') {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Define your custom multi-turn strategy with specific instructions for the AI agent.
          </Typography>

          <TextField
            fullWidth
            multiline
            rows={6}
            label="Strategy Text"
            value={localConfig.strategyText || ''}
            onChange={(e) => {
              setLocalConfig({ ...localConfig, strategyText: e.target.value });
            }}
            placeholder="Describe how the AI should behave across conversation turns. You can reference variables like conversationObjective, currentRound, maxTurns, lastResponse, application purpose, etc."
            helperText={
              !localConfig.strategyText || localConfig.strategyText.trim().length === 0
                ? 'Strategy text is required for custom strategy'
                : 'Define how the AI should behave across conversation turns. You can reference variables like conversationObjective, currentRound, maxTurns, lastResponse, application purpose, etc.'
            }
            error={!localConfig.strategyText || localConfig.strategyText.trim().length === 0}
          />

          <TextField
            fullWidth
            label="Max Turns"
            type="number"
            value={localConfig.maxTurns || 10}
            onChange={(e) => {
              const value = e.target.value ? Number.parseInt(e.target.value, 10) : 10;
              setLocalConfig({ ...localConfig, maxTurns: value });
            }}
            placeholder="Maximum number of conversation turns (default: 10)"
            InputProps={{ inputProps: { min: 1, max: 20 } }}
            helperText="Maximum number of back-and-forth exchanges with the model"
          />

          <FormControlLabel
            control={
              <Switch
                checked={localConfig.stateful !== false}
                onChange={(e) => setLocalConfig({ ...localConfig, stateful: e.target.checked })}
                color="primary"
              />
            }
            label={
              <Box component="span">
                <Typography variant="body2" component="span">
                  Stateful
                </Typography>
                <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 1 }}>
                  - Enable to maintain conversation history (recommended)
                </Typography>
              </Box>
            }
          />
        </Box>
      );
    } else if (strategy === 'pandamonium') {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Configure the Pandamonium experimental jailbreak strategy parameters.
          </Typography>

          <TextField
            fullWidth
            label="Max Turns"
            type="number"
            value={localConfig.maxTurns || 500}
            onChange={(e) => {
              const value = e.target.value ? Number.parseInt(e.target.value, 10) : 500;
              setLocalConfig({ ...localConfig, maxTurns: value });
            }}
            placeholder="Maximum number of iterations (default: 500)"
            InputProps={{ inputProps: { min: 100, max: 1000 } }}
            helperText="Maximum number of iterations to try (note: Pandamonium can be expensive)"
          />

          <FormControlLabel
            control={
              <Switch
                checked={localConfig.stateful !== false}
                onChange={(e) => setLocalConfig({ ...localConfig, stateful: e.target.checked })}
                color="primary"
              />
            }
            label={
              <Box component="span">
                <Typography variant="body2" component="span">
                  Stateful
                </Typography>
                <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 1 }}>
                  - Enable to maintain conversation history
                </Typography>
              </Box>
            }
          />
        </Box>
      );
    } else if (strategy === 'jailbreak:tree') {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Configure the Tree-based Jailbreak strategy parameters.
          </Typography>

          <TextField
            fullWidth
            label="Maximum Depth"
            type="number"
            value={localConfig.maxDepth || 25}
            onChange={(e) => {
              const value = e.target.value ? Number.parseInt(e.target.value, 10) : 25;
              setLocalConfig({ ...localConfig, maxDepth: value });
            }}
            placeholder="Maximum tree depth (default: 25)"
            InputProps={{ inputProps: { min: 3, max: 50 } }}
            helperText="Maximum depth of the search tree"
          />

          <TextField
            fullWidth
            label="Maximum Attempts"
            type="number"
            value={localConfig.maxAttempts || 250}
            onChange={(e) => {
              const value = e.target.value ? Number.parseInt(e.target.value, 10) : 250;
              setLocalConfig({ ...localConfig, maxAttempts: value });
            }}
            placeholder="Maximum attempts (default: 250)"
            InputProps={{ inputProps: { min: 50, max: 500 } }}
            helperText="Maximum number of attempts to try (note: higher values are more expensive)"
          />

          <TextField
            fullWidth
            label="Max Width"
            type="number"
            value={localConfig.maxWidth || 10}
            onChange={(e) => {
              const value = e.target.value ? Number.parseInt(e.target.value, 10) : 10;
              setLocalConfig({ ...localConfig, maxWidth: value });
            }}
            placeholder="Maximum width (default: 10)"
            InputProps={{ inputProps: { min: 3, max: 20 } }}
            helperText="Number of top-scoring nodes to keep during tree pruning"
          />

          <TextField
            fullWidth
            label="Branching Factor"
            type="number"
            value={localConfig.branchingFactor || 4}
            onChange={(e) => {
              const value = e.target.value ? Number.parseInt(e.target.value, 10) : 4;
              setLocalConfig({ ...localConfig, branchingFactor: value });
            }}
            placeholder="Branching factor (default: 4)"
            InputProps={{ inputProps: { min: 2, max: 10 } }}
            helperText="Number of child nodes to generate at each step"
          />

          <TextField
            fullWidth
            label="Max No Improvement"
            type="number"
            value={localConfig.maxNoImprovement || 25}
            onChange={(e) => {
              const value = e.target.value ? Number.parseInt(e.target.value, 10) : 25;
              setLocalConfig({ ...localConfig, maxNoImprovement: value });
            }}
            placeholder="Max consecutive iterations without improvement (default: 25)"
            InputProps={{ inputProps: { min: 5, max: 50 } }}
            helperText="Stop after this many consecutive iterations without score improvement"
          />
        </Box>
      );
    } else if (strategy === 'gcg') {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Configure the Greedy Coordinate Gradient (GCG) attack parameters.
          </Typography>

          <TextField
            fullWidth
            label="Number of Outputs (n)"
            type="number"
            value={localConfig.n || 5}
            onChange={(e) => {
              const value = e.target.value ? Number.parseInt(e.target.value, 10) : 5;
              setLocalConfig({ ...localConfig, n: value });
            }}
            placeholder="Number of adversarial outputs to generate (default: 5)"
            InputProps={{ inputProps: { min: 1, max: 20 } }}
            helperText="More outputs increase chance of success but cost more"
          />
        </Box>
      );
    } else if (strategy === 'citation') {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Configure the Citation-based attack parameters.
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={localConfig.useAcademic !== false}
                onChange={(e) => setLocalConfig({ ...localConfig, useAcademic: e.target.checked })}
                color="primary"
              />
            }
            label={
              <Box component="span">
                <Typography variant="body2" component="span">
                  Use Academic Citations
                </Typography>
                <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 1 }}>
                  - Generate academic-style citations (recommended)
                </Typography>
              </Box>
            }
          />

          <FormControlLabel
            control={
              <Switch
                checked={localConfig.useJournals !== false}
                onChange={(e) => setLocalConfig({ ...localConfig, useJournals: e.target.checked })}
                color="primary"
              />
            }
            label={
              <Box component="span">
                <Typography variant="body2" component="span">
                  Include Journal Citations
                </Typography>
                <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 1 }}>
                  - Include journal articles in citation types
                </Typography>
              </Box>
            }
          />

          <FormControlLabel
            control={
              <Switch
                checked={localConfig.useBooks !== false}
                onChange={(e) => setLocalConfig({ ...localConfig, useBooks: e.target.checked })}
                color="primary"
              />
            }
            label={
              <Box component="span">
                <Typography variant="body2" component="span">
                  Include Book Citations
                </Typography>
                <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 1 }}>
                  - Include books in citation types
                </Typography>
              </Box>
            }
          />
        </Box>
      );
    } else {
      return (
        <Typography color="text.secondary">
          No configuration options available for this strategy.
        </Typography>
      );
    }
  };

  if (!strategy) {
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configure {strategyData?.name ?? strategy}</DialogTitle>
      <DialogContent>{renderStrategyConfig()}</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={(strategy === 'retry' && (!!error || !numTests)) || !isCustomStrategyValid()}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
