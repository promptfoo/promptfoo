'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DownloadIcon from '@mui/icons-material/Download';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';

import type { StandaloneEval } from '@/../../../util';

export default function Cols() {
  const [cols, setCols] = useState<StandaloneEval[]>([]);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  useEffect(() => {
    (async () => {
      const response = await fetch(`/api/progress`);
      const data = await response.json();
      if (data && data.data) {
        setCols(data.data);
      }
    })();
  }, []);

  const handleSort = (field: string) => {
    const isAsc = sortField === field && sortOrder === 'asc';
    setSortField(field);
    setSortOrder(isAsc ? 'desc' : 'asc');
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleExport = (format: string) => {
    const dataStr = format === 'json' ? JSON.stringify(cols) : convertToCSV(cols);
    const blob = new Blob([dataStr], { type: `text/${format};charset=utf-8;` });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cols_export.${format}`;
    link.click();
    URL.revokeObjectURL(link.href);
    setAnchorEl(null);
  };

  const calculatePassRate = (
    metrics: { testPassCount: number; testFailCount: number } | undefined,
  ) => {
    if (metrics?.testPassCount != null && metrics?.testFailCount != null) {
      return (
        (metrics.testPassCount / (metrics.testPassCount + metrics.testFailCount)) *
        100
      ).toFixed(2);
    }
    return '-';
  };

  const convertToCSV = (arr: StandaloneEval[]) => {
    const headers = [
      'Eval',
      'Dataset',
      'Provider',
      'Prompt',
      'Pass Rate %',
      'Pass Count',
      'Fail Count',
      'Raw score',
    ];
    const rows = arr.map((col) => [
      col.evalId ?? '',
      col.datasetId?.slice(0, 6) ?? '',
      col.provider ?? '',
      (col.promptId?.slice(0, 6) ?? '') + ' ' + (col.raw ?? ''),
      calculatePassRate(col.metrics),
      col.metrics?.testPassCount == null ? '-' : `${col.metrics.testPassCount}`,
      col.metrics?.testFailCount == null ? '-' : `${col.metrics.testFailCount}`,
      col.metrics?.score == null ? '-' : col.metrics.score.toFixed(2),
    ]);
    return [headers]
      .concat(rows)
      .map((it) => it.map((value) => value ?? '').join(','))
      .join('\n');
  };

  const sortedCols = React.useMemo(() => {
    return cols.sort((a, b) => {
      if (!sortField) return 0;
      if (sortField === 'passRate') {
        const aValue = parseFloat(calculatePassRate(a.metrics));
        const bValue = parseFloat(calculatePassRate(b.metrics));
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      } else {
        // Ensure sortField is a key of StandaloneEval
        if (sortField in a && sortField in b) {
          const aValue = a[sortField as keyof StandaloneEval] || '';
          const bValue = b[sortField as keyof StandaloneEval] || '';
          return sortOrder === 'asc'
            ? aValue.toString().localeCompare(bValue.toString())
            : bValue.toString().localeCompare(aValue.toString());
        }
        return 0;
      }
    });
  }, [cols, sortField, sortOrder]);

  return (
    <Box paddingX={2}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <h2>Progress summary</h2>
        <div>
          <Button
            id="export-button"
            aria-controls={open ? 'export-menu' : undefined}
            aria-haspopup="true"
            aria-expanded={open ? 'true' : undefined}
            onClick={handleClick}
            startIcon={<DownloadIcon />}
          >
            Export
          </Button>
          <Menu
            id="export-menu"
            anchorEl={anchorEl}
            open={open}
            onClose={handleClose}
            MenuListProps={{
              'aria-labelledby': 'export-button',
            }}
          >
            <MenuItem onClick={() => handleExport('csv')}>CSV</MenuItem>
            <MenuItem onClick={() => handleExport('json')}>JSON</MenuItem>
          </Menu>
        </div>
      </Box>
      <Box>
        This page shows performance metrics for provider/prompt combinations from recent evals.
      </Box>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>
              <TableSortLabel
                active={sortField === 'evalId'}
                direction={sortField === 'evalId' ? sortOrder : 'asc'}
                onClick={() => handleSort('evalId')}
              >
                Eval
              </TableSortLabel>
            </TableCell>
            <TableCell>Dataset</TableCell>
            <TableCell>Provider</TableCell>
            <TableCell>Prompt</TableCell>
            <TableCell>
              <TableSortLabel
                active={sortField === 'passRate'}
                direction={sortField === 'passRate' ? sortOrder : 'asc'}
                onClick={() => handleSort('passRate')}
              >
                Pass Rate %
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortField === 'testPassCount'}
                direction={sortField === 'testPassCount' ? sortOrder : 'asc'}
                onClick={() => handleSort('testPassCount')}
              >
                Pass Count
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortField === 'testFailCount'}
                direction={sortField === 'testFailCount' ? sortOrder : 'asc'}
                onClick={() => handleSort('testFailCount')}
              >
                Fail Count
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortField === 'score'}
                direction={sortField === 'score' ? sortOrder : 'asc'}
                onClick={() => handleSort('score')}
              >
                Raw score
              </TableSortLabel>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedCols.map((col, index) => (
            <TableRow key={index} hover style={{ cursor: 'pointer' }}>
              <TableCell>
                <Link href={`/eval?evalId=${col.evalId}`}>{col.evalId}</Link>
              </TableCell>
              <TableCell>
                <Link href={`/datasets?id=${col.datasetId}`}>{col.datasetId?.slice(0, 6)}</Link>
              </TableCell>
              <TableCell>{col.provider}</TableCell>
              <TableCell>
                <Link href={`/prompts?id=${col.promptId}`}>[{col.promptId?.slice(0, 6)}]</Link>{' '}
                {col.raw}
              </TableCell>
              <TableCell>{calculatePassRate(col.metrics)}</TableCell>
              <TableCell>
                {col.metrics?.testPassCount == null ? '-' : `${col.metrics.testPassCount}`}
              </TableCell>
              <TableCell>
                {col.metrics?.testFailCount == null ? '-' : `${col.metrics.testFailCount}`}
              </TableCell>
              <TableCell>
                {col.metrics?.score == null ? '-' : col.metrics.score.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
