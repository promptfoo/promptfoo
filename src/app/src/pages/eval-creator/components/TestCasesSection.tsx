import React from 'react';
import { useStore } from '@app/stores/evalConfig';
import Add from '@mui/icons-material/Add';
import Copy from '@mui/icons-material/ContentCopy';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import Publish from '@mui/icons-material/Publish';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { testCaseFromCsvRow } from '@promptfoo/csv';
import type { CsvRow, TestCase } from '@promptfoo/types';
import TestCaseDialog from './TestCaseDialog';
import {
  ContentSection,
  SectionTitle,
  TransitionButton,
  TransitionIconButton,
  ActionButtonsStack,
  StyledTableContainer,
  EmptyState,
} from './shared/TransitionComponents';

interface TestCasesSectionProps {
  varsList: string[];
}

const TestCasesSection: React.FC<TestCasesSectionProps> = ({ varsList }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
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
          const newTestCases: TestCase[] = rows.map((row) => testCaseFromCsvRow(row) as TestCase);
          setTestCases([...testCases, ...newTestCases]);
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
    <ContentSection>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        mb={3}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
      >
        <SectionTitle>Test Cases</SectionTitle>

        <ActionButtonsStack>
          <TransitionButton
            variant="outlined"
            startIcon={<Publish />}
            component="label"
            size={isMobile ? 'small' : 'medium'}
          >
            Import CSV
            <input
              type="file"
              accept=".csv"
              onChange={handleAddTestCaseFromFile}
              style={{ display: 'none' }}
              aria-label="Upload test cases from CSV file"
            />
          </TransitionButton>

          <TransitionButton
            color="primary"
            onClick={() => setTestCaseDialogOpen(true)}
            startIcon={<Add />}
            size={isMobile ? 'small' : 'medium'}
          >
            Add Test Case
          </TransitionButton>
        </ActionButtonsStack>
      </Stack>

      <StyledTableContainer>
        <Table aria-label="Test cases table">
          <TableHead>
            <TableRow>
              <TableCell>Description</TableCell>
              <TableCell>Assertions</TableCell>
              {!isMobile && <TableCell>Variables</TableCell>}
              <TableCell align="right"></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {testCases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isMobile ? 3 : 4} align="center">
                  <EmptyState message="No test cases added yet." />
                </TableCell>
              </TableRow>
            ) : (
              testCases.map((testCase, index) => (
                <TableRow
                  key={index}
                  sx={{
                    '&:hover': {
                      backgroundColor: (theme) =>
                        alpha(
                          theme.palette.action.hover,
                          theme.palette.mode === 'dark' ? 0.1 : 0.04,
                        ),
                      cursor: 'pointer',
                    },
                    transition: theme.transitions.create('background-color', {
                      duration: theme.transitions.duration.shortest,
                    }),
                  }}
                  onClick={() => {
                    setEditingTestCaseIndex(index);
                    setTestCaseDialogOpen(true);
                  }}
                >
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 500,
                        transition: theme.transitions.create('color', {
                          duration: theme.transitions.duration.standard,
                        }),
                      }}
                    >
                      {testCase.description || `Test Case #${index + 1}`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={`${testCase.assert?.length || 0} assertion${testCase.assert?.length === 1 ? '' : 's'}`}
                      size="small"
                      color="primary"
                      variant="outlined"
                      sx={{
                        transition: theme.transitions.create(
                          ['background-color', 'color', 'border-color'],
                          { duration: theme.transitions.duration.standard },
                        ),
                      }}
                    />
                  </TableCell>
                  {!isMobile && (
                    <TableCell>
                      <Box
                        sx={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 0.5,
                          maxWidth: '400px',
                        }}
                      >
                        {Object.entries(testCase.vars || {}).length > 0 ? (
                          Object.entries(testCase.vars || {}).map(([key, value], i) => (
                            <Chip
                              key={i}
                              label={`${key}=${String(value).substring(0, 20)}${String(value).length > 20 ? '...' : ''}`}
                              size="small"
                              sx={{
                                fontSize: '0.7rem',
                                height: '24px',
                                transition: theme.transitions.create(
                                  ['background-color', 'color', 'border-color'],
                                  { duration: theme.transitions.duration.standard },
                                ),
                              }}
                            />
                          ))
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            No variables
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                  )}
                  <TableCell align="right" sx={{ minWidth: 120 }}>
                    <TransitionIconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTestCaseIndex(index);
                        setTestCaseDialogOpen(true);
                      }}
                      tooltip="Edit test case"
                      aria-label={`Edit test case ${index + 1}`}
                    >
                      <Edit fontSize="small" />
                    </TransitionIconButton>

                    <TransitionIconButton
                      onClick={(event) => handleDuplicateTestCase(event, index)}
                      tooltip="Duplicate test case"
                      aria-label={`Duplicate test case ${index + 1}`}
                    >
                      <Copy fontSize="small" />
                    </TransitionIconButton>

                    <TransitionIconButton
                      onClick={(event) => handleRemoveTestCase(event, index)}
                      color="error"
                      tooltip="Delete test case"
                      aria-label={`Delete test case ${index + 1}`}
                    >
                      <Delete fontSize="small" />
                    </TransitionIconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </StyledTableContainer>

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
    </ContentSection>
  );
};

export default TestCasesSection;
