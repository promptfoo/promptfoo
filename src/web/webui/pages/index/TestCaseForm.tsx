import React, { useState } from 'react';
import { Button, TextField, Typography, Box, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import VarsForm from './VarsForm';
import AssertsForm from './AssertsForm';
import type { TestCase } from '../../../../types';

interface TestCaseFormProps {
  onAdd: (testCase: TestCase) => void;
  varsList: string[];
  initialValues?: TestCase;
  onCancel: () => void;
}

const TestCaseForm: React.FC<TestCaseFormProps> = ({ onAdd, varsList, initialValues, onCancel }) => {
  const [description, setDescription] = useState(initialValues?.description || '');
  const [vars, setVars] = useState(initialValues?.vars || {});
  const [asserts, setAsserts] = useState(initialValues?.assert || []);
  const [assertsFormKey, setAssertsFormKey] = useState(0);

  React.useEffect(() => {
    if (initialValues) {
      setDescription(initialValues.description);
      setVars(initialValues.vars);
      setAsserts(initialValues.assert);
    } else {
      setDescription('');
      setVars({});
      setAsserts([]);
    }
  }, [initialValues]);

  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    onCancel();
  };

  const handleAdd = (close: boolean) => {
    onAdd({
      description,
      vars,
      assert: asserts,
    });
    setDescription('');
    setVars({});
    setAsserts([]);
    setAssertsFormKey((prevKey) => prevKey + 1);
    if (close) {
      handleClose();
    }
  };

  return (
    <>
      <Button color="primary" onClick={handleOpen}>
        {initialValues ? 'Edit Test Case' : 'Add Test Case'}
      </Button>
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
        <DialogTitle>{initialValues ? 'Edit Test Case' : 'Add Test Case'}</DialogTitle>
        <DialogContent>
          <Box mt={4}>
            <Typography variant="h5" gutterBottom>Test Case</Typography>
            <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth margin="normal" />
            <VarsForm onAdd={(vars) => setVars(vars)} varsList={varsList} />
            <AssertsForm key={assertsFormKey} onAdd={(asserts) => setAsserts(asserts)} />
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
          <Button onClick={handleClose} color="secondary">
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TestCaseForm;
