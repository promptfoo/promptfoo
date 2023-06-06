import React, { useEffect } from 'react';
import { TextField, Typography, Grid } from '@mui/material';

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
    <>
      <Typography variant="h6">Vars</Typography>
      {varsList.length > 0 ? (
        <Grid container spacing={2}>
          {Object.keys(vars).map((varName, index) => (
            <Grid item xs={12} key={index}>
              <TextField
                label="Key"
                value={varName}
                InputProps={{
                  readOnly: true,
                }}
              />
              <TextField
                label="Value"
                value={vars[varName]}
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
            </Grid>
          ))}
        </Grid>
      ) : (
        <Typography variant="subtitle1" gutterBottom>
          Add variables to your prompt using the {"{{varname}}"} syntax.
        </Typography>
      )}
    </>
  );
};

export default VarsForm;
