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
import { useSearchParams } from 'next/navigation';

import { getApiBaseUrl } from '@/api';
import PromptDialog from './PromptDialog';

import type { PromptWithMetadata } from '@/../../../types';

const MAX_CELL_LENGTH = 500;

export default function Prompts() {
  const searchParams = useSearchParams();

  const [prompts, setPrompts] = useState<(PromptWithMetadata & { recentEvalDate: string })[]>([]);
  const [sortField, setSortField] = useState<string | null>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);

  const handleSort = (field: string) => {
    const order = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortOrder(order);
  };

  useEffect(() => {
    (async () => {
      fetch(`${await getApiBaseUrl()}/api/prompts`)
        .then((response) => response.json())
        .then((data) => {
          const sortedData = [...data.data].sort((a, b) => {
            if (sortField === null) return 0;
            if (sortOrder === 'asc') return a[sortField] > b[sortField] ? 1 : -1;
            return a[sortField] < b[sortField] ? 1 : -1;
          });
          setPrompts(sortedData);
        });
    })();
  }, [sortField, sortOrder]);

  useEffect(() => {
    const promptId = searchParams?.get('id');
    if (promptId) {
      const promptIndex = prompts.findIndex((prompt) => prompt.id.startsWith(promptId));
      if (promptIndex !== -1) {
        handleClickOpen(promptIndex);
      }
    }
  }, [prompts, searchParams]);

  const handleClickOpen = (index: number) => {
    setOpenDialog(true);
    setSelectedPromptIndex(index);
  };

  const handleClose = () => {
    setOpenDialog(false);
  };

  return (
    <Box paddingX={2}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell style={{ width: '10%' }}>ID</TableCell>
            <TableCell style={{ width: '60%' }}>
              <TableSortLabel
                active={sortField === 'raw'}
                direction={sortField === 'raw' ? sortOrder : 'asc'}
                onClick={() => handleSort('raw')}
              >
                Prompt
              </TableSortLabel>
            </TableCell>
            <TableCell style={{ width: '20%' }}>
              <Tooltip title="The date of the most recent eval for this prompt">
                <TableSortLabel
                  active={sortField === 'date'}
                  direction={sortField === 'date' ? sortOrder : 'asc'}
                  onClick={() => handleSort('date')}
                >
                  Most recent eval
                </TableSortLabel>
              </Tooltip>
            </TableCell>
            <TableCell style={{ width: '10%' }}>
              <TableSortLabel
                active={sortField === 'count'}
                direction={sortField === 'count' ? sortOrder : 'asc'}
                onClick={() => handleSort('count')}
              >
                # Evals
              </TableSortLabel>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {prompts.slice((page - 1) * rowsPerPage, page * rowsPerPage).map((promptRow, index) => (
            <TableRow key={index} hover>
              <TableCell style={{ width: '10%' }}>{promptRow.id.slice(0, 6)}</TableCell>
              <TableCell
                style={{ width: '60%', whiteSpace: 'pre-wrap', cursor: 'pointer' }}
                onClick={() => handleClickOpen(index)}
              >
                {promptRow.prompt.raw.length > MAX_CELL_LENGTH
                  ? promptRow.prompt.raw.slice(0, MAX_CELL_LENGTH) + '...'
                  : promptRow.prompt.raw}
              </TableCell>
              <TableCell style={{ width: '20%' }}>
                {promptRow.recentEvalDate ? (
                  <Link href={`/eval?file=${promptRow.recentEvalId}`}>
                    {promptRow.recentEvalDate}
                  </Link>
                ) : (
                  'Unknown'
                )}
              </TableCell>
              <TableCell style={{ width: '10%' }}>{promptRow.count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {Math.ceil(prompts.length / rowsPerPage) > 1 && (
        <Pagination
          count={Math.ceil(prompts.length / rowsPerPage)}
          page={page}
          onChange={(event, value) => setPage(value)}
        />
      )}
      {prompts[selectedPromptIndex] && (
        <PromptDialog
          openDialog={openDialog}
          handleClose={handleClose}
          selectedPrompt={prompts[selectedPromptIndex]}
        />
      )}
    </Box>
  );
}
