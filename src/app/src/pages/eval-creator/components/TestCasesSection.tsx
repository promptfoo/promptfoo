import React, { useCallback } from 'react';
import { useStore } from '@app/stores/evalConfig';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import Publish from '@mui/icons-material/Publish';
import SearchIcon from '@mui/icons-material/Search';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { callApi } from '@app/utils/api';
import { testCaseFromCsvRow } from '@promptfoo/csv';
import type { CsvRow, TestCase, ProviderOptions } from '@promptfoo/types';
import { generateTestCaseWithAssertions } from '@app/utils/testCaseGeneration';
import { usePromptNormalization } from '../hooks/usePromptNormalization';
import ErrorBoundary from './ErrorBoundary';
import GenerateTestCasesDialog from './GenerateTestCasesDialog';
import TestCaseDialogV2 from './TestCaseDialogV2';
import TestCasesTable from './TestCasesTable';
import TestCasesCardView from './TestCasesCardView';
import { VirtualizedTestCasesTable } from './VirtualizedTestCasesTable';
import { TestCasesHelp } from './HelpText';
import NextStepsGuide from './NextStepsGuide';

interface TestCasesSectionProps {
  varsList: string[];
}

const TestCasesSection: React.FC<TestCasesSectionProps> = ({ varsList }) => {
  const { config, updateConfig } = useStore();
  const testCases = (config.tests || []) as TestCase[];
  const providers = (config.providers || []) as ProviderOptions[];
  const prompts = config.prompts || [];
  const setTestCases = useCallback(
    (cases: TestCase[]) => updateConfig({ tests: cases }),
    [updateConfig],
  );

  // Theme and responsive
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const _isTablet = useMediaQuery(theme.breakpoints.down('md'));

  // Dialog states
  const [editingTestCaseIndex, setEditingTestCaseIndex] = React.useState<number | null>(null);
  const [testCaseDialogOpen, setTestCaseDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [testCaseToDelete, setTestCaseToDelete] = React.useState<number | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = React.useState(false);
  const [clearAllDialogOpen, setClearAllDialogOpen] = React.useState(false);
  const [isGeneratingOne, setIsGeneratingOne] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [viewMode, setViewMode] = React.useState<'table' | 'card'>('table');
  const [multipleGenerationProgress, setMultipleGenerationProgress] = React.useState<{
    isGenerating: boolean;
    current: number;
    total: number;
  }>({ isGenerating: false, current: 0, total: 0 });

  // Custom hooks
  const normalizedPrompts = usePromptNormalization(prompts);

  // Auto-switch to card view on mobile
  React.useEffect(() => {
    if (isMobile) {
      setViewMode('card');
    }
  }, [isMobile]);

  // Filter test cases based on search term
  const filteredTestCases = React.useMemo(() => {
    if (!searchTerm) {
      return testCases;
    }

    const lowerSearchTerm = searchTerm.toLowerCase();
    return testCases.filter((testCase) => {
      // Search in variable values
      if (testCase.vars) {
        const varValues = Object.values(testCase.vars).join(' ').toLowerCase();
        if (varValues.includes(lowerSearchTerm)) {
          return true;
        }
      }

      // Search in assertion values
      if (testCase.assert) {
        const assertValues = testCase.assert
          .map((a) => JSON.stringify(a))
          .join(' ')
          .toLowerCase();
        if (assertValues.includes(lowerSearchTerm)) {
          return true;
        }
      }

      return false;
    });
  }, [testCases, searchTerm]);

  const handleAddTestCase = useCallback(
    (testCase: TestCase, shouldClose: boolean) => {
      if (editingTestCaseIndex === null) {
        setTestCases([...testCases, testCase]);
      } else {
        const updatedTestCases = testCases.map((tc, index) =>
          index === editingTestCaseIndex ? testCase : tc,
        );
        setTestCases(updatedTestCases);
        setEditingTestCaseIndex(null);
      }

      if (shouldClose) {
        setTestCaseDialogOpen(false);
      }
    },
    [editingTestCaseIndex, testCases, setTestCases],
  );

  const handleAddTestCaseFromFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      event.stopPropagation();
      event.preventDefault();

      const file = event.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const text = e.target?.result?.toString();
          if (text) {
            const { parse: parseCsv } = await import('csv-parse/sync');
            const rows: CsvRow[] = parseCsv(text, { columns: true });
            const newTestCases: TestCase[] = rows.map((row) => testCaseFromCsvRow(row) as TestCase);
            setTestCases([...testCases, ...newTestCases]);
          }
        };
        reader.readAsText(file);
      }
    },
    [testCases, setTestCases],
  );

  const handleRemoveTestCase = useCallback((index: number) => {
    setTestCaseToDelete(index);
    setDeleteDialogOpen(true);
  }, []);

  const confirmDeleteTestCase = () => {
    if (testCaseToDelete !== null) {
      setTestCases(testCases.filter((_, i) => i !== testCaseToDelete));
      setTestCaseToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  const cancelDeleteTestCase = () => {
    setTestCaseToDelete(null);
    setDeleteDialogOpen(false);
  };

  const handleClearAll = () => {
    setClearAllDialogOpen(true);
  };

  const confirmClearAll = () => {
    setTestCases([]);
    setClearAllDialogOpen(false);
  };

  const cancelClearAll = () => {
    setClearAllDialogOpen(false);
  };

  const handleDuplicateTestCase = useCallback(
    (index: number) => {
      const duplicatedTestCase = JSON.parse(JSON.stringify(testCases[index]));
      setTestCases([...testCases, duplicatedTestCase]);
    },
    [testCases, setTestCases],
  );

  const handleUpdateVariable = useCallback(
    (testCaseIndex: number, varName: string, newValue: string) => {
      const updatedTestCases = [...testCases];
      if (updatedTestCases[testCaseIndex]) {
        updatedTestCases[testCaseIndex] = {
          ...updatedTestCases[testCaseIndex],
          vars: {
            ...updatedTestCases[testCaseIndex].vars,
            [varName]: newValue,
          },
        };
        setTestCases(updatedTestCases);
      }
    },
    [testCases, setTestCases],
  );

  const handleGeneratedTestCases = useCallback(
    (newTestCases: TestCase[]) => {
      setTestCases([...testCases, ...newTestCases]);
      setGenerateDialogOpen(false);
    },
    [testCases, setTestCases],
  );

  const handleGenerationStarted = useCallback(
    (jobId: string, totalCount: number) => {
      setMultipleGenerationProgress({ isGenerating: true, current: 0, total: totalCount });

      // Poll for job completion
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await callApi(`/generate/job/${jobId}`);
          if (!statusResponse.ok) {
            clearInterval(pollInterval);
            setMultipleGenerationProgress({ isGenerating: false, current: 0, total: 0 });
            return;
          }

          const jobStatus = await statusResponse.json();

          if (jobStatus.status === 'complete') {
            clearInterval(pollInterval);

            const { results } = jobStatus.result || {};
            if (results && Array.isArray(results)) {
              // Create test cases
              const newTestCases: TestCase[] = results.map((varMapping) => ({
                vars: varMapping,
              }));

              // Get stored options
              const storedOptions = localStorage.getItem(`generation-job-${jobId}`);
              if (storedOptions) {
                const { includeAssertions, provider, prompts } = JSON.parse(storedOptions);

                // If assertions are requested, generate them for each test case
                if (includeAssertions) {
                  for (let i = 0; i < newTestCases.length; i++) {
                    try {
                      const assertionResponse = await callApi('/generate/assertions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          prompts: prompts.map((p: string) => ({ raw: p })),
                          tests: [newTestCases[i]],
                          options: {
                            type: 'llm-rubric',
                            numQuestions: 2,
                            provider,
                          },
                        }),
                      });

                      if (assertionResponse.ok) {
                        const { results: assertions } = await assertionResponse.json();
                        if (assertions && assertions.length > 0) {
                          newTestCases[i].assert = assertions;
                        }
                      }
                    } catch (_err) {
                      // Continue if assertion generation fails
                    }
                  }
                }

                localStorage.removeItem(`generation-job-${jobId}`);
              }

              setTestCases([...testCases, ...newTestCases]);
            }

            setMultipleGenerationProgress({ isGenerating: false, current: 0, total: 0 });
          } else if (jobStatus.status === 'error' || jobStatus.status === 'failed') {
            clearInterval(pollInterval);
            setMultipleGenerationProgress({ isGenerating: false, current: 0, total: 0 });
          } else {
            // Update progress
            setMultipleGenerationProgress({
              isGenerating: true,
              current: jobStatus.progress || 0,
              total: jobStatus.total || totalCount,
            });
          }
        } catch (_err) {
          clearInterval(pollInterval);
          setMultipleGenerationProgress({ isGenerating: false, current: 0, total: 0 });
        }
      }, 1000);
    },
    [testCases, setTestCases],
  );

  const handleEditTestCase = useCallback((index: number) => {
    setEditingTestCaseIndex(index);
    setTestCaseDialogOpen(true);
  }, []);

  const handleQuickGenerate = useCallback(async () => {
    if (normalizedPrompts.length === 0) {
      return;
    }

    setIsGeneratingOne(true);
    try {
      const newTestCase = await generateTestCaseWithAssertions({
        prompts: normalizedPrompts,
        existingTests: testCases,
      });

      setTestCases([...testCases, newTestCase]);
    } catch (_error) {
      // Error handling - could show a toast or notification here
    } finally {
      setIsGeneratingOne(false);
    }
  }, [normalizedPrompts, testCases, setTestCases]);

  const fileInputId = React.useId();

  return (
    <ErrorBoundary>
      <TestCasesHelp />
      <NextStepsGuide currentSection="tests" />

      {/* Actions bar */}
      <Stack direction="row" spacing={2} mb={2} justifyContent="space-between">
        <Typography variant="h5">Test Cases</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <label htmlFor={fileInputId}>
            <Tooltip title="Upload test cases from CSV file">
              <span>
                <IconButton component="span" aria-label="Upload test cases from CSV">
                  <Publish />
                </IconButton>
                <input
                  id={fileInputId}
                  type="file"
                  accept=".csv"
                  onChange={handleAddTestCaseFromFile}
                  style={{ display: 'none' }}
                  aria-label="Upload CSV file with test cases"
                />
              </span>
            </Tooltip>
          </label>

          {normalizedPrompts.length > 0 && (
            <>
              <Tooltip title="Generate one test case with 2 LLM-rubric assertions">
                <span>
                  <Button
                    color="primary"
                    onClick={handleQuickGenerate}
                    variant="outlined"
                    startIcon={<AutoAwesome />}
                    size="small"
                    disabled={isGeneratingOne}
                  >
                    {isGeneratingOne ? 'Generating...' : 'Generate One'}
                  </Button>
                </span>
              </Tooltip>

              <Button
                color="primary"
                onClick={() => setGenerateDialogOpen(true)}
                variant="outlined"
                startIcon={<AutoAwesome />}
                size="small"
              >
                Generate Multiple
              </Button>
            </>
          )}

          <Button
            color="primary"
            onClick={() => setTestCaseDialogOpen(true)}
            variant="contained"
            size="small"
          >
            Add Test Case
          </Button>

          {testCases.length > 0 && (
            <Button
              color="error"
              onClick={handleClearAll}
              variant="text"
              startIcon={<DeleteOutline />}
              sx={{ ml: 1 }}
              size="small"
            >
              Clear All
            </Button>
          )}
        </Stack>
      </Stack>

      {/* Generation Progress */}
      {multipleGenerationProgress.isGenerating && (
        <Stack spacing={1} sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Generating {multipleGenerationProgress.total} test cases... (
            {multipleGenerationProgress.current}/{multipleGenerationProgress.total})
          </Typography>
          <LinearProgress
            variant="determinate"
            value={(multipleGenerationProgress.current / multipleGenerationProgress.total) * 100}
          />
        </Stack>
      )}

      {/* Search box and view toggle */}
      {testCases.length > 0 && (
        <Stack direction="row" spacing={2} sx={{ mb: 2 }} alignItems="center">
          {testCases.length > 5 && (
            <TextField
              fullWidth
              size="small"
              placeholder="Search test cases..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          )}
          {!isMobile && testCases.length > 0 && (
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, newMode) => {
                if (newMode !== null) {
                  setViewMode(newMode);
                }
              }}
              size="small"
              sx={{ flexShrink: 0 }}
            >
              <ToggleButton value="table" aria-label="table view">
                <Tooltip title="Table view">
                  <ViewListIcon />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="card" aria-label="card view">
                <Tooltip title="Card view">
                  <ViewModuleIcon />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          )}
        </Stack>
      )}

      {/* Test cases display - switch between table/card view */}
      {searchTerm && filteredTestCases.length === 0 ? (
        <Typography color="textSecondary" align="center" sx={{ py: 4 }}>
          No test cases found matching "{searchTerm}"
        </Typography>
      ) : filteredTestCases.length === 0 ? (
        <Typography color="textSecondary" align="center" sx={{ py: 4 }}>
          No test cases yet. Click "Generate" or "Add Test Case" to get started.
        </Typography>
      ) : viewMode === 'card' || (isMobile && filteredTestCases.length <= 50) ? (
        <TestCasesCardView
          testCases={filteredTestCases}
          onEdit={handleEditTestCase}
          onDuplicate={handleDuplicateTestCase}
          onDelete={handleRemoveTestCase}
          onUpdateVariable={handleUpdateVariable}
        />
      ) : filteredTestCases.length > 50 ? (
        <VirtualizedTestCasesTable
          testCases={filteredTestCases}
          onEdit={handleEditTestCase}
          onDuplicate={handleDuplicateTestCase}
          onDelete={handleRemoveTestCase}
        />
      ) : (
        <TestCasesTable
          testCases={filteredTestCases}
          onEdit={handleEditTestCase}
          onDuplicate={handleDuplicateTestCase}
          onDelete={handleRemoveTestCase}
          onUpdateVariable={handleUpdateVariable}
        />
      )}

      <TestCaseDialogV2
        open={testCaseDialogOpen}
        onClose={() => {
          setEditingTestCaseIndex(null);
          setTestCaseDialogOpen(false);
        }}
        onSave={handleAddTestCase}
        varsList={varsList}
        initialValues={editingTestCaseIndex === null ? undefined : testCases[editingTestCaseIndex]}
        prompts={normalizedPrompts}
        existingTestCases={testCases}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={cancelDeleteTestCase}
        aria-labelledby="delete-test-case-dialog-title"
      >
        <DialogTitle id="delete-test-case-dialog-title">Delete Test Case</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this test case? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelDeleteTestCase} color="primary">
            Cancel
          </Button>
          <Button onClick={confirmDeleteTestCase} color="error" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Generate Test Cases Dialog */}
      <GenerateTestCasesDialog
        open={generateDialogOpen}
        onClose={() => setGenerateDialogOpen(false)}
        prompts={normalizedPrompts}
        existingTests={testCases}
        providers={providers}
        onGenerated={handleGeneratedTestCases}
        onGenerationStarted={handleGenerationStarted}
      />

      {/* Clear All Confirmation Dialog */}
      <Dialog
        open={clearAllDialogOpen}
        onClose={cancelClearAll}
        aria-labelledby="clear-all-dialog-title"
      >
        <DialogTitle id="clear-all-dialog-title">Clear All Test Cases</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to clear all test cases? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelClearAll} color="primary">
            Cancel
          </Button>
          <Button onClick={confirmClearAll} color="error" autoFocus>
            Clear All
          </Button>
        </DialogActions>
      </Dialog>
    </ErrorBoundary>
  );
};

export default React.memo(TestCasesSection);
