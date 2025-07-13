import React, { useCallback, Suspense, useTransition, useMemo, lazy } from 'react';
import { useStore } from '@app/stores/evalConfig';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import { testCaseFromCsvRow } from '@promptfoo/csv';
import type { CsvRow, TestCase, ProviderOptions } from '@promptfoo/types';
import type { GenerationBatch } from '../types';
import { useGenerationBatches } from '../hooks/useGenerationBatches';
import { usePromptNormalization } from '../hooks/usePromptNormalization';
import { useTestCasesReducer } from '../hooks/useTestCasesReducer';
import { hasGenerationMetadata } from '../utils/typeGuards';
import ErrorBoundary from './ErrorBoundary';
import TestCasesTable from './TestCasesTable';
import TestCasesActions from './TestCasesActions';

// Lazy load heavy dialogs
const GenerateTestCasesDialog = lazy(() => import('./GenerateTestCasesDialog'));
const TestCaseDialog = lazy(() => import('./TestCaseDialog'));

interface TestCasesSectionProps {
  varsList: string[];
}

const EXAMPLE_TEST_CASE: TestCase = {
  description: 'Fun animal adventure story',
  vars: {
    animal: 'penguin',
    location: 'tropical island',
  },
  assert: [
    {
      type: 'contains-any',
      value: ['penguin', 'adventure', 'tropical', 'island'],
    },
    {
      type: 'llm-rubric',
      value:
        'Is this a fun, child-friendly story featuring a penguin on a tropical island adventure?\\n\\nCriteria:\\n1. Does it mention a penguin as the main character?\\n2. Does the story take place on a tropical island?\\n3. Is it entertaining and appropriate for children?\\n4. Does it have a sense of adventure?',
    },
  ],
};

// Loading component for Suspense
const DialogLoader = () => (
  <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
    <CircularProgress />
  </Box>
);

const TestCasesSectionV2: React.FC<TestCasesSectionProps> = ({ varsList }) => {
  const { config, updateConfig } = useStore();
  const [isPending, startTransition] = useTransition();
  
  // Memoize expensive computations
  const testCases = useMemo(() => (config.tests || []) as TestCase[], [config.tests]);
  const providers = useMemo(() => (config.providers || []) as ProviderOptions[], [config.providers]);
  const prompts = useMemo(() => config.prompts || [], [config.prompts]);
  
  // Use reducer for complex state management
  const { state, actions } = useTestCasesReducer(testCases);
  
  // Dialog states
  const [testCaseDialogOpen, setTestCaseDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = React.useState(false);
  
  // Custom hooks
  const { batches: generationBatches, addBatch } = useGenerationBatches();
  const normalizedPrompts = usePromptNormalization(prompts);

  // Sync reducer state with store
  React.useEffect(() => {
    if (state.testCases !== testCases) {
      startTransition(() => {
        updateConfig({ tests: state.testCases });
      });
    }
  }, [state.testCases, testCases, updateConfig]);

  const handleAddTestCase = useCallback(
    (testCase: TestCase, shouldClose: boolean) => {
      if (state.editingIndex === null) {
        actions.addTestCase(testCase);
      } else {
        actions.updateTestCase(state.editingIndex, testCase);
      }

      if (shouldClose) {
        setTestCaseDialogOpen(false);
      }
    },
    [state.editingIndex, actions],
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
            // Use dynamic import with Suspense
            const { parse: parseCsv } = await import('csv-parse/sync');
            const rows: CsvRow[] = parseCsv(text, { columns: true });
            const newTestCases: TestCase[] = rows.map((row) => testCaseFromCsvRow(row) as TestCase);
            
            startTransition(() => {
              actions.addMultipleTestCases(newTestCases);
            });
          }
        };
        reader.readAsText(file);
      }
    },
    [actions],
  );

  const handleRemoveTestCase = useCallback(
    (index: number) => {
      actions.setDeleteIndex(index);
      setDeleteDialogOpen(true);
    },
    [actions],
  );

  const confirmDeleteTestCase = useCallback(() => {
    if (state.deleteIndex !== null) {
      startTransition(() => {
        actions.deleteTestCase(state.deleteIndex);
      });
    }
    setDeleteDialogOpen(false);
  }, [state.deleteIndex, actions]);

  const cancelDeleteTestCase = useCallback(() => {
    actions.setDeleteIndex(null);
    setDeleteDialogOpen(false);
  }, [actions]);

  const handleDuplicateTestCase = useCallback(
    (index: number) => {
      startTransition(() => {
        actions.duplicateTestCase(index);
      });
    },
    [actions],
  );

  const handleGeneratedTestCases = useCallback(
    (newTestCases: TestCase[]) => {
      // Extract generation batch from the first test case if present
      if (newTestCases.length > 0) {
        const firstTestCase = newTestCases[0];
        const batchInfo = (firstTestCase.metadata as any)?._generationBatch;
        if (batchInfo) {
          addBatch(batchInfo);
          delete (firstTestCase.metadata as any)._generationBatch;
        }
      }
      
      startTransition(() => {
        actions.addMultipleTestCases(newTestCases);
      });
      setGenerateDialogOpen(false);
    },
    [actions, addBatch],
  );

  const handleAddExample = useCallback(() => {
    startTransition(() => {
      actions.addTestCase(EXAMPLE_TEST_CASE);
    });
  }, [actions]);

  const handleEditTestCase = useCallback((index: number) => {
    actions.setEditingIndex(index);
    setTestCaseDialogOpen(true);
  }, [actions]);

  return (
    <ErrorBoundary>
      <TestCasesActions
        hasTestCases={state.testCases.length > 0}
        hasPrompts={normalizedPrompts.length > 0}
        onAddExample={handleAddExample}
        onGenerate={() => setGenerateDialogOpen(true)}
        onAdd={() => setTestCaseDialogOpen(true)}
        onUpload={handleAddTestCaseFromFile}
      />

      <TestCasesTable
        testCases={state.testCases}
        generationBatches={generationBatches}
        onEdit={handleEditTestCase}
        onDuplicate={handleDuplicateTestCase}
        onDelete={handleRemoveTestCase}
      />

      {/* Lazy loaded dialogs with Suspense */}
      <Suspense fallback={<DialogLoader />}>
        <TestCaseDialog
          open={testCaseDialogOpen}
          onAdd={handleAddTestCase}
          varsList={varsList}
          initialValues={state.editingIndex === null ? undefined : state.testCases[state.editingIndex]}
          onCancel={() => {
            actions.setEditingIndex(null);
            setTestCaseDialogOpen(false);
          }}
        />
      </Suspense>

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
          <Button onClick={confirmDeleteTestCase} color="error" autoFocus disabled={isPending}>
            {isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Generate Test Cases Dialog */}
      <Suspense fallback={<DialogLoader />}>
        <GenerateTestCasesDialog
          open={generateDialogOpen}
          onClose={() => setGenerateDialogOpen(false)}
          prompts={normalizedPrompts}
          existingTests={state.testCases}
          providers={providers}
          onGenerated={handleGeneratedTestCases}
        />
      </Suspense>
    </ErrorBoundary>
  );
};

export default TestCasesSectionV2;