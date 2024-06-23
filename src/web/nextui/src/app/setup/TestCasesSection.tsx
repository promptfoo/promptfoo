import React from 'react';

import Button from '@mui/material/Button';
import Copy from '@mui/icons-material/ContentCopy';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import IconButton from '@mui/material/IconButton';
import Publish from '@mui/icons-material/Publish';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import TestCaseDialog from './TestCaseDialog';
import { useStore } from '@/state/evalConfig';
import { testCaseFromCsvRow } from '../../../../../csv';

import type { CsvRow, TestCase } from '@/../../../types';

interface TestCasesSectionProps {
  varsList: string[];
}

const TestCasesSection: React.FC<TestCasesSectionProps> = ({ varsList }) => {
  const { testCases, setTestCases } = useStore();
  const [editingTestCaseIndex, setEditingTestCaseIndex] = React.useState<number | null>(null);
  const [testCaseDialogOpen, setTestCaseDialogOpen] = React.useState(false);

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
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result?.toString();
        if (text) {
          const { parse: parseCsv } = await import('csv-parse/sync');
          const rows: CsvRow[] = parseCsv(text, { columns: true });
          setTestCases([...testCases, ...rows.map((row) => testCaseFromCsvRow(row))]);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleRemoveTestCase = (event: React.MouseEvent, index: number) => {
    event.stopPropagation();

    if (confirm('Are you sure you want to delete this test case?')) {
      setTestCases(testCases.filter((_, i) => i !== index));
    }
  };

  const handleDuplicateTestCase = (event: React.MouseEvent, index: number) => {
    event.stopPropagation();
    const duplicatedTestCase = JSON.parse(JSON.stringify(testCases[index]));
    setTestCases([...testCases, duplicatedTestCase]);
  };

  return (
    <>
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Typography variant="h5">Test Cases</Typography>
        <div>
          <label htmlFor={`file-input-add-test-case`}>
            <Tooltip title="Upload test cases from csv">
              <span>
                <IconButton component="span">
                  <Publish />
                </IconButton>
                <input
                  id={`file-input-add-test-case`}
                  type="file"
                  accept=".csv"
                  onChange={handleAddTestCaseFromFile}
                  style={{ display: 'none' }}
                />
              </span>
            </Tooltip>
          </label>
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
        initialValues={editingTestCaseIndex !== null ? testCases[editingTestCaseIndex] : undefined}
        onCancel={() => {
          setEditingTestCaseIndex(null);
          setTestCaseDialogOpen(false);
        }}
      />
    </>
  );
};

export default TestCasesSection;
