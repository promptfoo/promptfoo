import React from 'react';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import Copy from '@mui/icons-material/ContentCopy';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import Chip from '@mui/material/Chip';
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
import type { TestCase } from '@promptfoo/types';
import type { GenerationBatch } from '../types';
import { hasGenerationMetadata } from '../utils/typeGuards';

interface TestCasesTableProps {
  testCases: TestCase[];
  generationBatches: Map<string, GenerationBatch>;
  onEdit: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
}

const TestCasesTable = React.memo<TestCasesTableProps>(
  ({ testCases, generationBatches, onEdit, onDuplicate, onDelete }) => {
    const handleRowClick = (index: number) => {
      onEdit(index);
    };

    const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onEdit(index);
      }
    };

    const renderGenerationChip = (testCase: TestCase) => {
      if (!hasGenerationMetadata(testCase.metadata)) {
        return null;
      }

      const batchId = testCase.metadata.generationBatchId;
      const batch = batchId ? generationBatches.get(batchId) : null;

      if (!batch) {
        return null;
      }

      return (
        <Tooltip
          title={`Generated on ${new Date(batch.generatedAt).toLocaleString()} by ${
            batch.generatedBy
          }`}
        >
          <Chip
            icon={<AutoAwesome />}
            label="Generated"
            size="small"
            color="primary"
            variant="outlined"
          />
        </Tooltip>
      );
    };

    if (testCases.length === 0) {
      return (
        <TableContainer>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell colSpan={4} align="center">
                  No test cases added yet.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      );
    }

    return (
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Description</TableCell>
              <TableCell>Assertions</TableCell>
              <TableCell>Variables</TableCell>
              <TableCell align="right" width={150}>
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {testCases.map((testCase, index) => (
              <TableRow
                key={index}
                tabIndex={0}
                role="button"
                aria-label={`Edit test case ${testCase.description || index + 1}`}
                sx={{
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.04)',
                    cursor: 'pointer',
                  },
                  '&:focus': {
                    outline: '2px solid',
                    outlineColor: 'primary.main',
                    outlineOffset: -2,
                  },
                }}
                onClick={() => handleRowClick(index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
              >
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2">
                      {testCase.description || `Test Case #${index + 1}`}
                    </Typography>
                    {renderGenerationChip(testCase)}
                  </Stack>
                </TableCell>
                <TableCell>{testCase.assert?.length || 0} assertions</TableCell>
                <TableCell>
                  {Object.entries(testCase.vars || {})
                    .map(([k, v]) => `${k}=${v}`)
                    .join(', ')}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit test case">
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(index);
                      }}
                      size="small"
                      aria-label={`Edit test case ${index + 1}`}
                    >
                      <Edit />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Duplicate test case">
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicate(index);
                      }}
                      size="small"
                      aria-label={`Duplicate test case ${index + 1}`}
                    >
                      <Copy />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete test case">
                    <IconButton
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(index);
                      }}
                      size="small"
                      aria-label={`Delete test case ${index + 1}`}
                    >
                      <Delete />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  },
);

TestCasesTable.displayName = 'TestCasesTable';

export default TestCasesTable;