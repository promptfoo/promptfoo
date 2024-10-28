import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import type { Assertion, TestCase } from '@promptfoo/types';
import AssertsForm from './AssertsForm';
import VarsForm from './VarsForm';

interface TestCaseFormProps {
  open: boolean;
  onAdd: (testCase: TestCase, shouldClose: boolean) => void;
  varsList: string[];
  initialValues?: TestCase;
  onCancel: () => void;
}

const TestCaseForm: React.FC<TestCaseFormProps> = ({
  open,
  onAdd,
  varsList,
  initialValues,
  onCancel,
}) => {
  const [description, setDescription] = useState(initialValues?.description || '');
  const [vars, setVars] = useState(initialValues?.vars || {});
  const [asserts, setAsserts] = useState(initialValues?.assert || []);
  const [assertsFormKey, setAssertsFormKey] = useState(0);

  React.useEffect(() => {
    if (initialValues) {
      setDescription(initialValues.description || '');
      setVars(initialValues.vars || {});
      setAsserts(initialValues.assert || []);
    } else {
      setDescription('');
      setVars({});
      setAsserts([]);
    }
  }, [initialValues]);

  const handleAdd = (close: boolean) => {
    onAdd(
      {
        description,
        vars,
        assert: asserts,
      },
      close,
    );
    if (close) {
      onCancel();
    }
    setDescription('');
    setVars({});
    setAsserts([]);
    setAssertsFormKey((prevKey) => prevKey + 1);
  };

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="md">
      <DialogTitle>{initialValues ? 'Edit Test Case' : 'Add Test Case'}</DialogTitle>
      <DialogContent>
        <Box>
          {/*
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            margin="normal"
          />
          */}
          <VarsForm
            onAdd={(vars) => setVars(vars)}
            varsList={varsList}
            initialValues={initialValues?.vars as Record<string, string>}
          />
          <AssertsForm
            key={assertsFormKey}
            onAdd={(asserts) => setAsserts(asserts)}
            initialValues={
              ((initialValues?.assert || []).filter(
                (item) => item.type !== 'assert-set',
              ) as Assertion[]) || []
            }
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleAdd.bind(this, true)} color="primary" variant="contained">
          {initialValues ? 'Update Test Case' : 'Add Test Case'}
        </Button>
        {!initialValues && (
          <Button onClick={handleAdd.bind(this, false)} color="primary" variant="contained">
            Add Another
          </Button>
        )}
        <Button onClick={onCancel} color="secondary">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TestCaseForm;
