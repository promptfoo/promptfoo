import React, { useState } from 'react';
import { callApi } from '@app/utils/api';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import type { TestCase, ProviderOptions } from '@promptfoo/types';

interface GenerateTestCasesDialogProps {
  open: boolean;
  onClose: () => void;
  prompts: string[];
  existingTests: TestCase[];
  providers: ProviderOptions[];
  onGenerated: (newTestCases: TestCase[]) => void;
  onGenerationStarted?: (jobId: string, totalCount: number) => void;
}

interface GenerationOptions {
  numPersonas: number;
  numTestCasesPerPersona: number;
  instructions: string;
  provider?: string;
  includeAssertions: boolean;
}

const GenerateTestCasesDialog: React.FC<GenerateTestCasesDialogProps> = ({
  open,
  onClose,
  prompts,
  existingTests,
  providers,
  onGenerationStarted,
}) => {
  const [options, setOptions] = useState<GenerationOptions>({
    numPersonas: 5,
    numTestCasesPerPersona: 3,
    instructions: '',
    provider: undefined,
    includeAssertions: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [simpleTestCaseCount, setSimpleTestCaseCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);

  // Extract variables from prompts
  const extractedVariables = React.useMemo(() => {
    const varRegex = /{{\s*(\w+)\s*}}/g;
    const varsSet = new Set<string>();
    prompts.forEach((prompt) => {
      let match;
      while ((match = varRegex.exec(prompt)) !== null) {
        varsSet.add(match[1]);
      }
    });
    return Array.from(varsSet);
  }, [prompts]);

  const totalTestCases = showAdvanced
    ? options.numPersonas * options.numTestCasesPerPersona
    : simpleTestCaseCount;

  // Sync advanced options when switching modes
  React.useEffect(() => {
    if (!showAdvanced) {
      // Update options to match simple count
      // Try to find reasonable factors
      const personas = Math.min(5, simpleTestCaseCount);
      const perPersona = Math.ceil(simpleTestCaseCount / personas);
      setOptions((prev) => ({
        ...prev,
        numPersonas: personas,
        numTestCasesPerPersona: perPersona,
      }));
    }
  }, [simpleTestCaseCount, showAdvanced]);

  const handleGenerate = async () => {
    setError(null);
    setIsGenerating(true);

    try {
      // Start generation job
      const response = await callApi('/generate/dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompts: prompts.map((p) => ({ raw: p })),
          tests: existingTests,
          options: {
            numPersonas: options.numPersonas,
            numTestCasesPerPersona: options.numTestCasesPerPersona,
            instructions: options.instructions,
            provider: options.provider,
            async: true,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.statusText}`);
      }

      const { id } = await response.json();

      // Pass the job info to parent and close dialog
      if (onGenerationStarted) {
        onGenerationStarted(id, totalTestCases);
      }

      // Store options for the parent to use
      localStorage.setItem(
        `generation-job-${id}`,
        JSON.stringify({
          includeAssertions: options.includeAssertions,
          provider: options.provider,
          prompts,
        }),
      );

      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start generation');
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    // Reset state
    setOptions({
      numPersonas: 5,
      numTestCasesPerPersona: 3,
      instructions: '',
      provider: undefined,
      includeAssertions: false,
    });
    setError(null);
    setSimpleTestCaseCount(10);
    setShowAdvanced(false);
    setIsGenerating(false);

    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Generate Test Cases</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Preview Section */}
          <div>
            <Typography variant="subtitle2" gutterBottom>
              Prompts ({prompts.length})
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {prompts.length === 1 ? prompts[0] : `${prompts.length} prompts configured`}
            </Typography>
            {extractedVariables.length > 0 && (
              <>
                <Typography variant="subtitle2" gutterBottom>
                  Variables to Generate
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {extractedVariables.join(', ')}
                </Typography>
              </>
            )}
          </div>

          {/* Simple Mode - Number of Test Cases */}
          {!showAdvanced && (
            <div>
              <Typography variant="subtitle2" gutterBottom>
                Number of Test Cases
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                How many test variations would you like to generate?
              </Typography>
              <Slider
                value={simpleTestCaseCount}
                onChange={(_, value) => setSimpleTestCaseCount(value as number)}
                min={1}
                max={50}
                marks={[
                  { value: 1, label: '1' },
                  { value: 10, label: '10' },
                  { value: 25, label: '25' },
                  { value: 50, label: '50' },
                ]}
                valueLabelDisplay="auto"
              />
            </div>
          )}

          {/* Advanced Mode - Personas */}
          <Accordion
            expanded={showAdvanced}
            onChange={() => setShowAdvanced(!showAdvanced)}
            sx={{ mt: 2, mb: 2 }}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography>Advanced Options</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={3}>
                <Typography variant="body2" color="text.secondary">
                  Generate test cases using personas - different user types or scenarios that will
                  each get multiple test variations.
                </Typography>

                <div>
                  <Typography variant="subtitle2" gutterBottom>
                    Number of Personas
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Different user types or scenarios (e.g., "admin user", "first-time visitor",
                    "mobile user")
                  </Typography>
                  <Slider
                    value={options.numPersonas}
                    onChange={(_, value) =>
                      setOptions({ ...options, numPersonas: value as number })
                    }
                    min={1}
                    max={20}
                    marks
                    valueLabelDisplay="auto"
                  />
                </div>

                <div>
                  <Typography variant="subtitle2" gutterBottom>
                    Test Cases per Persona
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Variations to generate for each persona
                  </Typography>
                  <Slider
                    value={options.numTestCasesPerPersona}
                    onChange={(_, value) =>
                      setOptions({ ...options, numTestCasesPerPersona: value as number })
                    }
                    min={1}
                    max={10}
                    marks
                    valueLabelDisplay="auto"
                  />
                </div>

                <Typography variant="body2" color="primary">
                  Total: {options.numPersonas} personas × {options.numTestCasesPerPersona}{' '}
                  variations = {options.numPersonas * options.numTestCasesPerPersona} test cases
                </Typography>
              </Stack>
            </AccordionDetails>
          </Accordion>

          {/* Provider Selection */}
          {providers.length > 0 && (
            <FormControl fullWidth>
              <InputLabel>Provider (Optional)</InputLabel>
              <Select
                value={options.provider || ''}
                onChange={(e) => setOptions({ ...options, provider: e.target.value || undefined })}
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
            placeholder="e.g., Focus on edge cases, Include diverse demographics, Test error scenarios..."
            fullWidth
          />

          {/* Include Assertions */}
          <FormControlLabel
            control={
              <Checkbox
                checked={options.includeAssertions}
                onChange={(e) => setOptions({ ...options, includeAssertions: e.target.checked })}
              />
            }
            label={
              <div>
                <Typography variant="body2">Include assertions</Typography>
                <Typography variant="caption" color="text.secondary">
                  Generate 2 unique LLM-rubric assertions for each test case (adds time)
                </Typography>
              </div>
            }
          />

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
          disabled={prompts.length === 0 || isGenerating}
          startIcon={isGenerating ? <CircularProgress size={20} color="inherit" /> : null}
        >
          {isGenerating ? 'Generating...' : 'Generate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default GenerateTestCasesDialog;
