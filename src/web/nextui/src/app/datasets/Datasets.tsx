'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Pagination from '@mui/material/Pagination';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Tooltip from '@mui/material/Tooltip';

import DatasetDialog from './DatasetDialog';
import {API_BASE_URL} from '@/constants';

import type {TestCase, TestCasesWithMetadata} from '@/../../../types';

export default function Datasets() {
  const [testCases, setPrompts] = useState<(TestCasesWithMetadata & {date: string})[]>([]);
  const [sortField, setSortField] = useState<string | null>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogTestCaseIndex, setDialogTestCaseIndex] = useState(0);

  const handleSort = (field: string) => {
    const order = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortOrder(order);
  };

  useEffect(() => {
    //fetch(`${API_BASE_URL}/api/datasets?page=${page}&limit=${rowsPerPage}`)
    fetch(`${API_BASE_URL}/api/datasets`)
      .then((response) => response.json())
      .then((data) => {
        const sortedData = [...data.data].sort((a, b) => {
          if (sortField === null) return 0;
          if (sortOrder === 'asc') return a[sortField] > b[sortField] ? 1 : -1;
          return a[sortField] < b[sortField] ? 1 : -1;
        });
        setPrompts(sortedData);
      });
  }, [sortField, sortOrder]);

  const handleClickOpen = (index: number) => {
    setDialogTestCaseIndex(index);
    setOpenDialog(true);
  };

  const handleClose = () => {
    setOpenDialog(false);
  };

  return (
    <Box paddingX={2}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell style={{width: '20%'}}>
              <TableSortLabel active={sortField === 'raw'} direction={sortField === 'raw' ? sortOrder : 'asc'} onClick={() => handleSort('raw')}>
                Dataset
              </TableSortLabel>
            </TableCell>
            <TableCell style={{width: '35%'}}>
              Variables
            </TableCell>
            <TableCell style={{width: '20%'}}>
              <Tooltip title="The date of the most recent eval for this set of test cases">
                <TableSortLabel active={sortField === 'date'} direction={sortField === 'date' ? sortOrder : 'asc'} onClick={() => handleSort('date')}>
                  Most recent eval
                </TableSortLabel>
              </Tooltip>
            </TableCell>
            <TableCell style={{width: '10%'}}>
              <TableSortLabel active={sortField === 'count'} direction={sortField === 'count' ? sortOrder : 'asc'} onClick={() => handleSort('count')}>
                # Evals
              </TableSortLabel>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {testCases.slice((page - 1) * rowsPerPage, page * rowsPerPage).map((testCasesData, index) => (
            <TableRow key={index} hover>
              <TableCell style={{width: '20%', whiteSpace: 'pre-wrap', cursor: 'pointer'}} onClick={() => handleClickOpen(index)}>
                {testCasesData.testCases.length} test cases
              </TableCell>
              <TableCell style={{width: '35%', whiteSpace: 'pre-wrap', cursor: 'pointer'}} onClick={() => handleClickOpen(index)}>
                {(() => {
                  if (typeof testCasesData.testCases === 'string' || typeof testCasesData.testCases[0] === 'string') {
                    return '';
                  }
                  const allVarsKeys = (testCasesData.testCases as TestCase[]).flatMap((testCase) => Object.keys(testCase.vars || {}));
                  const uniqueVarsKeys = Array.from(new Set(allVarsKeys));
                  return uniqueVarsKeys.length > 0 ? uniqueVarsKeys.join(', ') : 'None';
                })()}
              </TableCell>
              <TableCell style={{width: '20%'}}>{testCasesData.date ? <Link href={`/eval?file=${testCasesData.recentEvalId}`}>{testCasesData.date}</Link> : 'Unknown'}</TableCell>
              <TableCell style={{width: '10%'}}>{testCasesData.count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {Math.ceil(testCases.length / rowsPerPage) > 1 && (
        <Pagination count={Math.ceil(testCases.length / rowsPerPage)} page={page} onChange={(event, value) => setPage(value)} />
      )}
      {testCases[dialogTestCaseIndex] && <DatasetDialog
        openDialog={openDialog}
        handleClose={handleClose}
        testCase={testCases[dialogTestCaseIndex]}
      />
      }
    </Box>
  );
}
