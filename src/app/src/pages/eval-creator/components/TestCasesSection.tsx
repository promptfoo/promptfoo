import React from 'react';

import { useStore } from '@app/stores/evalConfig';
import { useToast } from '@app/hooks/useToast';
import Copy from '@mui/icons-material/ContentCopy';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import Publish from '@mui/icons-material/Publish';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { testCaseFromCsvRow } from '@promptfoo/csv';
import TestCaseDialog from './TestCaseDialog';
import type { CsvRow, TestCase } from '@promptfoo/types';

interface TestCasesSectionProps {
  varsList: string[];
}

// Validation function for TestCase structure
function isValidTestCase(obj: any): obj is TestCase {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  // Check required structure - vars should be an object if present
  if (obj.vars && typeof obj.vars !== 'object') {
    return false;
  }

  // Check assert array if present
  if (obj.assert && !Array.isArray(obj.assert)) {
    return false;
  }

  // Check options if present
  if (obj.options && typeof obj.options !== 'object') {
    return false;
  }

  return true;
}

const TestCasesSection: React.FC<TestCasesSectionProps> = ({ varsList }) => {
  const { config, updateConfig } = useStore();
  const testCases = (config.tests || []) as TestCase[];
  const setTestCases = (cases: TestCase[]) => updateConfig({ tests: cases });
  const [editingTestCaseIndex, setEditingTestCaseIndex] = React.useState<number | null>(null);
  const [testCaseDialogOpen, setTestCaseDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [testCaseToDelete, setTestCaseToDelete] = React.useState<number | null>(null);
  const { showToast } = useToast();

  const handleAddTestCase = (testCase: TestCase, shouldClose: boolean) => {
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
  };

  const handleAddTestCaseFromFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    event.preventDefault();

    const file = event.target.files?.[0];
    if (file) {
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
      if (file.size > MAX_FILE_SIZE) {
        showToast('File size exceeds 50MB limit. Please use a smaller file.', 'error');
        event.target.value = ''; // Reset file input
        return;
      }

      const fileName = file.name.toLowerCase();
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result?.toString();
        if (!text || text.trim() === '') {
          showToast('The file appears to be empty. Please select a file with content.', 'error');
          event.target.value = ''; // Reset file input
          return;
        }

        try {
          let newTestCases: TestCase[] = [];

          if (fileName.endsWith('.csv')) {
            // Handle CSV files
            const { parse: parseCsv } = await import('csv-parse/sync');
            const rows: CsvRow[] = parseCsv(text, { columns: true });
            newTestCases = rows.map((row) => testCaseFromCsvRow(row) as TestCase);
          } else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
            // Handle YAML files
            const yaml = await import('js-yaml');
            const parsedYaml = yaml.load(text);

            if (Array.isArray(parsedYaml)) {
              // Validate array of test cases
              const validTestCases = parsedYaml.filter(isValidTestCase);
              if (validTestCases.length === 0) {
                throw new Error(
                  'No valid test cases found in YAML file. Please ensure test cases have proper structure.',
                );
              }
              if (validTestCases.length < parsedYaml.length) {
                showToast(
                  `Warning: ${parsedYaml.length - validTestCases.length} invalid test cases were skipped.`,
                  'warning',
                );
              }
              newTestCases = validTestCases;
            } else if (parsedYaml && isValidTestCase(parsedYaml)) {
              // Single test case
              newTestCases = [parsedYaml];
            } else {
              throw new Error(
                'Invalid YAML format. Expected an array of test cases or a single test case object with valid structure.',
              );
            }
          } else {
            showToast(
              'Unsupported file type. Please upload a CSV (.csv) or YAML (.yaml, .yml) file.',
              'error',
            );
            event.target.value = ''; // Reset file input
            return;
          }

          if (newTestCases.length === 0) {
            showToast('No test cases found in the file.', 'warning');
            event.target.value = ''; // Reset file input
            return;
          }

          // Add description only for YAML files if missing
          if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
            newTestCases = newTestCases.map((tc, idx) => ({
              ...tc,
              description: tc.description || `Test Case #${testCases.length + idx + 1}`,
            }));
          }

          setTestCases([...testCases, ...newTestCases]);
          showToast(
            `Successfully imported ${newTestCases.length} test case${newTestCases.length === 1 ? '' : 's'}`,
            'success',
          );
        } catch (error) {
          console.error('Error parsing file:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          if (fileName.endsWith('.csv')) {
            showToast(
              'Failed to parse CSV file. Please ensure it has valid CSV format with headers.',
              'error',
            );
          } else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
            showToast(
              errorMessage.includes('Invalid YAML') || errorMessage.includes('No valid test cases')
                ? errorMessage
                : 'Failed to parse YAML file. Please ensure it contains valid YAML syntax.',
              'error',
            );
          }
        }

        // Reset file input
        event.target.value = '';
      };
      reader.readAsText(file);
    }
  };

  const handleRemoveTestCase = (event: React.MouseEvent, index: number) => {
    event.stopPropagation();
    setTestCaseToDelete(index);
    setDeleteDialogOpen(true);
  };

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

  const handleDuplicateTestCase = (event: React.MouseEvent, index: number) => {
    event.stopPropagation();
    const duplicatedTestCase = JSON.parse(JSON.stringify(testCases[index]));
    setTestCases([...testCases, duplicatedTestCase]);
  };

  return (
    <>
      <Stack direction="row" spacing={2} mb={2} justifyContent="space-between">
        <Typography variant="h5">Test Cases</Typography>
        <div>
          <label htmlFor={`file-input-add-test-case`}>
            <Tooltip title="Upload test cases from CSV or YAML">
              <span>
                <IconButton component="span">
                  <Publish />
                </IconButton>
                <input
                  id={`file-input-add-test-case`}
                  type="file"
                  accept=".csv,.yaml,.yml"
                  onChange={handleAddTestCaseFromFile}
                  style={{ display: 'none' }}
                />
              </span>
            </Tooltip>
          </label>
          {testCases.length === 0 && (
            <Button
              color="secondary"
              onClick={() => {
                const exampleTestCase: TestCase = {
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
                setTestCases([...testCases, exampleTestCase]);
              }}
              sx={{ mr: 1 }}
            >
              Add Example
            </Button>
          )}
          <Button color="primary" onClick={() => setTestCaseDialogOpen(true)} variant="contained">
            Add Test Case
          </Button>
        </div>
      </Stack>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Description</TableCell>
              <TableCell>Assertions</TableCell>
              <TableCell>Variables</TableCell>
              <TableCell align="right"></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {testCases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  No test cases added yet.
                </TableCell>
              </TableRow>
            ) : (
              testCases.map((testCase, index) => (
                <TableRow
                  key={index}
                  sx={{
                    '&:hover': {
                      backgroundColor: 'rgba(0, 0, 0, 0.04)',
                      cursor: 'pointer',
                    },
                  }}
                  onClick={() => {
                    setEditingTestCaseIndex(index);
                    setTestCaseDialogOpen(true);
                  }}
                >
                  <TableCell>
                    <Typography variant="body2">
                      {testCase.description || `Test Case #${index + 1}`}
                    </Typography>
                  </TableCell>
                  <TableCell>{testCase.assert?.length || 0} assertions</TableCell>
                  <TableCell>
                    {Object.entries(testCase.vars || {})
                      .map(([k, v]) => k + '=' + v)
                      .join(', ')}
                  </TableCell>
                  <TableCell align="right" sx={{ minWidth: 150 }}>
                    <IconButton
                      onClick={() => {
                        setEditingTestCaseIndex(index);
                        setTestCaseDialogOpen(true);
                      }}
                      size="small"
                    >
                      <Edit />
                    </IconButton>
                    <IconButton
                      onClick={(event) => handleDuplicateTestCase(event, index)}
                      size="small"
                    >
                      <Copy />
                    </IconButton>
                    <IconButton
                      onClick={(event) => handleRemoveTestCase(event, index)}
                      size="small"
                    >
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
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
    </>
  );
};

export default TestCasesSection;
