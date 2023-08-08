import React from 'react';
import {
  Button,
  Typography,
  TableContainer,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Stack,
  IconButton,
  TableHead,
} from '@mui/material';
import { Edit, Delete } from '@mui/icons-material';
import TestCaseDialog from './TestCaseDialog';
import { useStore } from '../../util/store';

import type { TestCase } from '../../../../types';

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

  const handleRemoveTestCase = (index: number) => {
    setTestCases(testCases.filter((_, i) => i !== index));
  };

  return (
    <>
      <Stack direction="row" spacing={2} marginY={2} justifyContent="space-between">
        <Typography variant="h5">Test Cases</Typography>
        <Button color="primary" onClick={() => setTestCaseDialogOpen(true)} variant="contained">
          Add Test Case
        </Button>
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
                    <IconButton onClick={() => handleRemoveTestCase(index)} size="small">
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
