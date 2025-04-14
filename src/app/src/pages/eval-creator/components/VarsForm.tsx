import React, { useEffect } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface VarsFormProps {
  onAdd: (vars: Record<string, string>) => void;
  varsList: string[];
  initialValues?: Record<string, string>;
}

const VarsForm: React.FC<VarsFormProps> = ({ onAdd, varsList, initialValues }) => {
  const [vars, setVars] = React.useState<Record<string, string>>(initialValues || {});

  useEffect(() => {
    const newVars: Record<string, string> = {};
    varsList.forEach((v) => {
      newVars[v] = initialValues?.[v] || '';
    });
    setVars(newVars);
  }, [varsList, initialValues]);

  return (
    <Box my={2}>
      <Typography variant="h6" mb={2}>
        Vars
      </Typography>
      {varsList.length > 0 ? (
        <Stack direction="row" spacing={2} alignItems="center">
          {Object.keys(vars).map((varName, index) => (
            <Stack key={index} direction="row" spacing={2} alignItems="center">
              <TextField
                placeholder={varName}
                label={varName}
                value={vars[varName]}
                fullWidth
                onChange={(e) => {
                  const newValue = e.target.value;
                  const newVars = {
                    ...vars,
                    [varName]: newValue,
                  };
                  setVars(newVars);
                  onAdd(newVars);
                }}
              />
            </Stack>
          ))}
        </Stack>
      ) : (
        <Typography variant="subtitle1" gutterBottom>
          Add variables to your prompt using the {'{{varname}}'} syntax.
        </Typography>
      )}
    </Box>
  );
};

export default VarsForm;
