import React, { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Pagination from '@mui/material/Pagination';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Tooltip from '@mui/material/Tooltip';
import type { TestCase, TestCasesWithMetadata } from '@promptfoo/types';
import DatasetDialog from './DatasetDialog';

const rowsPerPage = 10;

type SortableField = 'id' | 'raw' | 'date' | 'count' | 'evalId' | null;

interface DatasetsProps {
  data: (TestCasesWithMetadata & { recentEvalDate: string })[];
  isLoading: boolean;
  error: string | null;
}

export default function Datasets({ data, isLoading, error }: DatasetsProps) {
  const [searchParams] = useSearchParams();
  const [sortField, setSortField] = useState<SortableField>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogTestCaseIndex, setDialogTestCaseIndex] = useState(0);
  const hasShownPopup = useRef(false);

  const handleSort = (field: SortableField) => {
    const order = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortOrder(order);
  };

  const sortedData = [...data].sort((a, b) => {
    if (sortField === null) {
      return 0;
    }

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
        aValue = a.testCases.length.toString();
        bValue = b.testCases.length.toString();
        break;
      default:
        return 0;
    }

    if (sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1;
    }
    return aValue < bValue ? 1 : -1;
  });

  const handleClickOpen = (index: number) => {
    setDialogTestCaseIndex(index);
    setOpenDialog(true);
  };

  React.useEffect(() => {
    if (hasShownPopup.current) {
      return;
    }
    const testCaseId = searchParams.get('id');
    if (testCaseId) {
      const testCaseIndex = sortedData.findIndex((testCase) => testCase.id.startsWith(testCaseId));
      if (testCaseIndex !== -1) {
        handleClickOpen(testCaseIndex);
        hasShownPopup.current = true;
      }
    }
  }, [sortedData, searchParams]);

  const handleClose = () => {
    setOpenDialog(false);
  };

  if (error) {
    return (
      <Box paddingX={2}>
        <div>Error: {error}</div>
      </Box>
    );
  }

  return (
    <Box paddingX={2}>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell style={{ width: '10%' }}>ID</TableCell>
              <TableCell style={{ width: '20%' }}>
                <TableSortLabel
                  active={sortField === 'raw'}
                  direction={sortField === 'raw' ? sortOrder : 'asc'}
                  onClick={() => handleSort('raw')}
                >
                  Info
                </TableSortLabel>
              </TableCell>
              <TableCell style={{ width: '20%' }}>Variables</TableCell>
              <TableCell style={{ width: '10%' }}>
                <TableSortLabel
                  active={sortField === 'count'}
                  direction={sortField === 'count' ? sortOrder : 'asc'}
                  onClick={() => handleSort('count')}
                >
                  Total # evals
                </TableSortLabel>
              </TableCell>
              <TableCell style={{ width: '20%' }}>
                <Tooltip title="The date of the most recent eval for this set of test cases">
                  <TableSortLabel
                    active={sortField === 'date'}
                    direction={sortField === 'date' ? sortOrder : 'asc'}
                    onClick={() => handleSort('date')}
                  >
                    Most recent eval date
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
              <TableCell style={{ width: '20%' }}>
                <Tooltip title="The ID of the most recent eval for this set of test cases">
                  <TableSortLabel
                    active={sortField === 'evalId'}
                    direction={sortField === 'evalId' ? sortOrder : 'asc'}
                    onClick={() => handleSort('evalId')}
                  >
                    Most recent eval ID
                  </TableSortLabel>
                </Tooltip>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedData
              .slice((page - 1) * rowsPerPage, page * rowsPerPage)
              .map((testCasesData, index) => (
                <TableRow
                  key={index}
                  hover
                  onClick={() => handleClickOpen(index)}
                  style={{ cursor: 'pointer' }}
                >
                  <TableCell>{testCasesData.id.slice(0, 6)}</TableCell>
                  <TableCell style={{ width: '20%', whiteSpace: 'pre-wrap' }}>
                    {testCasesData.testCases.length} test cases
                  </TableCell>
                  <TableCell style={{ width: '20%', whiteSpace: 'pre-wrap' }}>
                    {(() => {
                      if (
                        !Array.isArray(testCasesData.testCases) ||
                        typeof testCasesData.testCases[0] === 'string'
                      ) {
                        return '';
                      }
                      const allVarsKeys = ((testCasesData.testCases as TestCase[]) || []).flatMap(
                        (testCase) => Object.keys(testCase.vars || {}),
                      );
                      const uniqueVarsKeys = Array.from(new Set(allVarsKeys));
                      return uniqueVarsKeys.length > 0 ? uniqueVarsKeys.join(', ') : 'None';
                    })()}
                  </TableCell>
                  <TableCell style={{ width: '10%' }}>{testCasesData.count}</TableCell>
                  <TableCell style={{ width: '20%' }}>
                    {testCasesData.recentEvalDate || 'Unknown'}
                  </TableCell>
                  <TableCell style={{ width: '20%' }}>
                    {testCasesData.recentEvalId ? (
                      <Link to={`/eval?evalId=${testCasesData.recentEvalId}`}>
                        {testCasesData.recentEvalId}
                      </Link>
                    ) : (
                      'Unknown'
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {Math.ceil(sortedData.length / rowsPerPage) > 1 && (
          <Pagination
            count={Math.ceil(sortedData.length / rowsPerPage)}
            page={page}
            onChange={(event, value) => setPage(value)}
          />
        )}
        {sortedData[dialogTestCaseIndex] && (
          <DatasetDialog
            openDialog={openDialog}
            handleClose={handleClose}
            testCase={sortedData[dialogTestCaseIndex]}
          />
        )}
      </TableContainer>
      {isLoading && (
        <Box display="flex" justifyContent="center" my={4}>
          <CircularProgress />
        </Box>
      )}
    </Box>
  );
}
