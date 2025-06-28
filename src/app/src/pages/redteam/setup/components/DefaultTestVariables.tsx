import React from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

export default function DefaultTestVariables() {
  const { config, updateConfig } = useRedTeamConfig();

  const updateDefaultTestVars = (vars: Record<string, any>) => {
    updateConfig('defaultTest', { ...config.defaultTest, vars });
  };

  const addVar = () => {
    const currentVars = config.defaultTest?.vars || {};
    let newKey = 'newVar';
    let counter = 1;
    while (newKey in currentVars) {
      newKey = `newVar${counter}`;
      counter++;
    }
    const newVars = { ...currentVars, [newKey]: '' };
    updateDefaultTestVars(newVars);
  };

  const updateVar = (oldKey: string, newKey: string, value: string) => {
    const currentVars = { ...(config.defaultTest?.vars || {}) };

    // Prevent overwriting existing keys when renaming
    if (oldKey !== newKey && newKey in currentVars) {
      // Silently ignore the rename to prevent data loss
      return;
    }

    if (oldKey !== newKey && oldKey in currentVars) {
      delete currentVars[oldKey];
    }
    currentVars[newKey] = value;
    updateDefaultTestVars(currentVars);
  };

  const removeVar = (key: string) => {
    const currentVars = { ...(config.defaultTest?.vars || {}) };
    delete currentVars[key];
    updateDefaultTestVars(currentVars);
  };

  return (
    <>
      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        Test Variables
      </Typography>

      <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
        <Box sx={{ mb: 3 }}>
          <Box display="flex" alignItems="flex-start" justifyContent="space-between" mb={2}>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ maxWidth: '70%', lineHeight: 1.6 }}
            >
              Set default variables that will be available across all test cases. Useful for
              parameterizing endpoints, API keys, language codes, etc.
            </Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={addVar}
              variant="outlined"
              sx={{ flexShrink: 0, ml: 2 }}
            >
              Add Variable
            </Button>
          </Box>
        </Box>

        {Object.keys(config.defaultTest?.vars || {}).length > 0 ? (
          <Stack spacing={2.5}>
            {Object.entries(config.defaultTest?.vars || {}).map(([key, value], index) => (
              <Box key={`variable-${index}`} display="flex" gap={2} alignItems="center">
                <TextField
                  size="small"
                  label="Variable name"
                  value={key}
                  onChange={(e) => updateVar(key, e.target.value, String(value))}
                  sx={{ minWidth: 200 }}
                />
                <TextField
                  size="small"
                  label="Value"
                  value={String(value)}
                  onChange={(e) => updateVar(key, key, e.target.value)}
                  sx={{ flexGrow: 1 }}
                />
                <IconButton
                  onClick={() => removeVar(key)}
                  size="small"
                  color="error"
                  aria-label={`Delete variable ${key}`}
                  sx={{ ml: 1 }}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            ))}
          </Stack>
        ) : (
          <Box
            sx={{
              textAlign: 'center',
              py: 6,
              px: 3,
              borderRadius: 2,
              bgcolor: 'grey.50',
              border: '1px dashed',
              borderColor: 'grey.300',
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              No test variables configured
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Optional variables that will be added to every test case
            </Typography>
          </Box>
        )}
      </Paper>
    </>
  );
}
