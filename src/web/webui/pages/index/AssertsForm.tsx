// src/components/AssertsForm.tsx
import React, { useState } from 'react';
import { Button, TextField, Typography, MenuItem, Grid, IconButton } from '@mui/material';
import { Delete } from '@mui/icons-material';
import type { Assertion } from '../../../../types';

interface AssertsFormProps {
  onAdd: (asserts: Assertion[]) => void;
}

const assertTypes = [
  'Equals',
  'Contains JSON',
  'Is JSON',
  'Similar',
  'LLM-rubric',
];

const AssertsForm: React.FC<AssertsFormProps> = ({ onAdd }) => {
  const [asserts, setAsserts] = useState<Assertion[]>([]);

  const handleAdd = () => {
    const newAsserts = [...asserts, { type: 'Equals', value: '' }];
    setAsserts(newAsserts);
    onAdd(newAsserts);
  };

  const handleRemoveAssert = (indexToRemove: number) => {
    const newAsserts = asserts.filter((_, index) => index !== indexToRemove);
    setAsserts(newAsserts);
    onAdd(newAsserts);
  };

  return (
    <>
      <Typography variant="h6">Asserts</Typography>
      <Grid container spacing={2}>
        {asserts.map((assert, index) => (
          <Grid item xs={12} key={index}>
            <TextField
              label="Type"
              select
              value={assert.type}
              onChange={(e) => {
                const newType = e.target.value;
                const newAsserts = asserts.map((a, i) =>
                  i === index ? { ...a, type: newType } : a
                );
                setAsserts(newAsserts);
                onAdd(newAsserts);
              }}
            >
              {assertTypes.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Value"
              value={assert.value}
              onChange={(e) => {
                const newValue = e.target.value;
                const newAsserts = asserts.map((a, i) =>
                  i === index ? { ...a, value: newValue } : a
                );
                setAsserts(newAsserts);
                onAdd(newAsserts);
              }}
            />
            <IconButton onClick={() => handleRemoveAssert(index)} size="small">
              <Delete />
            </IconButton>
          </Grid>
        ))}
        <Grid item xs={12}>
          <Button color="primary" onClick={handleAdd}>
            Add Assert
          </Button>
        </Grid>
      </Grid>
    </>
  );
};

export default AssertsForm;
