// src/components/AssertsForm.tsx
import React, { useState } from 'react';
import { Box, Button, TextField, Typography, MenuItem, Stack, IconButton } from '@mui/material';
import { Delete } from '@mui/icons-material';
import type { Assertion, AssertionType } from '../../../../types';

interface AssertsFormProps {
  onAdd: (asserts: Assertion[]) => void;
  initialValues: Assertion[];
}

const assertTypes: AssertionType[] = [
  'equals',
  'contains',
  'icontains',
  'contains-all',
  'contains-any',
  'starts-with',
  'regex',
  'is-json',
  'contains-json',
  'javascript',
  'python',
  'similar',
  'llm-rubric',
  'webhook',
  'rouge-n',
  'rouge-s',
  'rouge-l',
  'not-equals',
  'not-contains',
  'not-icontains',
  'not-contains-all',
  'not-contains-any',
  'not-starts-with',
  'not-regex',
  'not-is-json',
  'not-contains-json',
  'not-javascript',
  'not-python',
  'not-similar',
  'not-llm-rubric',
  'not-webhook',
  'not-rouge-n',
  'not-rouge-s',
  'not-rouge-l',
];

const AssertsForm: React.FC<AssertsFormProps> = ({ onAdd, initialValues }) => {
  const [asserts, setAsserts] = useState<Assertion[]>(initialValues || []);

  const handleAdd = () => {
    const newAsserts = [...asserts, { type: 'equals' as AssertionType, value: '' }];
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
      <Box my={2}>
        <Stack direction="column" spacing={2}>
          {asserts.map((assert, index) => (
            <Stack key={index} direction="row" spacing={2} alignItems="center">
              <TextField
                label="Type"
                select
                value={assert.type}
                sx={{ minWidth: 200 }}
                onChange={(e) => {
                  const newType = e.target.value;
                  const newAsserts = asserts.map((a, i) =>
                    i === index ? { ...a, type: newType as AssertionType } : a,
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
                fullWidth
                onChange={(e) => {
                  const newValue = e.target.value;
                  const newAsserts = asserts.map((a, i) =>
                    i === index ? { ...a, value: newValue } : a,
                  );
                  setAsserts(newAsserts);
                  onAdd(newAsserts);
                }}
              />
              <IconButton onClick={() => handleRemoveAssert(index)} size="small">
                <Delete />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      </Box>
      <Button color="primary" onClick={handleAdd}>
        Add Assert
      </Button>
    </>
  );
};

export default AssertsForm;
