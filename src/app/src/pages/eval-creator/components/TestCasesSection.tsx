import React, { useCallback } from 'react';
import { useStore } from '@app/stores/evalConfig';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { testCaseFromCsvRow } from '@promptfoo/csv';
import type { CsvRow, TestCase, ProviderOptions } from '@promptfoo/types';
import type { GenerationMetadata, GenerationBatch } from '../types';
import { useGenerationBatches } from '../hooks/useGenerationBatches';
import { usePromptNormalization } from '../hooks/usePromptNormalization';
import { hasGenerationMetadata } from '../utils/typeGuards';
import ErrorBoundary from './ErrorBoundary';
import GenerateTestCasesDialog from './GenerateTestCasesDialog';
import TestCaseDialog from './TestCaseDialog';
import TestCasesTable from './TestCasesTable';
import TestCasesActions from './TestCasesActions';

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
        'Is this a fun, child-friendly story featuring a penguin on a tropical island adventure?\n\nCriteria:\n1. Does it mention a penguin as the main character?\n2. Does the story take place on a tropical island?\n3. Is it entertaining and appropriate for children?\n4. Does it have a sense of adventure?',
    },
  ],
};

const TestCasesSection: React.FC<TestCasesSectionProps> = ({ varsList }) => {
  const { config, updateConfig } = useStore();
  const testCases = (config.tests || []) as TestCase[];
  const providers = (config.providers || []) as ProviderOptions[];
  const prompts = config.prompts || [];
  const setTestCases = useCallback(
    (cases: TestCase[]) => updateConfig({ tests: cases }),
    [updateConfig],
  );

  // Dialog states
  const [editingTestCaseIndex, setEditingTestCaseIndex] = React.useState<number | null>(null);
  const [testCaseDialogOpen, setTestCaseDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [testCaseToDelete, setTestCaseToDelete] = React.useState<number | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = React.useState(false);

  // Custom hooks
  const { batches: generationBatches, addBatch } = useGenerationBatches();
  const normalizedPrompts = usePromptNormalization(prompts);

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

  const handleDuplicateTestCase = useCallback(
    (index: number) => {
      const duplicatedTestCase = JSON.parse(JSON.stringify(testCases[index]));
      // Update generation metadata for duplicated test case
      if (hasGenerationMetadata(duplicatedTestCase.metadata)) {
        const metadata = duplicatedTestCase.metadata;
        if (metadata.generationBatchId) {
          duplicatedTestCase.metadata = {
            ...duplicatedTestCase.metadata,
            generationBatchId: undefined, // Remove batch reference
            duplicatedFrom: 'generated',
            duplicatedAt: new Date().toISOString(),
          } as GenerationMetadata;
        }
      }
      setTestCases([...testCases, duplicatedTestCase]);
    },
    [testCases, setTestCases],
  );

  const handleGeneratedTestCases = useCallback(
    (newTestCases: TestCase[]) => {
      // Extract generation batch from the first test case if present
      if (newTestCases.length > 0) {
        const firstTestCase = newTestCases[0];
        const batchInfo = (firstTestCase.metadata as any)?._generationBatch;
        if (batchInfo) {
          // Store the batch information
          addBatch(batchInfo);
          // Remove the temporary batch info from the test case
          delete (firstTestCase.metadata as any)._generationBatch;
        }
      }

      setTestCases([...testCases, ...newTestCases]);
      setGenerateDialogOpen(false);
    },
    [testCases, setTestCases, addBatch],
  );

  const handleAddExample = useCallback(() => {
    setTestCases([...testCases, EXAMPLE_TEST_CASE]);
  }, [testCases, setTestCases]);

  const handleEditTestCase = useCallback((index: number) => {
    setEditingTestCaseIndex(index);
    setTestCaseDialogOpen(true);
  }, []);

  return (
    <ErrorBoundary>
      <TestCasesActions
        hasTestCases={testCases.length > 0}
        hasPrompts={normalizedPrompts.length > 0}
        onAddExample={handleAddExample}
        onGenerate={() => setGenerateDialogOpen(true)}
        onAdd={() => setTestCaseDialogOpen(true)}
        onUpload={handleAddTestCaseFromFile}
      />
      <TestCasesTable
        testCases={testCases}
        generationBatches={generationBatches}
        onEdit={handleEditTestCase}
        onDuplicate={handleDuplicateTestCase}
        onDelete={handleRemoveTestCase}
      />
      <TestCaseDialog
        open={testCaseDialogOpen}
        onAdd={handleAddTestCase}
        varsList={varsList}
        initialValues={editingTestCaseIndex === null ? undefined : testCases[editingTestCaseIndex]}
        onCancel={() => {
          setEditingTestCaseIndex(null);
          setTestCaseDialogOpen(false);
        }}
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
      />
    </ErrorBoundary>
  );
};

export default TestCasesSection;
