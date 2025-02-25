import React, { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import DownloadIcon from '@mui/icons-material/Download';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { visuallyHidden } from '@mui/utils';
import type { PromptMetrics } from '@promptfoo/types';
import type { StandaloneEval } from '@promptfoo/util';

type SortableField = 'evalId' | 'passRate' | 'testPassCount' | 'testFailCount' | 'score' | null;

interface FilterState {
  evalId: string;
  datasetId: string;
  provider: string;
  promptId: string;
}

interface HistoryProps {
  data: StandaloneEval[];
  isLoading: boolean;
  error: string | null;
}

// Utility function to calculate pass rate - defined at module level
const calculatePassRate = (
  metrics: { testPassCount: number; testFailCount: number } | undefined,
) => {
  if (metrics?.testPassCount != null && metrics?.testFailCount != null) {
    const total = metrics.testPassCount + metrics.testFailCount;
    return total > 0 ? ((metrics.testPassCount / total) * 100).toFixed(2) : '0.00';
  }
  return '-';
};

// Custom hook for managing filters
const useFilterData = (data: StandaloneEval[], setPage: (page: number) => void) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = React.useState<FilterState>({
    evalId: searchParams.get('evalId') || '',
    datasetId: searchParams.get('datasetId') || '',
    provider: searchParams.get('provider') || '',
    promptId: searchParams.get('promptId') || '',
  });

  const filteredData = React.useMemo(() => {
    return data.filter(
      (col) =>
        (filter.evalId ? col.evalId?.includes(filter.evalId) : true) &&
        (filter.datasetId ? col.datasetId?.startsWith(filter.datasetId) : true) &&
        (filter.provider ? col.provider?.includes(filter.provider) : true) &&
        (filter.promptId ? col.promptId?.startsWith(filter.promptId) : true),
    );
  }, [data, filter]);

  // Memoize filter options to prevent recalculation
  const filterOptions = React.useMemo(
    () => ({
      evalIdOptions: Array.from(new Set(data.map((col) => col.evalId).filter(Boolean))),
      datasetIdOptions: Array.from(new Set(data.map((col) => col.datasetId).filter(Boolean))),
      providerOptions: Array.from(new Set(data.map((col) => col.provider).filter(Boolean))),
      promptIdOptions: Array.from(new Set(data.map((col) => col.promptId).filter(Boolean))),
    }),
    [data],
  );

  const setFilterValue = (field: keyof FilterState, value: string) => {
    const newFilter = { ...filter, [field]: value };
    setFilter(newFilter);

    // Reset to page 1 when filter changes
    setPage(1);

    // Update URL params
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(field, value);
    } else {
      newParams.delete(field);
    }
    setSearchParams(newParams);
  };

  const setAllFilterValues = (newFilterValues: FilterState) => {
    setFilter(newFilterValues);

    // Reset to page 1 when filter changes
    setPage(1);

    // Update URL params
    const newParams = new URLSearchParams(searchParams);

    Object.entries(newFilterValues).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    });

    setSearchParams(newParams);
  };

  // Add a reset function to clear all filters
  const resetFilters = () => {
    const emptyFilters: FilterState = {
      evalId: '',
      datasetId: '',
      provider: '',
      promptId: '',
    };

    setFilter(emptyFilters);

    // Reset to page 1
    setPage(1);

    // Create new params object preserving pagination but removing filter params
    const newParams = new URLSearchParams(searchParams);
    Object.keys(emptyFilters).forEach((key) => {
      newParams.delete(key);
    });

    setSearchParams(newParams);
  };

  return {
    filter,
    filteredData,
    filterOptions,
    setFilterValue,
    setAllFilterValues,
    resetFilters,
  };
};

// Custom hook for sorting data
const useSortData = <T,>(data: T[], passRateCalculator: (metrics: any) => string) => {
  const [sortField, setSortField] = React.useState<SortableField>(null);
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('asc');

  const handleSort = (field: SortableField) => {
    setSortOrder((prev) => (sortField === field && prev === 'asc' ? 'desc' : 'asc'));
    setSortField(field);
  };

  const sortedData = React.useMemo(() => {
    if (!sortField) {
      return data;
    }

    return [...data].sort((a: any, b: any) => {
      if (sortField === 'passRate') {
        const aValue = Number.parseFloat(passRateCalculator(a.metrics)) || 0;
        const bValue = Number.parseFloat(passRateCalculator(b.metrics)) || 0;
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      } else if (sortField === 'evalId') {
        const aValue = a[sortField] || '';
        const bValue = b[sortField] || '';
        return sortOrder === 'asc'
          ? aValue.toString().localeCompare(bValue.toString())
          : bValue.toString().localeCompare(aValue.toString());
      } else {
        const aValue = a.metrics?.[sortField as keyof PromptMetrics] || 0;
        const bValue = b.metrics?.[sortField as keyof PromptMetrics] || 0;
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }
    });
  }, [data, sortField, sortOrder, passRateCalculator]);

  return {
    sortField,
    sortOrder,
    handleSort,
    sortedData,
  };
};

// Custom hook for pagination
const usePagination = (totalItems: number) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Get page and pageSize from URL or use defaults
  const initialPage = Number.parseInt(searchParams.get('page') || '1', 10);
  const initialPageSize = Number.parseInt(searchParams.get('pageSize') || '25', 10);

  const [page, setPageInternal] = React.useState(initialPage);
  const [rowsPerPage, setRowsPerPageInternal] = React.useState(initialPageSize);

  // When changing page, update URL
  const setPage = (newPage: number) => {
    setPageInternal(newPage);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', newPage.toString());
    setSearchParams(newParams);
  };

  // When changing page size, update URL and reset to page 1
  const setRowsPerPage = (newRowsPerPage: number) => {
    setRowsPerPageInternal(newRowsPerPage);
    setPageInternal(1);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('pageSize', newRowsPerPage.toString());
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const paginatedData = <T,>(data: T[]) => {
    return data.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  };

  const pageCount = Math.ceil(totalItems / rowsPerPage);

  return {
    page,
    setPage,
    rowsPerPage,
    setRowsPerPage,
    paginatedData,
    pageCount,
  };
};

// Loading skeleton for the table
const LoadingSkeleton = ({ rowsCount = 5 }: { rowsCount?: number }) => (
  <TableBody>
    {[...Array(rowsCount)].map((_, index) => (
      <TableRow key={index}>
        <TableCell>
          <Skeleton width={100} />
        </TableCell>
        <TableCell>
          <Skeleton width={80} />
        </TableCell>
        <TableCell>
          <Skeleton width={120} />
        </TableCell>
        <TableCell>
          <Skeleton width="90%" />
        </TableCell>
        <TableCell>
          <Skeleton width={60} />
        </TableCell>
        <TableCell>
          <Skeleton width={60} />
        </TableCell>
        <TableCell>
          <Skeleton width={80} />
        </TableCell>
        <TableCell>
          <Skeleton width={60} />
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
);

// Utility function to convert data to CSV format for export
const convertToCSV = (
  arr: StandaloneEval[],
  passRateCalculator: (metrics: any) => string,
): string => {
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
    passRateCalculator(col.metrics),
    col.metrics?.testPassCount == null ? '-' : `${col.metrics.testPassCount}`,
    col.metrics?.testFailCount == null ? '-' : `${col.metrics.testFailCount}`,
    col.metrics?.score == null ? '-' : col.metrics.score?.toFixed(2),
  ]);
  return [headers]
    .concat(rows)
    .map((it) => it.map((value) => value ?? '').join(','))
    .join('\n');
};

export default function History({ data, isLoading, error }: HistoryProps) {
  const [searchParams] = useSearchParams();

  // Use our custom hooks for pagination first
  const { page, setPage, rowsPerPage, setRowsPerPage, paginatedData, pageCount } = usePagination(0); // Initialize with 0, will be updated with filtered data length

  // Use our custom hooks for filtering and sorting
  const { filter, filteredData, filterOptions, setFilterValue, setAllFilterValues, resetFilters } =
    useFilterData(data, setPage);
  const { sortField, sortOrder, handleSort, sortedData } = useSortData(
    filteredData,
    calculatePassRate,
  );

  // Determine if any filters are active - memoized to prevent recalculations
  const hasActiveFilters = useMemo(() => {
    return Object.values(filter).some((value) => value !== '');
  }, [filter]);

  // State for export menu
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  // Memoize handlers to prevent unnecessary recreation
  const handleOpenMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setAnchorEl(null);
  }, []);

  // Handle navigation to details and resetting filters
  const handleNavigation = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      resetFilters();
    },
    [resetFilters],
  );

  // Update pagination with actual data length
  React.useEffect(() => {
    // If URL has params but they aren't reflected in the current state, reset to page 1
    const urlPage = Number.parseInt(searchParams.get('page') || '1', 10);
    if (urlPage !== page) {
      setPage(urlPage);
    }
  }, [searchParams, page, setPage]);

  // Handle export action - memoized
  const handleExport = useCallback(
    (format: 'csv' | 'json') => {
      let dataStr: string;
      if (format === 'json') {
        dataStr = JSON.stringify(sortedData);
      } else {
        dataStr = convertToCSV(sortedData, calculatePassRate);
      }

      const blob = new Blob([dataStr], { type: `text/${format};charset=utf-8;` });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `history_export.${format}`;
      link.click();
      URL.revokeObjectURL(link.href);
      setAnchorEl(null);
    },
    [sortedData, calculatePassRate],
  );

  // Get the data for the current page
  const displayData = paginatedData(sortedData);

  // Memoize the table header to prevent unnecessary re-renders
  const tableHeader = useMemo(
    () => (
      <TableHead>
        <TableRow>
          <TableCell>
            <TableSortLabel
              active={sortField === 'evalId'}
              direction={sortField === 'evalId' ? sortOrder : 'asc'}
              onClick={() => handleSort('evalId')}
            >
              Eval
              {sortField === 'evalId' ? (
                <Box component="span" sx={visuallyHidden}>
                  {sortOrder === 'desc' ? 'sorted descending' : 'sorted ascending'}
                </Box>
              ) : null}
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
              {sortField === 'passRate' ? (
                <Box component="span" sx={visuallyHidden}>
                  {sortOrder === 'desc' ? 'sorted descending' : 'sorted ascending'}
                </Box>
              ) : null}
            </TableSortLabel>
          </TableCell>
          <TableCell>
            <TableSortLabel
              active={sortField === 'testPassCount'}
              direction={sortField === 'testPassCount' ? sortOrder : 'asc'}
              onClick={() => handleSort('testPassCount')}
            >
              Pass Count
              {sortField === 'testPassCount' ? (
                <Box component="span" sx={visuallyHidden}>
                  {sortOrder === 'desc' ? 'sorted descending' : 'sorted ascending'}
                </Box>
              ) : null}
            </TableSortLabel>
          </TableCell>
          <TableCell>
            <TableSortLabel
              active={sortField === 'testFailCount'}
              direction={sortField === 'testFailCount' ? sortOrder : 'asc'}
              onClick={() => handleSort('testFailCount')}
            >
              Fail Count
              {sortField === 'testFailCount' ? (
                <Box component="span" sx={visuallyHidden}>
                  {sortOrder === 'desc' ? 'sorted descending' : 'sorted ascending'}
                </Box>
              ) : null}
            </TableSortLabel>
          </TableCell>
          <TableCell>
            <TableSortLabel
              active={sortField === 'score'}
              direction={sortField === 'score' ? sortOrder : 'asc'}
              onClick={() => handleSort('score')}
            >
              Raw score
              {sortField === 'score' ? (
                <Box component="span" sx={visuallyHidden}>
                  {sortOrder === 'desc' ? 'sorted descending' : 'sorted ascending'}
                </Box>
              ) : null}
            </TableSortLabel>
          </TableCell>
        </TableRow>
      </TableHead>
    ),
    [sortField, sortOrder, handleSort],
  );

  // Pagination controls
  const paginationControls = useMemo(() => {
    if (pageCount <= 0) {
      return null;
    }

    const pageSizeOptions = [10, 25, 50, 100];

    return (
      <Box
        sx={{
          pt: 2,
          pb: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 2,
        }}
      >
        <FormControl variant="outlined" size="small" sx={{ minWidth: 120 }}>
          <InputLabel id="rows-per-page-label">Rows per page</InputLabel>
          <Select
            labelId="rows-per-page-label"
            id="rows-per-page"
            value={rowsPerPage}
            onChange={(e) => setRowsPerPage(Number(e.target.value))}
            label="Rows per page"
          >
            {pageSizeOptions.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {sortedData.length > 0
              ? `${(page - 1) * rowsPerPage + 1}-${Math.min(page * rowsPerPage, sortedData.length)} of ${sortedData.length}`
              : '0 items'}
          </Typography>

          <Pagination
            count={pageCount}
            page={page}
            onChange={(_, value) => setPage(value)}
            color="primary"
            size="medium"
            showFirstButton
            showLastButton
          />
        </Stack>
      </Box>
    );
  }, [pageCount, page, rowsPerPage, setPage, setRowsPerPage, sortedData.length]);

  return (
    <Box sx={{ p: 2 }}>
      {/* Title and Export Button */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5" component="h2" gutterBottom={false}>
          Eval History
        </Typography>
        <Box display="flex" gap={1}>
          {hasActiveFilters && (
            <Button
              variant="outlined"
              color="secondary"
              size="small"
              onClick={resetFilters}
              aria-label="Clear all filters"
            >
              Clear Filters
            </Button>
          )}
          <Button
            variant="outlined"
            id="export-button"
            aria-controls={open ? 'export-menu' : undefined}
            aria-haspopup="true"
            aria-expanded={open ? 'true' : undefined}
            onClick={handleOpenMenu}
            startIcon={<DownloadIcon />}
            size="small"
          >
            Export
          </Button>
          <Menu
            id="export-menu"
            anchorEl={anchorEl}
            open={open}
            onClose={handleCloseMenu}
            MenuListProps={{
              'aria-labelledby': 'export-button',
            }}
          >
            <MenuItem onClick={() => handleExport('csv')}>CSV</MenuItem>
            <MenuItem onClick={() => handleExport('json')}>JSON</MenuItem>
          </Menu>
        </Box>
      </Box>

      {/* Description and Reset Filters Link */}
      <Typography variant="body2" color="text.secondary" mb={2}>
        This page shows performance metrics for recent evals.
        {hasActiveFilters && (
          <Button
            color="primary"
            size="small"
            onClick={resetFilters}
            sx={{ ml: 1, textTransform: 'none' }}
            aria-label="Reset all filters"
          >
            Reset filters
          </Button>
        )}
      </Typography>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Box display="flex" alignItems="center">
            <ErrorOutlineIcon sx={{ mr: 1 }} />
            {error}
          </Box>
        </Alert>
      )}

      {/* Filter Controls */}
      <Box display="flex" flexDirection="row" flexWrap="wrap" gap={2} my={2} position="relative">
        <Autocomplete
          options={filterOptions.evalIdOptions}
          value={filter.evalId}
          onChange={(_, newValue) => setFilterValue('evalId', newValue || '')}
          renderInput={(params) => (
            <TextField {...params} label="Eval ID" variant="outlined" size="small" fullWidth />
          )}
          sx={{ width: 220 }}
        />
        <Autocomplete
          options={filterOptions.datasetIdOptions}
          value={filter.datasetId}
          onChange={(_, newValue) => setFilterValue('datasetId', newValue || '')}
          renderInput={(params) => (
            <TextField {...params} label="Dataset ID" variant="outlined" size="small" fullWidth />
          )}
          sx={{ width: 220 }}
        />
        <Autocomplete
          options={filterOptions.providerOptions}
          value={filter.provider}
          onChange={(_, newValue) => setFilterValue('provider', newValue || '')}
          renderInput={(params) => (
            <TextField {...params} label="Provider" variant="outlined" size="small" fullWidth />
          )}
          sx={{ width: 220 }}
        />
        <Autocomplete
          options={filterOptions.promptIdOptions}
          value={filter.promptId}
          onChange={(_, newValue) => setFilterValue('promptId', newValue || '')}
          renderInput={(params) => (
            <TextField {...params} label="Prompt ID" variant="outlined" size="small" fullWidth />
          )}
          sx={{ width: 220 }}
        />
      </Box>

      {/* Table */}
      <Paper elevation={0} variant="outlined" sx={{ overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            {tableHeader}

            {isLoading ? (
              <LoadingSkeleton rowsCount={rowsPerPage} />
            ) : (
              <TableBody>
                {displayData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography variant="body2" color="text.secondary" py={3}>
                        {data.length === 0
                          ? 'No history data available.'
                          : 'No results match your filters.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  displayData.map((col, index) => (
                    <TableRow
                      key={`${col.evalId}-${col.promptId}-${index}`}
                      hover
                      onClick={() =>
                        setAllFilterValues({
                          evalId: col.evalId || '',
                          datasetId: col.datasetId || '',
                          promptId: col.promptId || '',
                          provider: col.provider || '',
                        })
                      }
                      sx={{
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.04),
                        },
                      }}
                    >
                      <TableCell>
                        <Tooltip title="View eval details">
                          <Link
                            to={`/eval?evalId=${col.evalId}`}
                            onClick={handleNavigation}
                            style={{
                              textDecoration: 'none',
                              color: 'primary.main',
                              fontWeight: 'medium',
                            }}
                          >
                            {col.evalId}
                          </Link>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {col.datasetId && (
                          <Tooltip title={`Dataset: ${col.datasetId}`}>
                            <Link
                              to={`/datasets?id=${col.datasetId}`}
                              onClick={handleNavigation}
                              style={{
                                textDecoration: 'none',
                                color: 'primary.main',
                              }}
                            >
                              {col.datasetId?.slice(0, 6)}
                            </Link>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>{col.provider}</TableCell>
                      <TableCell>
                        {col.promptId && (
                          <>
                            <Tooltip title={`Prompt: ${col.promptId}`}>
                              <Link
                                to={`/prompts?id=${col.promptId}`}
                                onClick={handleNavigation}
                                style={{
                                  textDecoration: 'none',
                                  color: 'primary.main',
                                }}
                              >
                                [{col.promptId?.slice(0, 6)}]
                              </Link>
                            </Tooltip>{' '}
                          </>
                        )}
                        <Tooltip title={col.raw || ''}>
                          <span>{col.raw}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {calculatePassRate(col.metrics) === '-' ? (
                          '-'
                        ) : (
                          <Box
                            sx={{
                              backgroundColor: (theme) => {
                                const passRateValue = Number.parseFloat(
                                  calculatePassRate(col.metrics),
                                );
                                if (passRateValue >= 80) {
                                  return alpha(theme.palette.success.main, 0.2);
                                }
                                if (passRateValue >= 50) {
                                  return alpha(theme.palette.warning.main, 0.2);
                                }
                                return alpha(theme.palette.error.main, 0.2);
                              },
                              borderRadius: 1,
                              display: 'inline-block',
                              px: 1,
                              py: 0.5,
                            }}
                          >
                            {calculatePassRate(col.metrics)}%
                          </Box>
                        )}
                      </TableCell>
                      <TableCell>
                        {col.metrics?.testPassCount == null ? '-' : `${col.metrics.testPassCount}`}
                      </TableCell>
                      <TableCell>
                        {col.metrics?.testFailCount == null ? (
                          '-'
                        ) : (
                          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                            <span>{col.metrics.testFailCount}</span>
                            {col.metrics?.testErrorCount > 0 && (
                              <Typography variant="caption" color="error">
                                + {col.metrics.testErrorCount} errors
                              </Typography>
                            )}
                          </Box>
                        )}
                      </TableCell>
                      <TableCell>
                        {col.metrics?.score == null ? '-' : col.metrics.score?.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            )}
          </Table>
        </TableContainer>

        {paginationControls}
      </Paper>
    </Box>
  );
}
