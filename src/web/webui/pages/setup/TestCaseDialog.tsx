import React, { useState } from 'react';
import {
  Button,
  TextField,
  Typography,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import VarsForm from './VarsForm';
import AssertsForm from './AssertsForm';
import type { TestCase } from '../../../../types';

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
    setDescription('');
    setVars({});
    setAsserts([]);
    setAssertsFormKey((prevKey) => prevKey + 1);
    if (close) {
      onCancel();
    }
  };

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="md">
      <DialogTitle>{initialValues ? 'Edit Test Case' : 'Add Test Case'}</DialogTitle>
      <DialogContent>
        <Box mt={4}>
          <Typography variant="h5" gutterBottom>
            Test Case
          </Typography>
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            margin="normal"
          />
          <VarsForm
            onAdd={(vars) => setVars(vars)}
            varsList={varsList}
            initialValues={initialValues?.vars}
          />
          <AssertsForm
            key={assertsFormKey}
            onAdd={(asserts) => setAsserts(asserts)}
            initialValues={initialValues?.assert}
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
