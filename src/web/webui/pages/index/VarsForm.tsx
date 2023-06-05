import React, { useEffect } from 'react';
import { TextField, Typography, Grid } from '@mui/material';

interface VarsFormProps {
  onAdd: (vars: Record<string, string>) => void;
  varsList: string[];
}

const VarsForm: React.FC<VarsFormProps> = ({ onAdd, varsList }) => {
  const [vars, setVars] = React.useState<Record<string, string>[]>([]);

  useEffect(() => {
    const newVars = varsList.map((varName) => ({ [varName]: '' }));
    setVars(newVars);
    onAdd(Object.assign({}, ...newVars));
  }, [varsList, onAdd]);

  return (
    <>
      <Typography variant="h6">Vars</Typography>
      {varsList.length > 0 ? (
        <Grid container spacing={2}>
          {vars.map((variable, index) => (
            <Grid item xs={12} key={index}>
              <TextField
                label="Key"
                value={Object.keys(variable)[0] || ''}
                InputProps={{
                  readOnly: true,
                }}
              />
              <TextField
                label="Value"
                value={Object.values(variable)[0] || ''}
                onChange={(e) => {
                  const newValue = e.target.value;
                  const newVars = vars.map((v, i) =>
                    i === index ? { [Object.keys(v)[0]]: newValue } : v
                  );
                  setVars(newVars);
                  onAdd(Object.assign({}, ...newVars));
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
