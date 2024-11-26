import { useCallback } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { Typography, TextField, IconButton, Button } from '@mui/material';
import Tooltip from '@mui/material/Tooltip';
import { Box } from '@mui/system';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

const promptExamples = {
  default: 'You are a helpful assistant. User query: {{ prompt }}',
};

export default function Prompts() {
  const { config, updateConfig } = useRedTeamConfig();

  const addPrompt = () => {
    const newPrompts = [...config.prompts, promptExamples.default];
    updateConfig('prompts', newPrompts);
  };

  const updatePrompt = useCallback(
    (index: number, value: string) => {
      const newPrompts = [...config.prompts];
      newPrompts[index] = value;
      updateConfig('prompts', newPrompts);

      const nonEmptyPrompts = newPrompts.filter((prompt) => prompt.trim() !== '');
      if (nonEmptyPrompts.length === 0) {
        // If all prompts are empty, clear the purpose and entities immediately
        updateConfig('purpose', '');
        updateConfig('entities', []);
      }
    },
    [config.prompts, updateConfig],
  );

  const removePrompt = useCallback(
    (index: number) => {
      const newPrompts = config.prompts.filter((_, i) => i !== index);
      updateConfig('prompts', newPrompts);

      // Check if there are any non-empty prompts left after removal
      const nonEmptyPrompts = newPrompts.filter((prompt) => prompt !== '');
      if (nonEmptyPrompts.length === 0) {
        // Clear the purpose and entities if there are no valid prompts left
        updateConfig('purpose', '');
        updateConfig('entities', []);
      }
    },
    [config.prompts, updateConfig],
  );

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 'medium' }}>
        Prompts
      </Typography>
      <Typography
        variant="body1"
        paragraph
        color="text.secondary"
        sx={{
          mb: 2,
          '& code': {
            px: 0.5,
            py: 0.25,
            backgroundColor: 'action.hover',
            borderRadius: 0.5,
            fontFamily: 'monospace',
          },
        }}
      >
        Enter your prompts below. Use <code>{'{{ prompt }}'}</code> as a placeholder where you want
        the user's input to appear in your prompt template.
      </Typography>
      {config.prompts.map((prompt, index) => (
        <Box key={index} display="flex" alignItems="center" mb={2}>
          <TextField
            fullWidth
            label={config.prompts.length === 1 ? 'Prompt' : `Prompt ${index + 1}`}
            value={prompt}
            onChange={(e) => updatePrompt(index, e.target.value)}
            margin="normal"
            multiline
            rows={3}
          />
          <Tooltip title="Remove prompt">
            <IconButton onClick={() => removePrompt(index)}>
              <DeleteIcon />
            </IconButton>
          </Tooltip>
        </Box>
      ))}
      <Button startIcon={<AddIcon />} onClick={addPrompt} variant="outlined">
        Add Prompt
      </Button>
    </Box>
  );
}
