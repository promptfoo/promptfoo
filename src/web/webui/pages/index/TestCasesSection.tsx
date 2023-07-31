import React from 'react';
import { Button, Typography, TableContainer, Table, TableBody, TableRow, TableCell, IconButton } from '@mui/material';
import { Edit, Delete } from '@mui/icons-material';
import TestCaseDialog from './TestCaseDialog';

interface TestCasesSectionProps {
  testCases: TestCase[];
  varsList: string[];
  editingTestCaseIndex: number | null;
  setEditingTestCaseIndex: (index: number | null) => void;
  setTestCaseDialogOpen: (open: boolean) => void;
  handleAddTestCase: (testCase: TestCase, shouldClose: boolean) => void;
  handleRemoveTestCase: (index: number) => void;
}

const TestCasesSection: React.FC<TestCasesSectionProps> = ({
  testCases,
  varsList,
  editingTestCaseIndex,
  setEditingTestCaseIndex,
  setTestCaseDialogOpen,
  handleAddTestCase,
  handleRemoveTestCase,
}) => {
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
          <TableBody>
            {testCases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} align="center">
                  No test cases added yet.
                </TableCell>
              </TableRow>
            ) : (
              testCases.map((testCase, index) => (
                <TableRow key={index}>
                  <TableCell
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
                    <Typography variant="body2">
                      {`Test Case #${index + 1}: ${
                        testCase.description || `${testCase.assert?.length || 0} assertions`
                      }`}
                    </Typography>
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
