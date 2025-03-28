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
}

export default function StrategyConfigDialog({
  open,
  strategy,
  config,
  onClose,
  onSave,
}: StrategyConfigDialogProps) {
  const [numIterations, setNumIterations] = React.useState<string>(
    config.numIterations?.toString() || '10',
  );
  const [languages, setLanguages] = React.useState<string[]>(
    config.languages || Object.keys(DEFAULT_LANGUAGES),
  );
  const [enabled, setEnabled] = React.useState<boolean>(
    config.enabled === undefined ? true : config.enabled,
  );
  const [numTests, setNumTests] = React.useState<string>(config.numTests?.toString() || '10');
  const [newLanguage, setNewLanguage] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');

  const handleNumIterationsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const num = Number.parseInt(value, 10);

    if (num < 1) {
      setError('Must be at least 1');
    } else {
      setError('');
    }

    setNumIterations(value);
  };

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

  const handleSave = () => {
    if (!strategy) {
      return;
    }

    if (strategy === 'basic') {
      onSave(strategy, {
        ...config,
        enabled,
      });
    } else if (strategy === 'jailbreak') {
      const num = Number.parseInt(numIterations, 10);
      if (num >= 1) {
        onSave(strategy, {
          ...config,
          numIterations: num,
        });
      }
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

  if (!strategy) {
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configure {strategy}</DialogTitle>
      <DialogContent>
        {strategy === 'basic' && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              The basic strategy determines whether to include the original plugin-generated test
              cases in your evaluation. These are the default test cases created by each plugin
              before any strategies are applied.
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
        )}
        {strategy === 'jailbreak' && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Configure the number of iterations for the jailbreak strategy. A higher number may
              find more effective prompts but will take longer to run.
            </Typography>
            <TextField
              fullWidth
              label="Number of Iterations"
              type="number"
              value={numIterations}
              onChange={handleNumIterationsChange}
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
        )}
        {strategy === 'multilingual' && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Configure languages for testing. By default, we test with low-resource languages that
              are more likely to bypass safety mechanisms. This will generate a duplicate set of
              tests for each language.
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
        )}
        {strategy === 'retry' && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Automatically reuse previously failed test cases to identify additional
              vulnerabilities and identify regressions.
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
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={
            (strategy === 'jailbreak' && (!!error || !numIterations)) ||
            (strategy === 'retry' && (!!error || !numTests))
          }
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
