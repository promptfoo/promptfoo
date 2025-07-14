import React, { useCallback, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import {
  Box,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import type { TestCase } from '@promptfoo/types';
import { ComponentErrorBoundary } from './ComponentErrorBoundary';

interface VirtualizedTestCasesTableProps {
  testCases: TestCase[];
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onDuplicate: (index: number) => void;
}

interface RowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    testCases: TestCase[];
    varsList: string[];
    onEdit: (index: number) => void;
    onDelete: (index: number) => void;
    onDuplicate: (index: number) => void;
  };
}

const Row: React.FC<RowProps> = React.memo(({ index, style, data }) => {
  const { testCases, varsList, onEdit, onDelete, onDuplicate } = data;
  const testCase = testCases[index];

  if (!testCase) {
    return null;
  }

  const handleEdit = () => onEdit(index);
  const handleDelete = () => onDelete(index);
  const handleDuplicate = () => onDuplicate(index);

  return (
    <div style={style}>
      <TableRow
        hover
        sx={{
          cursor: 'pointer',
          '&:hover .action-buttons': {
            opacity: 1,
          },
        }}
      >
        <TableCell>{index + 1}</TableCell>
        {varsList.map((varName) => (
          <TableCell key={varName}>
            <Typography
              variant="body2"
              sx={{
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {testCase.vars?.[varName] || '-'}
            </Typography>
          </TableCell>
        ))}
        <TableCell>{testCase.assert?.length || 0}</TableCell>
        <TableCell align="right">
          <Box
            className="action-buttons"
            sx={{
              display: 'flex',
              gap: 0.5,
              justifyContent: 'flex-end',
              opacity: 0,
              transition: 'opacity 0.2s',
            }}
          >
            <Tooltip title="Edit">
              <IconButton
                size="small"
                onClick={handleEdit}
                aria-label={`Edit test case ${index + 1}`}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Duplicate">
              <IconButton
                size="small"
                onClick={handleDuplicate}
                aria-label={`Duplicate test case ${index + 1}`}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton
                size="small"
                onClick={handleDelete}
                color="error"
                aria-label={`Delete test case ${index + 1}`}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </TableCell>
      </TableRow>
    </div>
  );
});

Row.displayName = 'VirtualizedRow';

const VirtualizedTestCasesTableInner: React.FC<VirtualizedTestCasesTableProps> = React.memo(
  ({ testCases, onEdit, onDelete, onDuplicate }) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    // Extract variable names from test cases
    const varsList = useMemo(() => {
      const varsSet = new Set<string>();
      testCases.forEach((testCase) => {
        if (testCase.vars) {
          Object.keys(testCase.vars).forEach((varName) => varsSet.add(varName));
        }
      });
      return Array.from(varsSet).sort();
    }, [testCases]);

    // Data for virtualized list
    const itemData = useMemo(
      () => ({
        testCases,
        varsList,
        onEdit,
        onDelete,
        onDuplicate,
      }),
      [testCases, varsList, onEdit, onDelete, onDuplicate],
    );

    // Calculate row height based on content
    const rowHeight = isMobile ? 80 : 64;

    // Calculate list height (max 600px or 10 rows)
    const listHeight = Math.min(600, Math.max(200, testCases.length * rowHeight));

    if (testCases.length === 0) {
      return (
        <Typography color="textSecondary" align="center" sx={{ py: 4 }}>
          No test cases yet. Click "Generate" or "Add Test Case" to get started.
        </Typography>
      );
    }

    return (
      <TableContainer component={Paper} variant="outlined">
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 60 }}>#</TableCell>
              {varsList.map((varName) => (
                <TableCell key={varName}>{varName}</TableCell>
              ))}
              <TableCell sx={{ width: 100 }}>Assertions</TableCell>
              <TableCell align="right" sx={{ width: 140 }}>
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
        </Table>
        <Box>
          <List
            height={listHeight}
            itemCount={testCases.length}
            itemSize={rowHeight}
            width="100%"
            itemData={itemData}
          >
            {Row}
          </List>
        </Box>
      </TableContainer>
    );
  },
);

VirtualizedTestCasesTableInner.displayName = 'VirtualizedTestCasesTableInner';

export const VirtualizedTestCasesTable: React.FC<VirtualizedTestCasesTableProps> = (props) => {
  return (
    <ComponentErrorBoundary componentName="VirtualizedTestCasesTable">
      <VirtualizedTestCasesTableInner {...props} />
    </ComponentErrorBoundary>
  );
};
