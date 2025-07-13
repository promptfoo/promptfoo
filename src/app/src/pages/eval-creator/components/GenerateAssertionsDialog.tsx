import React, { useState } from 'react';
import { generationService } from '@app/services/generation';
import type { GenerateAssertionsOptions } from '@app/services/generation';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { TestCase, ProviderOptions, Assertion } from '@promptfoo/types';

interface GenerateAssertionsDialogProps {
  open: boolean;
  onClose: () => void;
  prompts: string[];
  testCase?: TestCase; // Optional - if provided, generate for specific test case
  allTestCases: TestCase[];
  providers: ProviderOptions[];
  onGenerated: (assertions: Assertion[]) => void;
}

const ASSERTION_TYPE_DESCRIPTIONS = {
  pi: 'Performance and Impact - Evaluates quality, performance, and impact metrics',
  'g-eval': 'G-Eval - Uses chain-of-thought prompting for evaluation',
  'llm-rubric': 'LLM Rubric - Custom evaluation criteria using natural language',
};

const GenerateAssertionsDialog: React.FC<GenerateAssertionsDialogProps> = ({
  open,
  onClose,
  prompts,
  testCase,
  allTestCases,
  providers,
  onGenerated,
}) => {
  const [options, setOptions] = useState<GenerateAssertionsOptions>({
    numQuestions: 5,
    type: 'pi',
    instructions: '',
    provider: undefined,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setProgress({ current: 0, total: options.numQuestions || 5 });

    try {
      const testsToUse = testCase ? [testCase] : allTestCases;
      
      await generationService.generateAssertions(prompts, testsToUse, options, {
        onProgress: (current, total) => {
          setProgress({ current, total });
        },
        onComplete: (results) => {
          const assertions = results as Assertion[];
          onGenerated(assertions);
          handleClose();
        },
        onError: (errorMessage) => {
          setError(errorMessage);
          setIsGenerating(false);
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start generation');
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    if (!isGenerating) {
      setOptions({
        numQuestions: 5,
        type: 'pi',
        instructions: '',
        provider: undefined,
      });
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Generate Assertions</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Context Preview */}
          <div>
            <Typography variant="subtitle2" gutterBottom>
              Context
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Generating assertions for {testCase ? '1 specific test case' : `${allTestCases.length} test cases`}
            </Typography>
            {prompts.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                Using {prompts.length} prompt{prompts.length > 1 ? 's' : ''} as context
              </Typography>
            )}
          </div>

          {/* Assertion Type Selection */}
          <FormControl component="fieldset">
            <FormLabel component="legend">Assertion Type</FormLabel>
            <RadioGroup
              value={options.type}
              onChange={(e) => setOptions({ ...options, type: e.target.value as GenerateAssertionsOptions['type'] })}
            >
              {Object.entries(ASSERTION_TYPE_DESCRIPTIONS).map(([value, description]) => (
                <FormControlLabel
                  key={value}
                  value={value}
                  control={<Radio />}
                  label={
                    <div>
                      <Typography variant="body2">{value}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {description}
                      </Typography>
                    </div>
                  }
                  disabled={isGenerating}
                />
              ))}
            </RadioGroup>
          </FormControl>

          {/* Number of Assertions */}
          <div>
            <Typography variant="subtitle2" gutterBottom>
              Number of Assertions
            </Typography>
            <Slider
              value={options.numQuestions || 5}
              onChange={(_, value) => setOptions({ ...options, numQuestions: value as number })}
              min={1}
              max={10}
              marks
              valueLabelDisplay="auto"
              disabled={isGenerating}
            />
          </div>

          {/* Provider Selection */}
          {providers.length > 0 && (
            <FormControl fullWidth>
              <InputLabel>Provider (Optional)</InputLabel>
              <Select
                value={options.provider || ''}
                onChange={(e) => setOptions({ ...options, provider: e.target.value || undefined })}
                disabled={isGenerating}
                label="Provider (Optional)"
              >
                <MenuItem value="">
                  <em>Use default synthesis provider</em>
                </MenuItem>
                {providers.map((provider) => (
                  <MenuItem key={provider.id} value={provider.id}>
                    {provider.label || provider.id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Instructions */}
          <TextField
            label="Additional Instructions (Optional)"
            multiline
            rows={3}
            value={options.instructions}
            onChange={(e) => setOptions({ ...options, instructions: e.target.value })}
            disabled={isGenerating}
            placeholder="e.g., Focus on safety checks, Include performance metrics, Test accuracy..."
            fullWidth
          />

          {/* Progress */}
          {isGenerating && (
            <div>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                <CircularProgress size={20} />
                <Typography variant="body2">
                  Generating assertions... ({progress.current}/{progress.total})
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0}
              />
            </div>
          )}

          {/* Error Display */}
          {error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isGenerating}>
          Cancel
        </Button>
        <Button
          onClick={handleGenerate}
          variant="contained"
          disabled={isGenerating || prompts.length === 0}
        >
          {isGenerating ? 'Generating...' : 'Generate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default GenerateAssertionsDialog; 