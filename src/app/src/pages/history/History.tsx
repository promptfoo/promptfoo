import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
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

interface HistoryProps {
  data: StandaloneEval[];
  isLoading: boolean;
  error: string | null;
  showDatasetColumn?: boolean;
}

interface FilterState {
  evalId: string;
  datasetId: string;
  provider: string;
  promptId: string;
}

interface SortState {
  field: string | null;
  order: 'asc' | 'desc';
}

const calculatePassRate = (
  metrics: { testPassCount: number; testFailCount: number } | undefined,
): string => {
  if (metrics?.testPassCount != null && metrics?.testFailCount != null) {
    return (
      (metrics.testPassCount / (metrics.testPassCount + metrics.testFailCount)) *
      100
    ).toFixed(2);
  }
  return '-';
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

const ExportButton = ({ onExport }: { onExport: (format: string) => void }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleExportFormat = (format: string) => {
    onExport(format);
    handleClose();
  };

  return (
    <>
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
        <MenuItem onClick={() => handleExportFormat('csv')}>CSV</MenuItem>
        <MenuItem onClick={() => handleExportFormat('json')}>JSON</MenuItem>
      </Menu>
    </>
  );
};

const FilterBar = ({
  filter,
  onFilterChange,
  evalIdOptions,
  datasetIdOptions,
  providerOptions,
  promptIdOptions,
  showDatasetColumn,
}: {
  filter: FilterState;
  onFilterChange: (newFilter: FilterState) => void;
  evalIdOptions: string[];
  datasetIdOptions: string[];
  providerOptions: string[];
  promptIdOptions: string[];
  showDatasetColumn: boolean;
}) => {
  const handleFilterChange = (key: keyof FilterState, value: string) => {
    onFilterChange({ ...filter, [key]: value });
  };

  return (
    <Box display="flex" flexDirection="row" gap={2} my={2}>
      <Autocomplete
        options={evalIdOptions}
        value={filter.evalId}
        onChange={(event, newValue) => handleFilterChange('evalId', newValue || '')}
        renderInput={(params) => (
          <TextField {...params} label="Eval ID" variant="outlined" size="small" fullWidth />
        )}
        sx={{ width: 220 }}
      />
      {showDatasetColumn && (
        <Autocomplete
          options={datasetIdOptions}
          value={filter.datasetId}
          onChange={(event, newValue) => handleFilterChange('datasetId', newValue || '')}
          renderInput={(params) => (
            <TextField {...params} label="Dataset ID" variant="outlined" size="small" fullWidth />
          )}
          sx={{ width: 220 }}
        />
      )}
      <Autocomplete
        options={providerOptions}
        value={filter.provider}
        onChange={(event, newValue) => handleFilterChange('provider', newValue || '')}
        renderInput={(params) => (
          <TextField {...params} label="Provider" variant="outlined" size="small" fullWidth />
        )}
        sx={{ width: 220 }}
      />
      <Autocomplete
        options={promptIdOptions}
        value={filter.promptId}
        onChange={(event, newValue) => handleFilterChange('promptId', newValue || '')}
        renderInput={(params) => (
          <TextField {...params} label="Prompt ID" variant="outlined" size="small" fullWidth />
        )}
        sx={{ width: 220 }}
      />
    </Box>
  );
};

const HistoryTable = ({
  cols,
  sortState,
  onSort,
  page,
  rowsPerPage,
  showDatasetColumn,
  onRowClick,
}: {
  cols: StandaloneEval[];
  sortState: SortState;
  onSort: (field: string) => void;
  page: number;
  rowsPerPage: number;
  showDatasetColumn: boolean;
  onRowClick: (col: StandaloneEval) => void;
}) => {
  const { field: sortField, order: sortOrder } = sortState;

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>
            <TableSortLabel
              active={sortField === 'evalId'}
              direction={sortField === 'evalId' ? sortOrder : 'asc'}
              onClick={() => onSort('evalId')}
            >
              Eval
            </TableSortLabel>
          </TableCell>
          {showDatasetColumn && <TableCell>Dataset</TableCell>}
          <TableCell>Provider</TableCell>
          <TableCell>Prompt</TableCell>
          <TableCell>
            <TableSortLabel
              active={sortField === 'passRate'}
              direction={sortField === 'passRate' ? sortOrder : 'asc'}
              onClick={() => onSort('passRate')}
            >
              Pass Rate %
            </TableSortLabel>
          </TableCell>
          <TableCell>
            <TableSortLabel
              active={sortField === 'testPassCount'}
              direction={sortField === 'testPassCount' ? sortOrder : 'asc'}
              onClick={() => onSort('testPassCount')}
            >
              Pass Count
            </TableSortLabel>
          </TableCell>
          <TableCell>
            <TableSortLabel
              active={sortField === 'testFailCount'}
              direction={sortField === 'testFailCount' ? sortOrder : 'asc'}
              onClick={() => onSort('testFailCount')}
            >
              Fail Count
            </TableSortLabel>
          </TableCell>
          <TableCell>
            <TableSortLabel
              active={sortField === 'score'}
              direction={sortField === 'score' ? sortOrder : 'asc'}
              onClick={() => onSort('score')}
            >
              Raw score
            </TableSortLabel>
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {cols.slice((page - 1) * rowsPerPage, page * rowsPerPage).map((col, index) => (
          <TableRow key={index} hover onClick={() => onRowClick(col)}>
            <TableCell>
              <Link to={`/eval?evalId=${col.evalId || ''}`} onClick={(e) => e.stopPropagation()}>
                {col.evalId}
              </Link>
            </TableCell>
            {showDatasetColumn && (
              <TableCell>
                <Link
                  to={`/datasets?id=${col.datasetId || ''}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {col.datasetId?.slice(0, 6)}
                </Link>
              </TableCell>
            )}
            <TableCell>{col.provider}</TableCell>
            <TableCell>
              <Link to={`/prompts?id=${col.promptId || ''}`} onClick={(e) => e.stopPropagation()}>
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
  );
};

export default function History({
  data,
  isLoading,
  error,
  showDatasetColumn = true,
}: HistoryProps) {
  const [sortState, setSortState] = useState<SortState>({ field: null, order: 'asc' });
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterState>({
    evalId: '',
    datasetId: '',
    provider: '',
    promptId: '',
  });

  const rowsPerPage = 25;

  useEffect(() => {
    if (!showDatasetColumn) {
      setFilter((prev) => ({ ...prev, datasetId: '' }));
    }
  }, [showDatasetColumn]);

  const handleSort = useCallback((field: string) => {
    setSortState((prev) => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const handleRowClick = useCallback(
    (col: StandaloneEval) => {
      const newFilter = {
        evalId: col.evalId,
        promptId: col.promptId || '',
        provider: col.provider,
        datasetId: '',
      };

      if (showDatasetColumn) {
        newFilter.datasetId = col.datasetId || '';
      }

      setFilter(newFilter);
    },
    [showDatasetColumn],
  );

  const convertToCSV = useCallback(
    (arr: StandaloneEval[]) => {
      const headers = [
        'Eval',
        ...(showDatasetColumn ? ['Dataset'] : []),
        'Provider',
        'Prompt',
        'Pass Rate %',
        'Pass Count',
        'Fail Count',
        'Raw score',
      ];

      const rows = arr.map((col) => {
        const baseRow = [col.evalId ?? ''];

        if (showDatasetColumn) {
          baseRow.push(col.datasetId?.slice(0, 6) ?? '');
        }

        baseRow.push(
          col.provider ?? '',
          (col.promptId?.slice(0, 6) ?? '') + ' ' + (col.raw ?? ''),
          calculatePassRate(col.metrics),
          col.metrics?.testPassCount == null ? '-' : `${col.metrics.testPassCount}`,
          col.metrics?.testFailCount == null ? '-' : `${col.metrics.testFailCount}`,
          col.metrics?.testErrorCount == null ? '-' : `${col.metrics.testErrorCount}`,
          col.metrics?.score == null ? '-' : col.metrics.score?.toFixed(2),
        );

        return baseRow;
      });

      return [headers]
        .concat(rows)
        .map((it) => it.map((value) => value ?? '').join(','))
        .join('\n');
    },
    [showDatasetColumn],
  );

  const handleExport = useCallback(
    (format: string) => {
      const dataStr = format === 'json' ? JSON.stringify(data) : convertToCSV(data);
      const blob = new Blob([dataStr], { type: `text/${format};charset=utf-8;` });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `cols_export.${format}`;
      link.click();
      URL.revokeObjectURL(link.href);
    },
    [data, convertToCSV],
  );

  const filteredCols = useMemo(() => {
    return data.filter(
      (col) =>
        (filter.evalId ? col.evalId?.includes(filter.evalId) : true) &&
        (filter.datasetId ? col.datasetId?.startsWith(filter.datasetId) : true) &&
        (filter.provider ? col.provider?.includes(filter.provider) : true) &&
        (filter.promptId ? col.promptId?.startsWith(filter.promptId) : true),
    );
  }, [data, filter]);

  const sortedCols = useMemo(() => {
    const { field: sortField, order: sortOrder } = sortState;

    if (!sortField) {
      return filteredCols;
    }

    return [...filteredCols].sort((a, b) => {
      if (sortField === 'passRate') {
        const aValue = Number.parseFloat(calculatePassRate(a.metrics));
        const bValue = Number.parseFloat(calculatePassRate(b.metrics));
        return getSortedValues(sortOrder, aValue, bValue);
      } else if (sortField === 'evalId') {
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
  }, [filteredCols, sortState]);

  const evalIdOptions = useMemo(() => {
    const options = data
      .map((col) => col.evalId)
      .filter((id): id is string => id !== null && id !== undefined);
    return Array.from(new Set(options));
  }, [data]);

  const datasetIdOptions = useMemo(() => {
    const options = data
      .map((col) => col.datasetId)
      .filter((id): id is string => id !== null && id !== undefined);
    return Array.from(new Set(options));
  }, [data]);

  const providerOptions = useMemo(() => {
    const options = data
      .map((col) => col.provider)
      .filter((provider): provider is string => provider !== null && provider !== undefined);
    return Array.from(new Set(options));
  }, [data]);

  const promptIdOptions = useMemo(() => {
    const options = data
      .map((col) => col.promptId)
      .filter((id): id is string => id !== null && id !== undefined);
    return Array.from(new Set(options));
  }, [data]);

  // Render
  return (
    <Box paddingX={2}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <h2>Eval History</h2>
        <ExportButton onExport={handleExport} />
      </Box>

      <Box>This page shows performance metrics for recent evals.</Box>

      <FilterBar
        filter={filter}
        onFilterChange={setFilter}
        evalIdOptions={evalIdOptions}
        datasetIdOptions={datasetIdOptions}
        providerOptions={providerOptions}
        promptIdOptions={promptIdOptions}
        showDatasetColumn={showDatasetColumn}
      />

      <TableContainer>
        <HistoryTable
          cols={sortedCols}
          sortState={sortState}
          onSort={handleSort}
          page={page}
          rowsPerPage={rowsPerPage}
          showDatasetColumn={showDatasetColumn}
          onRowClick={handleRowClick}
        />

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
