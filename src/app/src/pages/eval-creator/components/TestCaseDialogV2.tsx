import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Tab,
  Tabs,
  Typography,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Chip,
  Stack,
  Alert,
  Tooltip,
  Fade,
  Paper,
  Divider,
  TextField,
  alpha,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CircularProgress from '@mui/material/CircularProgress';
import VariablesIcon from '@mui/icons-material/Code';
import AssertionIcon from '@mui/icons-material/FactCheck';
import PreviewIcon from '@mui/icons-material/Visibility';
import SaveIcon from '@mui/icons-material/Save';
import SaveAsIcon from '@mui/icons-material/SaveAs';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import type { Assertion, TestCase } from '@promptfoo/types';
import VarsFormV2 from './VarsFormV2';
import AssertsFormV2 from './AssertsFormV2';
import TestCasePreview from './TestCasePreview';
import GenerateAssertionsDialog from './GenerateAssertionsDialog';
import { useErrorNotification } from '../hooks/useErrorNotification';

interface TestCaseDialogV2Props {
  open: boolean;
  onClose: () => void;
  onSave: (testCase: TestCase, shouldClose: boolean) => void;
  varsList: string[];
  initialValues?: TestCase;
  prompts?: string[];
  existingTestCases?: TestCase[];
}

type TabValue = 'variables' | 'assertions' | 'preview';

const TestCaseDialogV2: React.FC<TestCaseDialogV2Props> = ({
  open,
  onClose,
  onSave,
  varsList,
  initialValues,
  prompts = [],
  existingTestCases = [],
}) => {
  const theme = useTheme();
  const { showError } = useErrorNotification();
  const [activeTab, setActiveTab] = useState<TabValue>('variables');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [vars, setVars] = useState<Record<string, string>>(initialValues?.vars || {});
  const [asserts, setAsserts] = useState<Assertion[]>(initialValues?.assert || []);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showGenerateAssertionsDialog, setShowGenerateAssertionsDialog] = useState(false);

  // Reset state when dialog opens/closes or initialValues change
  useEffect(() => {
    if (open) {
      setDescription(initialValues?.description || '');
      setVars(initialValues?.vars || {});
      setAsserts(initialValues?.assert || []);
      setActiveTab('variables');
      setHasUnsavedChanges(false);
      setValidationErrors({});
    }
  }, [open, initialValues]);

  // Track unsaved changes
  useEffect(() => {
    if (open && initialValues) {
      const hasChanges =
        description !== (initialValues.description || '') ||
        JSON.stringify(vars) !== JSON.stringify(initialValues.vars || {}) ||
        JSON.stringify(asserts) !== JSON.stringify(initialValues.assert || []);
      setHasUnsavedChanges(hasChanges);
    }
  }, [description, vars, asserts, initialValues, open]);

  const handleVarsChange = (newVars: Record<string, string>) => {
    setVars(newVars);
    // Clear validation errors for variables that now have values
    const newErrors = { ...validationErrors };
    Object.keys(newVars).forEach((key) => {
      if (newVars[key]) {
        delete newErrors[`var_${key}`];
      }
    });
    setValidationErrors(newErrors);
  };

  const validateTestCase = (): boolean => {
    const errors: Record<string, string> = {};

    // Check for empty required variables
    varsList.forEach((varName) => {
      if (!vars[varName] || vars[varName].trim() === '') {
        errors[`var_${varName}`] = `${varName} is required`;
      }
    });

    // Check for at least one assertion (warning, not error)
    if (asserts.length === 0) {
      errors.assertions = 'Consider adding at least one assertion';
    }

    setValidationErrors(errors);
    return Object.keys(errors).filter((key) => !key.startsWith('assertions')).length === 0;
  };

  const handleSave = (shouldClose: boolean) => {
    if (!validateTestCase()) {
      showError('Please fill in all required fields', 'Validation Error');
      setActiveTab('variables');
      return;
    }

    const testCase: TestCase = {
      ...(description && { description }),
      vars,
      ...(asserts.length > 0 && { assert: asserts }),
    };

    onSave(testCase, shouldClose);
    if (shouldClose) {
      onClose();
    } else {
      // Reset for next test case
      setDescription('');
      setVars(Object.fromEntries(varsList.map((v) => [v, ''])));
      setAsserts([]);
      setActiveTab('variables');
      setHasUnsavedChanges(false);
    }
  };

  const handleGenerateAssertions = () => {
    if (!prompts.length) {
      showError('Please add prompts first to generate assertions', 'Missing Prompts');
      return;
    }

    if (varsList.length > 0 && Object.keys(vars).some((v) => !vars[v])) {
      showError('Please fill in all variables before generating assertions', 'Missing Variables');
      setActiveTab('variables');
      return;
    }

    setShowGenerateAssertionsDialog(true);
  };

  const handleAssertionsGenerated = (newAssertions: Assertion[]) => {
    setAsserts([...asserts, ...newAssertions]);
    setActiveTab('assertions');
    setShowGenerateAssertionsDialog(false);
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const getTabIcon = (tab: TabValue) => {
    switch (tab) {
      case 'variables':
        return <VariablesIcon sx={{ fontSize: 18, mr: 0.5 }} />;
      case 'assertions':
        return <AssertionIcon sx={{ fontSize: 18, mr: 0.5 }} />;
      case 'preview':
        return <PreviewIcon sx={{ fontSize: 18, mr: 0.5 }} />;
    }
  };

  const getTabLabel = (tab: TabValue) => {
    const hasErrors =
      tab === 'variables' && Object.keys(validationErrors).some((k) => k.startsWith('var_'));
    const isComplete =
      tab === 'variables'
        ? Object.keys(vars).every((k) => vars[k])
        : tab === 'assertions'
          ? asserts.length > 0
          : false;

    return (
      <Box display="flex" alignItems="center" gap={0.5}>
        {getTabIcon(tab)}
        <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
        {hasErrors && <WarningIcon sx={{ fontSize: 16, color: 'error.main', ml: 0.5 }} />}
        {isComplete && !hasErrors && (
          <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main', ml: 0.5 }} />
        )}
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          maxHeight: '90vh',
        },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h5" fontWeight={600}>
              {initialValues ? 'Edit Test Case' : 'Create Test Case'}
            </Typography>
            {hasUnsavedChanges && (
              <Chip
                label="Unsaved changes"
                size="small"
                color="warning"
                variant="outlined"
                sx={{ height: 24 }}
              />
            )}
          </Stack>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Optional description field */}
        <Box mt={2}>
          <TextField
            fullWidth
            size="small"
            placeholder="Test case description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: alpha(theme.palette.primary.main, 0.02),
              },
            }}
            InputProps={{
              startAdornment: (
                <LightbulbIcon sx={{ fontSize: 20, color: 'action.active', mr: 1 }} />
              ),
            }}
          />
        </Box>
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          variant="fullWidth"
        >
          <Tab value="variables" label={getTabLabel('variables')} />
          <Tab value="assertions" label={getTabLabel('assertions')} />
          <Tab value="preview" label={getTabLabel('preview')} />
        </Tabs>
      </Box>

      <DialogContent sx={{ p: 3, height: '50vh', overflowY: 'auto' }}>
        <Fade in={activeTab === 'variables'} unmountOnExit>
          <Box sx={{ display: activeTab === 'variables' ? 'block' : 'none' }}>
            <VarsFormV2
              vars={vars}
              varsList={varsList}
              onChange={handleVarsChange}
              validationErrors={validationErrors}
              existingTestCases={existingTestCases}
            />
          </Box>
        </Fade>

        <Fade in={activeTab === 'assertions'} unmountOnExit>
          <Box sx={{ display: activeTab === 'assertions' ? 'block' : 'none' }}>
            <AssertsFormV2 asserts={asserts} onChange={setAsserts} vars={vars} prompts={prompts} />
          </Box>
        </Fade>

        <Fade in={activeTab === 'preview'} unmountOnExit>
          <Box sx={{ display: activeTab === 'preview' ? 'block' : 'none' }}>
            <TestCasePreview testCase={{ description, vars, assert: asserts }} prompts={prompts} />
          </Box>
        </Fade>
      </DialogContent>

      <Divider />

      <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack direction="row" spacing={1}>
          {varsList.length > 0 && (
            <Tooltip title="Generate assertions with AI">
              <Button
                startIcon={<AutoFixHighIcon />}
                variant="outlined"
                size="small"
                onClick={handleGenerateAssertions}
                disabled={varsList.length === 0}
                sx={{ textTransform: 'none' }}
              >
                AI Generate
              </Button>
            </Tooltip>
          )}
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button onClick={handleClose} variant="outlined" sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          {!initialValues && (
            <Button
              onClick={() => handleSave(false)}
              variant="outlined"
              color="primary"
              startIcon={<SaveAsIcon />}
              sx={{ textTransform: 'none' }}
            >
              Save & Add Another
            </Button>
          )}
          <Button
            onClick={() => handleSave(true)}
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
            sx={{ textTransform: 'none' }}
          >
            {initialValues ? 'Update' : 'Save'} Test Case
          </Button>
        </Stack>
      </Box>

      {/* Generate Assertions Dialog */}
      <GenerateAssertionsDialog
        open={showGenerateAssertionsDialog}
        onClose={() => setShowGenerateAssertionsDialog(false)}
        onAssertionsGenerated={handleAssertionsGenerated}
        prompts={prompts}
        testCase={{ description, vars }}
        existingAssertions={asserts}
      />
    </Dialog>
  );
};

export default TestCaseDialogV2;
