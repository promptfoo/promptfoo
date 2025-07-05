import React, { useState, useEffect, useCallback, useRef } from 'react';
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

interface Variable {
  id: string;
  name: string;
  value: string;
  nameError?: string;
}

export default function DefaultTestVariables() {
  const { config, updateConfig } = useRedTeamConfig();

  // Local state for the form
  const [variables, setVariables] = useState<Variable[]>([]);
  const isUpdatingFromLocal = useRef(false);

  // Initialize local state from global config, but not when we're the source of the change
  useEffect(() => {
    if (!isUpdatingFromLocal.current) {
      const configVars = config.defaultTest?.vars || {};
      const variableList = Object.entries(configVars).map(([name, value], index) => ({
        id: `var-${Date.now()}-${index}`,
        name,
        value: String(value),
      }));
      setVariables(variableList);
    }
    isUpdatingFromLocal.current = false;
  }, [config.defaultTest?.vars]);

  // Sync local state back to global config
  const syncToGlobalState = useCallback(() => {
    const vars: Record<string, string> = {};
    variables.forEach((variable) => {
      if (variable.name.trim() && !variable.nameError) {
        vars[variable.name.trim()] = variable.value;
      }
    });
    isUpdatingFromLocal.current = true; // Mark that we're updating from local state
    updateConfig('defaultTest', { ...config.defaultTest, vars });
  }, [variables, config.defaultTest, updateConfig]);

  // Validate variable names for duplicates
  const validateVariableNames = useCallback((updatedVariables: Variable[]) => {
    const nameCount = new Map<string, number>();

    // Count occurrences of each name
    updatedVariables.forEach((variable) => {
      const trimmedName = variable.name.trim();
      if (trimmedName) {
        nameCount.set(trimmedName, (nameCount.get(trimmedName) || 0) + 1);
      }
    });

    // Mark duplicates with errors
    return updatedVariables.map((variable) => {
      const trimmedName = variable.name.trim();
      const isDuplicate = trimmedName && nameCount.get(trimmedName)! > 1;
      return {
        ...variable,
        nameError: isDuplicate ? 'Duplicate variable name' : undefined,
      };
    });
  }, []);

  const addVariable = () => {
    const newVariable: Variable = {
      id: `var-${Date.now()}`,
      name: 'newVar',
      value: '',
    };

    // Generate unique name
    const existingNames = variables.map((v) => v.name);
    let counter = 1;
    let newName = 'newVar';
    while (existingNames.includes(newName)) {
      newName = `newVar${counter}`;
      counter++;
    }
    newVariable.name = newName;

    const updatedVariables = validateVariableNames([...variables, newVariable]);
    setVariables(updatedVariables);
  };

  const updateVariableName = (id: string, name: string) => {
    const updatedVariables = variables.map((variable) =>
      variable.id === id ? { ...variable, name } : variable,
    );
    const validatedVariables = validateVariableNames(updatedVariables);
    setVariables(validatedVariables);
  };

  const updateVariableValue = (id: string, value: string) => {
    const updatedVariables = variables.map((variable) =>
      variable.id === id ? { ...variable, value } : variable,
    );
    setVariables(updatedVariables);
  };

  const removeVariable = (id: string) => {
    const updatedVariables = variables.filter((variable) => variable.id !== id);
    const validatedVariables = validateVariableNames(updatedVariables);
    setVariables(validatedVariables);
  };

  // Sync to global state when variables change (debounced effect)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      syncToGlobalState();
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [syncToGlobalState]);

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
              onClick={addVariable}
              variant="outlined"
              sx={{ flexShrink: 0, ml: 2 }}
            >
              Add Variable
            </Button>
          </Box>
        </Box>

        {variables.length > 0 ? (
          <Stack spacing={2.5}>
            {variables.map((variable) => (
              <Box key={variable.id} display="flex" gap={2} alignItems="flex-start">
                <TextField
                  size="small"
                  label="Variable name"
                  value={variable.name}
                  onChange={(e) => updateVariableName(variable.id, e.target.value)}
                  error={!!variable.nameError}
                  helperText={variable.nameError}
                  sx={{ minWidth: 200 }}
                />
                <TextField
                  size="small"
                  label="Value"
                  value={variable.value}
                  onChange={(e) => updateVariableValue(variable.id, e.target.value)}
                  sx={{ flexGrow: 1 }}
                />
                <IconButton
                  onClick={() => removeVariable(variable.id)}
                  size="small"
                  color="error"
                  aria-label={`Delete variable ${variable.name}`}
                  sx={{ ml: 1, mt: 1 }}
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
