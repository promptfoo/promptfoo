import React, { useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import Copy from '@mui/icons-material/ContentCopy';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { TestCase } from '@promptfoo/types';
import type { GenerationBatch } from '../types';
import { hasGenerationMetadata } from '../utils/typeGuards';

interface VirtualizedTestCasesTableProps {
  testCases: TestCase[];
  generationBatches: Map<string, GenerationBatch>;
  onEdit: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  height?: number;
}

interface RowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    testCases: TestCase[];
    generationBatches: Map<string, GenerationBatch>;
    onEdit: (index: number) => void;
    onDuplicate: (index: number) => void;
    onDelete: (index: number) => void;
  };
}

const Row = React.memo<RowProps>(({ index, style, data }) => {
  const { testCases, generationBatches, onEdit, onDuplicate, onDelete } = data;
  const testCase = testCases[index];

  const handleRowClick = useCallback(() => {
    onEdit(index);
  }, [onEdit, index]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onEdit(index);
      }
    },
    [onEdit, index],
  );

  const renderGenerationChip = () => {
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

  return (
    <div style={style}>
      <TableRow
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
          height: '100%',
          display: 'flex',
          alignItems: 'center',
        }}
        onClick={handleRowClick}
        onKeyDown={handleKeyDown}
      >
        <TableCell sx={{ flex: 3, overflow: 'hidden' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" noWrap>
              {testCase.description || `Test Case #${index + 1}`}
            </Typography>
            {renderGenerationChip()}
          </Stack>
        </TableCell>
        <TableCell sx={{ flex: 1 }}>{testCase.assert?.length || 0} assertions</TableCell>
        <TableCell sx={{ flex: 2, overflow: 'hidden' }}>
          <Typography variant="body2" noWrap>
            {Object.entries(testCase.vars || {})
              .map(([k, v]) => `${k}=${v}`)
              .join(', ')}
          </Typography>
        </TableCell>
        <TableCell sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
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
    </div>
  );
});

Row.displayName = 'VirtualizedRow';

const VirtualizedTestCasesTable: React.FC<VirtualizedTestCasesTableProps> = ({
  testCases,
  generationBatches,
  onEdit,
  onDuplicate,
  onDelete,
  height = 600,
}) => {
  if (testCases.length === 0) {
    return (
      <Box p={4} textAlign="center">
        <Typography color="textSecondary">No test cases added yet.</Typography>
      </Box>
    );
  }

  const itemData = {
    testCases,
    generationBatches,
    onEdit,
    onDuplicate,
    onDelete,
  };

  return (
    <Box>
      {/* Table Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'grey.50',
        }}
      >
        <Typography variant="subtitle2" sx={{ flex: 3 }}>
          Description
        </Typography>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          Assertions
        </Typography>
        <Typography variant="subtitle2" sx={{ flex: 2 }}>
          Variables
        </Typography>
        <Typography variant="subtitle2" sx={{ flex: 1, textAlign: 'right' }}>
          Actions
        </Typography>
      </Box>

      {/* Virtualized List */}
      <List
        height={height}
        itemCount={testCases.length}
        itemSize={64}
        width="100%"
        itemData={itemData}
      >
        {Row}
      </List>
    </Box>
  );
};

export default VirtualizedTestCasesTable;