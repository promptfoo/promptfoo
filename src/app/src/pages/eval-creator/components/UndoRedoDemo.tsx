import React from 'react';
import { Box, Button, Stack, Typography, Paper } from '@mui/material';
import { useStore } from '@app/stores/evalConfig';
import { useHistoryStore } from '@app/stores/evalConfigWithHistory';

/**
 * Demo component to test undo/redo functionality
 * This is for development/testing purposes only
 */
export const UndoRedoDemo: React.FC = () => {
  const { config, updateConfig } = useStore();
  const { history, currentIndex, canUndo, canRedo, getUndoDescription, getRedoDescription } =
    useHistoryStore();

  const addPrompt = () => {
    const currentPrompts = Array.isArray(config.prompts) ? config.prompts : [];
    updateConfig({
      prompts: [...currentPrompts, `Test prompt ${currentPrompts.length + 1}`],
    });
  };

  const addProvider = () => {
    const currentProviders = Array.isArray(config.providers) ? config.providers : [];
    updateConfig({
      providers: [...currentProviders, { id: `openai:gpt-3.5-turbo` }],
    });
  };

  const updateDescription = () => {
    updateConfig({
      description: `Updated at ${new Date().toLocaleTimeString()}`,
    });
  };

  return (
    <Paper sx={{ p: 2, mt: 2 }}>
      <Typography variant="h6" gutterBottom>
        Undo/Redo Demo
      </Typography>

      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle2">Actions:</Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" size="small" onClick={addPrompt}>
              Add Prompt
            </Button>
            <Button variant="contained" size="small" onClick={addProvider}>
              Add Provider
            </Button>
            <Button variant="contained" size="small" onClick={updateDescription}>
              Update Description
            </Button>
          </Stack>
        </Box>

        <Box>
          <Typography variant="subtitle2">History Status:</Typography>
          <Typography variant="body2">History entries: {history.length}</Typography>
          <Typography variant="body2">Current index: {currentIndex}</Typography>
          <Typography variant="body2">
            Can undo: {canUndo ? `Yes - ${getUndoDescription()}` : 'No'}
          </Typography>
          <Typography variant="body2">
            Can redo: {canRedo ? `Yes - ${getRedoDescription()}` : 'No'}
          </Typography>
        </Box>

        <Box>
          <Typography variant="subtitle2">Recent History:</Typography>
          {history.slice(-5).map((entry, idx) => (
            <Typography
              key={idx}
              variant="body2"
              sx={{
                fontWeight: history.length - 5 + idx === currentIndex ? 'bold' : 'normal',
                color:
                  history.length - 5 + idx === currentIndex ? 'primary.main' : 'text.secondary',
              }}
            >
              {history.length - 5 + idx === currentIndex ? '→ ' : '  '}
              {entry.description} ({new Date(entry.timestamp).toLocaleTimeString()})
            </Typography>
          ))}
        </Box>
      </Stack>
    </Paper>
  );
};
