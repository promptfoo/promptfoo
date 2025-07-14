import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Typography,
  Stack,
  Alert,
  CircularProgress,
  Chip,
  Box,
  FormHelperText,
  Slider,
  IconButton,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import type { TestCase } from '@promptfoo/types';
import { callApi } from '@app/utils/api';
import { useUserPreferences } from '@app/stores/userPreferences';

interface GenerateAssertionsDialogProps {
  open: boolean;
  onClose: () => void;
  onAssertionsGenerated: (assertions: any[]) => void;
  prompts: string[];
  testCase: TestCase;
  existingAssertions?: any[];
}

type AssertionType = 'pi' | 'g-eval' | 'llm-rubric';

const assertionTypeInfo: Record<AssertionType, { name: string; description: string }> = {
  pi: {
    name: 'Probabilistic Inference (PI)',
    description:
      'Uses probabilistic reasoning for subjective evaluation. Good for nuanced assessments.',
  },
  'g-eval': {
    name: 'G-Eval Framework',
    description:
      'Structured evaluation framework with step-by-step reasoning. Best for complex criteria.',
  },
  'llm-rubric': {
    name: 'LLM Rubric',
    description:
      'Direct LLM-based evaluation using rubrics. Simple and effective for most use cases.',
  },
};

const GenerateAssertionsDialog: React.FC<GenerateAssertionsDialogProps> = ({
  open,
  onClose,
  onAssertionsGenerated,
  prompts,
  testCase,
  existingAssertions = [],
}) => {
  const { experienceMode } = useUserPreferences();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generation options
  const [assertionType, setAssertionType] = useState<AssertionType>('llm-rubric');
  const [numAssertions, setNumAssertions] = useState(5);
  const [instructions, setInstructions] = useState('');
  const [provider, setProvider] = useState('');
  const [focusAreas, setFocusAreas] = useState<string[]>([]);

  // Common focus areas for quick selection
  const suggestedFocusAreas = [
    'Accuracy',
    'Completeness',
    'Relevance',
    'Clarity',
    'Conciseness',
    'Tone',
    'Safety',
    'Format',
    'Consistency',
    'Factuality',
  ];

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      // Build instructions from focus areas and custom instructions
      const fullInstructions = [
        ...focusAreas.map((area) => `Focus on ${area.toLowerCase()}`),
        instructions,
      ]
        .filter(Boolean)
        .join('. ');

      const response = await callApi('/generate/assertions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompts: prompts.map((p) => ({ raw: p })),
          tests: [testCase],
          options: {
            type: assertionType,
            numQuestions: numAssertions,
            instructions: fullInstructions || undefined,
            provider: provider || undefined,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate assertions');
      }

      const { results } = await response.json();
      if (results && results.length > 0) {
        onAssertionsGenerated(results);
        onClose();
      } else {
        throw new Error('No assertions were generated');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during generation');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleFocusArea = (area: string) => {
    setFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 },
      }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={1} alignItems="center">
            <AutoAwesomeIcon color="primary" />
            <Typography variant="h6">Generate Assertions</Typography>
          </Stack>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        <Stack spacing={3}>
          {experienceMode === 'beginner' && (
            <Alert severity="info" variant="outlined">
              Generates intelligent assertions based on your prompts and test case. The AI will
              create both objective (Python-based) and subjective (LLM-based) evaluations.
            </Alert>
          )}

          {/* Assertion Type */}
          <FormControl fullWidth>
            <InputLabel>Assertion Type</InputLabel>
            <Select
              value={assertionType}
              onChange={(e) => setAssertionType(e.target.value as AssertionType)}
              label="Assertion Type"
            >
              {Object.entries(assertionTypeInfo).map(([type, info]) => (
                <MenuItem key={type} value={type}>
                  <Box>
                    <Typography variant="body2">{info.name}</Typography>
                    {experienceMode === 'beginner' && (
                      <Typography variant="caption" color="text.secondary">
                        {info.description}
                      </Typography>
                    )}
                  </Box>
                </MenuItem>
              ))}
            </Select>
            {experienceMode === 'beginner' && (
              <FormHelperText>
                Choose the evaluation framework for subjective assertions
              </FormHelperText>
            )}
          </FormControl>

          {/* Number of Assertions */}
          <Box>
            <Typography gutterBottom>
              Number of Assertions
              {experienceMode === 'beginner' && (
                <Tooltip title="How many unique assertions to generate">
                  <HelpOutlineIcon sx={{ fontSize: 16, ml: 0.5, verticalAlign: 'middle' }} />
                </Tooltip>
              )}
            </Typography>
            <Slider
              value={numAssertions}
              onChange={(_, value) => setNumAssertions(value as number)}
              min={1}
              max={10}
              marks
              valueLabelDisplay="auto"
            />
            <Typography variant="caption" color="text.secondary">
              Current: {numAssertions} assertion{numAssertions !== 1 ? 's' : ''}
              {existingAssertions.length > 0 && ` (${existingAssertions.length} existing)`}
            </Typography>
          </Box>

          {/* Focus Areas */}
          <Box>
            <Typography gutterBottom>
              Focus Areas (optional)
              {experienceMode === 'beginner' && (
                <Tooltip title="Click to select areas of focus for assertion generation">
                  <HelpOutlineIcon sx={{ fontSize: 16, ml: 0.5, verticalAlign: 'middle' }} />
                </Tooltip>
              )}
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={1}>
              {suggestedFocusAreas.map((area) => (
                <Chip
                  key={area}
                  label={area}
                  onClick={() => toggleFocusArea(area)}
                  color={focusAreas.includes(area) ? 'primary' : 'default'}
                  variant={focusAreas.includes(area) ? 'filled' : 'outlined'}
                  size="small"
                />
              ))}
            </Box>
          </Box>

          {/* Custom Instructions */}
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Additional Instructions (optional)"
            placeholder="E.g., Focus on technical accuracy and proper formatting"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            helperText={
              experienceMode === 'beginner' ? 'Provide specific guidance for assertion generation' : undefined
            }
          />

          {/* Provider Override */}
          <TextField
            fullWidth
            label="Provider Override (optional)"
            placeholder="E.g., openai:gpt-4"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            helperText={experienceMode === 'beginner' ? 'Leave empty to use default grading provider' : undefined}
          />

          {/* Error Display */}
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* Test Case Preview */}
          {experienceMode === 'beginner' && (
            <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Generating assertions for:
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {JSON.stringify(testCase.vars, null, 2)}
              </Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={isGenerating}>
          Cancel
        </Button>
        <Button
          onClick={handleGenerate}
          variant="contained"
          disabled={isGenerating || prompts.length === 0}
          startIcon={isGenerating ? <CircularProgress size={16} /> : <AutoAwesomeIcon />}
        >
          {isGenerating
            ? 'Generating...'
            : `Generate ${numAssertions} Assertion${numAssertions !== 1 ? 's' : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default GenerateAssertionsDialog;
