import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Pagination from '@mui/material/Pagination';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { visuallyHidden } from '@mui/utils';
import type { TestCase, TestCasesWithMetadata } from '@promptfoo/types';
import DatasetDialog from './DatasetDialog';

const ROWS_PER_PAGE = 10;

type SortableField = 'id' | 'raw' | 'date' | 'count' | 'evalId' | null;

interface DatasetsProps {
  data: (TestCasesWithMetadata & { recentEvalDate: string })[];
  isLoading: boolean;
  error: string | null;
}

// Custom hooks to separate concerns
const useSortableData = (data: DatasetsProps['data']) => {
  const [sortField, setSortField] = React.useState<SortableField>('date');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');

  const handleSort = React.useCallback(
    (field: SortableField) => {
      setSortOrder((prevOrder) => (sortField === field && prevOrder === 'asc' ? 'desc' : 'asc'));
      setSortField(field);
    },
    [sortField],
  );

  const sortedData = React.useMemo(() => {
    if (!sortField) {
      return data;
    }

    return [...data].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortField) {
        case 'date':
          aValue = a.recentEvalDate || '';
          bValue = b.recentEvalDate || '';
          break;
        case 'count':
          aValue = a.count || 0;
          bValue = b.count || 0;
          break;
        case 'evalId':
          aValue = a.recentEvalId || '';
          bValue = b.recentEvalId || '';
          break;
        case 'id':
          aValue = a.id;
          bValue = b.id;
          break;
        case 'raw':
          aValue = a.testCases.length;
          bValue = b.testCases.length;
          break;
        default:
          return 0;
      }

      return sortOrder === 'asc' ? (aValue > bValue ? 1 : -1) : aValue < bValue ? 1 : -1;
    });
  }, [data, sortField, sortOrder]);

  return { sortedData, sortField, sortOrder, handleSort };
};

const useDialog = (sortedData: DatasetsProps['data']) => {
  const [searchParams] = useSearchParams();
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const hasShownPopup = React.useRef(false);

  React.useEffect(() => {
    if (hasShownPopup.current) {
      return;
    }

    const testCaseId = searchParams.get('id');
    if (testCaseId) {
      const index = sortedData.findIndex((testCase) => testCase.id.startsWith(testCaseId));
      if (index !== -1) {
        setSelectedIndex(index);
        setIsOpen(true);
        hasShownPopup.current = true;
      }
    }
  }, [sortedData, searchParams]);

  const handleOpen = React.useCallback((index: number) => {
    setSelectedIndex(index);
    setIsOpen(true);
  }, []);

  const handleClose = React.useCallback(() => {
    setIsOpen(false);
  }, []);

  return { isOpen, selectedIndex, handleOpen, handleClose };
};

const DatasetTableHeader: React.FC<{
  sortField: SortableField;
  sortOrder: 'asc' | 'desc';
  onSort: (field: SortableField) => void;
}> = ({ sortField, sortOrder, onSort }) => (
  <TableHead>
    <TableRow>
      <TableCell>
        <TableSortLabel
          active={sortField === 'id'}
          direction={sortField === 'id' ? sortOrder : 'asc'}
          onClick={() => onSort('id')}
        >
          ID
          {sortField === 'id' ? (
            <Box component="span" sx={visuallyHidden}>
              {sortOrder === 'desc' ? 'sorted descending' : 'sorted ascending'}
            </Box>
          ) : null}
        </TableSortLabel>
      </TableCell>
      <TableCell>
        <TableSortLabel
          active={sortField === 'raw'}
          direction={sortField === 'raw' ? sortOrder : 'asc'}
          onClick={() => onSort('raw')}
        >
          Test Cases
          {sortField === 'raw' ? (
            <Box component="span" sx={visuallyHidden}>
              {sortOrder === 'desc' ? 'sorted descending' : 'sorted ascending'}
            </Box>
          ) : null}
        </TableSortLabel>
      </TableCell>
      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Variables</TableCell>
      <TableCell>
        <TableSortLabel
          active={sortField === 'count'}
          direction={sortField === 'count' ? sortOrder : 'asc'}
          onClick={() => onSort('count')}
        >
          Total Evals
          {sortField === 'count' ? (
            <Box component="span" sx={visuallyHidden}>
              {sortOrder === 'desc' ? 'sorted descending' : 'sorted ascending'}
            </Box>
          ) : null}
        </TableSortLabel>
      </TableCell>
      <TableCell align="right">Total Prompts</TableCell>
      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
        <Tooltip title="The date of the most recent eval for this set of test cases">
          <TableSortLabel
            active={sortField === 'date'}
            direction={sortField === 'date' ? sortOrder : 'asc'}
            onClick={() => onSort('date')}
          >
            Latest Eval Date
            {sortField === 'date' ? (
              <Box component="span" sx={visuallyHidden}>
                {sortOrder === 'desc' ? 'sorted descending' : 'sorted ascending'}
              </Box>
            ) : null}
          </TableSortLabel>
        </Tooltip>
      </TableCell>
      <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
        <Tooltip title="The ID of the most recent eval for this set of test cases">
          <TableSortLabel
            active={sortField === 'evalId'}
            direction={sortField === 'evalId' ? sortOrder : 'asc'}
            onClick={() => onSort('evalId')}
          >
            Latest Eval ID
            {sortField === 'evalId' ? (
              <Box component="span" sx={visuallyHidden}>
                {sortOrder === 'desc' ? 'sorted descending' : 'sorted ascending'}
              </Box>
            ) : null}
          </TableSortLabel>
        </Tooltip>
      </TableCell>
    </TableRow>
  </TableHead>
);

const DatasetTableRow: React.FC<{
  testCasesData: TestCasesWithMetadata & { recentEvalDate: string };
  onClick: () => void;
}> = React.memo(({ testCasesData, onClick }) => {
  const getVariables = React.useCallback(() => {
    if (!Array.isArray(testCasesData.testCases) || typeof testCasesData.testCases[0] === 'string') {
      return '';
    }
    const allVarsKeys = (testCasesData.testCases as TestCase[]).flatMap((testCase) =>
      Object.keys(testCase.vars || {}),
    );
    const uniqueVarsKeys = Array.from(new Set(allVarsKeys));
    return uniqueVarsKeys.length > 0 ? uniqueVarsKeys.join(', ') : 'None';
  }, [testCasesData.testCases]);

  return (
    <TableRow
      hover
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        '&:last-child td, &:last-child th': { border: 0 },
        transition: 'background-color 0.2s',
        '&:hover': {
          backgroundColor: 'action.hover',
        },
      }}
      role="button"
      tabIndex={0}
    >
      <TableCell>
        <Typography variant="body2" fontFamily="monospace">
          {testCasesData.id.slice(0, 6)}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" noWrap>
          {testCasesData.testCases.length} test cases
        </Typography>
      </TableCell>
      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
        <Typography
          variant="body2"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {getVariables()}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" fontWeight="medium">
          {testCasesData.count}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Typography variant="body2" fontWeight="medium">
          {testCasesData.prompts?.length || 0}
        </Typography>
      </TableCell>
      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
        <Typography variant="body2" color="text.secondary">
          {testCasesData.recentEvalDate || 'Unknown'}
        </Typography>
      </TableCell>
      <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
        {testCasesData.recentEvalId ? (
          <Link
            to={`/eval?evalId=${testCasesData.recentEvalId}`}
            style={{ textDecoration: 'none' }}
          >
            <Typography
              variant="body2"
              color="primary"
              sx={{
                fontFamily: 'monospace',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              {testCasesData.recentEvalId}
            </Typography>
          </Link>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Unknown
          </Typography>
        )}
      </TableCell>
    </TableRow>
  );
});

DatasetTableRow.displayName = 'DatasetTableRow';

export default function Datasets({ data, isLoading, error }: DatasetsProps) {
  const [page, setPage] = React.useState(1);
  const { sortedData, sortField, sortOrder, handleSort } = useSortableData(data);
  const { isOpen, selectedIndex, handleOpen, handleClose } = useDialog(sortedData);

  const paginatedData = React.useMemo(() => {
    const startIndex = (page - 1) * ROWS_PER_PAGE;
    return sortedData.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedData, page]);

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert
          severity="error"
          sx={{
            '& .MuiAlert-message': {
              width: '100%',
            },
          }}
        >
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Stack spacing={3} sx={{ p: { xs: 1, sm: 2 } }}>
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          overflow: 'hidden',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        <TableContainer>
          <Table size="medium" aria-label="datasets table">
            <DatasetTableHeader sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
            <TableBody>
              {paginatedData.map((testCasesData, index) => (
                <DatasetTableRow
                  key={testCasesData.id}
                  testCasesData={testCasesData}
                  onClick={() => handleOpen(index)}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {Math.ceil(sortedData.length / ROWS_PER_PAGE) > 1 && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              p: 2,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <Pagination
              count={Math.ceil(sortedData.length / ROWS_PER_PAGE)}
              page={page}
              onChange={(_, value) => setPage(value)}
              size="small"
              shape="rounded"
              showFirstButton
              showLastButton
              sx={{
                '& .MuiPaginationItem-root': {
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                },
              }}
            />
          </Box>
        )}
      </Paper>

      {sortedData[selectedIndex] && (
        <DatasetDialog
          openDialog={isOpen}
          handleClose={handleClose}
          testCase={sortedData[selectedIndex]}
        />
      )}

      {isLoading && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 200,
          }}
        >
          <CircularProgress />
        </Box>
      )}
    </Stack>
  );
}
