import React, { useState } from 'react';
import { callApi } from '@app/utils/api';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { TestCase, ProviderOptions } from '@promptfoo/types';
import { v4 as uuidv4 } from 'uuid';
import type { GenerationBatch } from '../types';

interface GenerateTestCasesDialogProps {
  open: boolean;
  onClose: () => void;
  prompts: string[];
  existingTests: TestCase[];
  providers: ProviderOptions[];
  onGenerated: (newTestCases: TestCase[]) => void;
}

interface GenerationOptions {
  numPersonas: number;
  numTestCasesPerPersona: number;
  instructions: string;
  provider?: string;
}

const GenerateTestCasesDialog: React.FC<GenerateTestCasesDialogProps> = ({
  open,
  onClose,
  prompts,
  existingTests,
  providers,
  onGenerated,
}) => {
  const [options, setOptions] = useState<GenerationOptions>({
    numPersonas: 5,
    numTestCasesPerPersona: 3,
    instructions: '',
    provider: undefined,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [_jobId, setJobId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [simpleTestCaseCount, setSimpleTestCaseCount] = useState(10);

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
    setIsGenerating(true);
    setError(null);
    setProgress({ current: 0, total: totalTestCases });

    try {
      // Start generation job
      const response = await callApi('/generate/dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompts: prompts.map((p) => ({ raw: p })),
          tests: existingTests,
          options: {
            ...options,
            async: true,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.statusText}`);
      }

      const { id } = await response.json();
      setJobId(id);

      // Poll for job completion
      const intervalId = setInterval(async () => {
        try {
          const statusResponse = await callApi(`/generate/job/${id}`);
          if (!statusResponse.ok) {
            clearInterval(intervalId);
            throw new Error('Failed to check job status');
          }

          const jobStatus = await statusResponse.json();

          if (jobStatus.status === 'complete') {
            clearInterval(intervalId);
            const { results } = jobStatus.result || {};
            if (results && Array.isArray(results)) {
              // Create a unique batch ID for this generation
              const batchId = uuidv4();
              
              // Store the batch information (in a real app, this would be saved to a database)
              const generationBatch: GenerationBatch = {
                id: batchId,
                generatedAt: new Date().toISOString(),
                generatedBy: options.provider || 'default',
                type: 'dataset',
                generationOptions: {
                  numPersonas: options.numPersonas,
                  numTestCasesPerPersona: options.numTestCasesPerPersona,
                  instructions: options.instructions,
                },
              };
              
              // Create test cases with just the batch ID reference
              const newTestCases: TestCase[] = results.map((varMapping) => ({
                vars: varMapping,
                metadata: {
                  generationBatchId: batchId,
                },
              }));
              
              // In a real implementation, we'd store the batch info somewhere
              // For now, we'll attach it to the first test case for the UI to use
              if (newTestCases.length > 0) {
                (newTestCases[0].metadata as any)._generationBatch = generationBatch;
              }
              
              onGenerated(newTestCases);
              handleClose();
            } else {
              setError('No test cases were generated');
              setIsGenerating(false);
            }
          } else if (jobStatus.status === 'error' || jobStatus.status === 'failed') {
            clearInterval(intervalId);
            setError(jobStatus.logs?.join('\n') || 'Generation failed');
            setIsGenerating(false);
          } else {
            // Update progress
            setProgress({
              current: jobStatus.progress || 0,
              total: jobStatus.total || totalTestCases,
            });
          }
        } catch (err) {
          clearInterval(intervalId);
          setError(err instanceof Error ? err.message : 'An error occurred');
          setIsGenerating(false);
        }
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start generation');
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    if (!isGenerating) {
      setOptions({
        numPersonas: 5,
        numTestCasesPerPersona: 3,
        instructions: '',
        provider: undefined,
      });
      setError(null);
      setJobId(null);
      setSimpleTestCaseCount(10);
      setShowAdvanced(false);
      onClose();
    }
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
                disabled={isGenerating}
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
                    disabled={isGenerating}
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
                    disabled={isGenerating}
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
            placeholder="e.g., Focus on edge cases, Include diverse demographics, Test error scenarios..."
            fullWidth
          />

          {/* Progress */}
          {isGenerating && (
            <div>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                <CircularProgress size={20} />
                <Typography variant="body2">
                  Generating {totalTestCases} test cases... ({progress.current}/{progress.total})
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

export default GenerateTestCasesDialog;
