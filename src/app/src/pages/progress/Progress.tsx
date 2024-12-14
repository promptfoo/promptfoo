import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { callApi } from '@app/utils/api';
import DownloadIcon from '@mui/icons-material/Download';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import TextField from '@mui/material/TextField';
import type { PromptMetrics } from '@promptfoo/types';
import type { StandaloneEval } from '@promptfoo/util';

export default function Cols() {
  const [cols, setCols] = useState<StandaloneEval[]>([]);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [page, setPage] = React.useState(1);
  const [filter, setFilter] = useState({ evalId: '', datasetId: '', provider: '', promptId: '' });
  const [isLoading, setIsLoading] = useState(true);

  const rowsPerPage = 25;
  const open = Boolean(anchorEl);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const response = await callApi(`/progress`);
        const data = await response.json();
        if (data && data.data) {
          setCols(data.data);
        }
      } finally {
        setIsLoading(false);
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
      col.metrics?.testErrorCount == null ? '-' : `${col.metrics.testErrorCount}`,
      col.metrics?.score == null ? '-' : col.metrics.score?.toFixed(2),
    ]);
    return [headers]
      .concat(rows)
      .map((it) => it.map((value) => value ?? '').join(','))
      .join('\n');
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

  const getSortedValues = (sortOrder: string, a: number, b: number): number => {
    return sortOrder === 'asc' ? a - b : b - a;
  };

  const getValue = (metrics: PromptMetrics | undefined, sortField: string): number => {
    if (metrics) {
      return metrics[sortField as keyof PromptMetrics] as number;
    }
    return 0;
  };

  const filteredCols = React.useMemo(() => {
    return cols.filter(
      (col) =>
        (filter.evalId ? col.evalId?.includes(filter.evalId) : true) &&
        (filter.datasetId ? col.datasetId?.startsWith(filter.datasetId) : true) &&
        (filter.provider ? col.provider?.includes(filter.provider) : true) &&
        (filter.promptId ? col.promptId?.startsWith(filter.promptId) : true),
    );
  }, [cols, filter]);

  const sortedCols = React.useMemo(() => {
    return filteredCols.sort((a, b) => {
      if (!sortField) {
        return 0;
      }
      if (sortField === 'passRate') {
        const aValue = Number.parseFloat(calculatePassRate(a.metrics));
        const bValue = Number.parseFloat(calculatePassRate(b.metrics));
        return getSortedValues(sortOrder, aValue, bValue);
      } else if (sortField === 'evalId') {
        // Ensure sortField is a key of StandaloneEval
        if (sortField in a && sortField in b) {
          const aValue = a[sortField as keyof StandaloneEval] || '';
          const bValue = b[sortField as keyof StandaloneEval] || '';
          return sortOrder === 'asc'
            ? aValue.toString().localeCompare(bValue.toString())
            : bValue.toString().localeCompare(aValue.toString());
        }
        return 0;
      } else {
        const aValue = getValue(a.metrics, sortField);
        const bValue = getValue(b.metrics, sortField);
        return getSortedValues(sortOrder, aValue, bValue);
      }
    });
  }, [filteredCols, sortField, sortOrder]);

  const evalIdOptions = React.useMemo(
    () => Array.from(new Set(cols.map((col) => col.evalId))),
    [cols],
  );
  const datasetIdOptions = React.useMemo(
    () => Array.from(new Set(cols.map((col) => col.datasetId))),
    [cols],
  );
  const providerOptions = React.useMemo(
    () => Array.from(new Set(cols.map((col) => col.provider))),
    [cols],
  );
  const promptIdOptions = React.useMemo(
    () => Array.from(new Set(cols.map((col) => col.promptId))),
    [cols],
  );

  return (
    <Box paddingX={2}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <h2>Eval History</h2>
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
      <Box>This page shows performance metrics for recent evals.</Box>
      <Box display="flex" flexDirection="row" gap={2} my={2}>
        <Autocomplete
          options={evalIdOptions}
          value={filter.evalId}
          onChange={(event, newValue) => {
            setFilter({ ...filter, evalId: newValue || '' });
          }}
          renderInput={(params) => (
            <TextField {...params} label="Eval ID" variant="outlined" size="small" fullWidth />
          )}
          sx={{ width: 220 }}
        />
        <Autocomplete
          options={datasetIdOptions}
          value={filter.datasetId}
          onChange={(event, newValue) => {
            setFilter({ ...filter, datasetId: newValue || '' });
          }}
          renderInput={(params) => (
            <TextField {...params} label="Dataset ID" variant="outlined" size="small" fullWidth />
          )}
          sx={{ width: 220 }}
        />
        <Autocomplete
          options={providerOptions}
          value={filter.provider}
          onChange={(event, newValue) => {
            setFilter({ ...filter, provider: newValue || '' });
          }}
          renderInput={(params) => (
            <TextField {...params} label="Provider" variant="outlined" size="small" fullWidth />
          )}
          sx={{ width: 220 }}
        />
        <Autocomplete
          options={promptIdOptions}
          value={filter.promptId}
          onChange={(event, newValue) => {
            setFilter({ ...filter, promptId: newValue || '' });
          }}
          renderInput={(params) => (
            <TextField {...params} label="Prompt ID" variant="outlined" size="small" fullWidth />
          )}
          sx={{ width: 220 }}
        />
      </Box>
      <TableContainer>
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
            {sortedCols.slice((page - 1) * rowsPerPage, page * rowsPerPage).map((col, index) => (
              <TableRow
                key={index}
                hover
                onClick={() =>
                  setFilter({
                    ...filter,
                    evalId: col.evalId,
                    datasetId: col.datasetId || '',
                    promptId: col.promptId || '',
                    provider: col.provider,
                  })
                }
              >
                <TableCell>
                  <Link to={`/eval?evalId=${col.evalId}`} onClick={(e) => e.stopPropagation()}>
                    {col.evalId}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link to={`/datasets?id=${col.datasetId}`} onClick={(e) => e.stopPropagation()}>
                    {col.datasetId?.slice(0, 6)}
                  </Link>
                </TableCell>
                <TableCell>{col.provider}</TableCell>
                <TableCell>
                  <Link to={`/prompts?id=${col.promptId}`} onClick={(e) => e.stopPropagation()}>
                    [{col.promptId?.slice(0, 6)}]
                  </Link>{' '}
                  {col.raw}
                </TableCell>
                <TableCell>{calculatePassRate(col.metrics)}</TableCell>
                <TableCell>
                  {col.metrics?.testPassCount == null ? '-' : `${col.metrics.testPassCount}`}
                </TableCell>
                <TableCell>
                  {col.metrics?.testFailCount == null
                    ? '- ' +
                      (col.metrics?.testErrorCount && col.metrics.testErrorCount > 0
                        ? `+ ${col.metrics.testErrorCount} errors`
                        : '')
                    : `${col.metrics.testFailCount} ` +
                      (col.metrics?.testErrorCount ? `+ ${col.metrics.testErrorCount} errors` : '')}
                </TableCell>
                <TableCell>
                  {col.metrics?.score == null ? '-' : col.metrics.score?.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {Math.ceil(filteredCols.length / rowsPerPage) > 1 && (
          <Pagination
            count={Math.ceil(sortedCols.length / rowsPerPage)}
            page={page}
            onChange={(event, value) => setPage(value)}
            sx={{ pt: 2, pb: 4, display: 'flex', justifyContent: 'center' }}
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
