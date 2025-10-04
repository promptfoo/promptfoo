import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { callApi } from '@app/utils/api';
import { formatDataGridDate } from '@app/utils/date';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import {
  DataGrid,
  type GridCellParams,
  type GridColDef,
  GridCsvExportMenuItem,
  type GridFilterModel,
  type GridPaginationModel,
  type GridRenderCellParams,
  type GridRowSelectionModel,
  type GridSortModel,
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarDensitySelector,
  GridToolbarExportContainer,
  GridToolbarFilterButton,
  GridToolbarQuickFilter,
  type GridToolbarQuickFilterProps,
} from '@mui/x-data-grid';
import invariant from '@promptfoo/util/invariant';

// Custom hook for debouncing values
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

type Eval = {
  createdAt: number;
  datasetId: string;
  description: string | null;
  evalId: string;
  isRedteam: boolean;
  label: string;
  numTests: number;
  passRate: number;
};

// augment the props for the toolbar slot
declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    showUtilityButtons: boolean;
    deletionEnabled: boolean;
    focusQuickFilterOnMount: boolean;
    selectedCount: number;
    onDeleteSelected: () => void;
  }
}

const GridToolbarExport = () => (
  <GridToolbarExportContainer>
    <GridCsvExportMenuItem />
  </GridToolbarExportContainer>
);

const QuickFilter = forwardRef<HTMLInputElement, GridToolbarQuickFilterProps>((props, ref) => {
  const theme = useTheme();
  return (
    <GridToolbarQuickFilter
      {...props}
      inputRef={ref}
      sx={{
        '& .MuiInputBase-root': {
          borderRadius: 2,
          backgroundColor: theme.palette.background.paper,
        },
      }}
    />
  );
});

QuickFilter.displayName = 'QuickFilter';

function CustomToolbar({
  showUtilityButtons,
  deletionEnabled,
  focusQuickFilterOnMount,
  selectedCount,
  onDeleteSelected,
}: {
  showUtilityButtons: boolean;
  deletionEnabled: boolean;
  focusQuickFilterOnMount: boolean;
  selectedCount: number;
  onDeleteSelected: () => void;
}) {
  const theme = useTheme();
  const quickFilterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusQuickFilterOnMount && quickFilterRef.current) {
      quickFilterRef.current.focus();
    }
  }, [focusQuickFilterOnMount]);

  return (
    <GridToolbarContainer sx={{ p: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
      {(showUtilityButtons || selectedCount > 0) && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          {showUtilityButtons && (
            <>
              <GridToolbarColumnsButton />
              <GridToolbarFilterButton />
              <GridToolbarDensitySelector />
              <GridToolbarExport />
            </>
          )}
          {deletionEnabled && selectedCount > 0 && (
            <Button
              color="error"
              variant="outlined"
              size="small"
              onClick={onDeleteSelected}
              data-testid="delete-selected-button"
              startIcon={<DeleteIcon />}
              sx={{ border: 0 }}
            >
              Delete ({selectedCount})
            </Button>
          )}
        </Box>
      )}
      <Box sx={{ flexGrow: 1 }} />
      <QuickFilter ref={quickFilterRef} />
    </GridToolbarContainer>
  );
}

/**
 * Displays a list of evals.
 *
 * @param onEvalSelected - Callback to handle when an eval is selected (via clicking on its id cell).
 * @param focusedEvalId - An optional ID of the eval to focus when the grid loads.
 * @param filterByDatasetId - Whether to filter the evals by dataset ID. If true, will only show evals with the
 * same dataset ID as the focused eval.
 */
export default function EvalsDataGrid({
  onEvalSelected,
  focusedEvalId,
  showUtilityButtons = false,
  filterByDatasetId = false,
  focusQuickFilterOnMount = false,
  deletionEnabled = false,
}: {
  onEvalSelected: (evalId: string) => void;
  focusedEvalId?: string;
  showUtilityButtons?: boolean;
  filterByDatasetId?: boolean;
  focusQuickFilterOnMount?: boolean;
  deletionEnabled?: boolean;
}) {
  if (filterByDatasetId) {
    invariant(focusedEvalId, 'focusedEvalId is required when filterByDatasetId is true');
  }

  const [evals, setEvals] = useState<Eval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Server-side state management
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });

  const [sortModel, setSortModel] = useState<GridSortModel>([{ field: 'createdAt', sort: 'desc' }]);

  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });
  const quickFilterValues = filterModel.quickFilterValues || [];
  const searchText = quickFilterValues.join(' ');
  const debouncedSearchText = useDebounce(searchText, 300);

  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>(
    focusedEvalId ? [focusedEvalId] : [],
  );

  /**
   * Fetch evals from the API with server-side pagination.
   */
  const fetchEvals = useCallback(
    async (signal: AbortSignal) => {
      try {
        setIsLoading(true);

        // Build query parameters
        const params = new URLSearchParams();

        // Pagination parameters
        params.set('limit', paginationModel.pageSize.toString());
        params.set('offset', (paginationModel.page * paginationModel.pageSize).toString());

        // Search parameter
        if (debouncedSearchText) {
          params.set('search', debouncedSearchText);
        }

        // Sort parameters
        if (sortModel.length > 0 && sortModel[0].sort) {
          params.set('sort', sortModel[0].field as string);
          params.set('order', sortModel[0].sort);
        }

        // Dataset filtering via focusedEvalId - handled server-side
        if (filterByDatasetId && focusedEvalId) {
          params.set('focusedEvalId', focusedEvalId);
        }

        const response = await callApi(`/results?${params.toString()}`, {
          cache: 'no-store',
          signal,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch evals');
        }

        const body = (await response.json()) as {
          data: Eval[];
          total: number;
          limit: number;
          offset: number;
        };

        setEvals(body.data);
        setTotal(body.total);
        setError(null);
      } catch (error) {
        // Don't set error state if the request was aborted
        if ((error as Error).name !== 'AbortError') {
          setError(error as Error);
        }
      } finally {
        // Don't set loading to false if the request was aborted
        if (signal && !signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [paginationModel, sortModel, debouncedSearchText, filterByDatasetId, focusedEvalId],
  );

  // Track location changes for navigation-based refetching
  const location = useLocation();

  useEffect(() => {
    // Create AbortController for this fetch
    const abortController = new AbortController();

    // Fetch evals whenever pagination, sort, or search changes
    fetchEvals(abortController.signal);

    // Cleanup: abort any in-flight request when dependencies change or component unmounts
    return () => {
      abortController.abort();
    };
  }, [fetchEvals, location]); // Include location to trigger refetch on navigation

  // Reset to first page when search or sort changes (only if not already on page 0)
  useEffect(() => {
    setPaginationModel((prev) => (prev.page !== 0 ? { ...prev, page: 0 } : prev));
  }, [debouncedSearchText, sortModel]);

  /**
   * For server-side pagination, we use the rows as-is from the server.
   * All filtering (including dataset filtering) is handled server-side.
   */
  const rows = useMemo(() => evals, [evals]);

  const hasRedteamEvals = useMemo(() => evals.some(({ isRedteam }) => !!isRedteam), [evals]);

  const handleCellClick = (params: GridCellParams<Eval>) => onEvalSelected(params.row.evalId);

  /**
   * Handles the deletion of selected evals.
   * @returns A promise that resolves when the evals are deleted.
   */
  const handleDeleteSelected = () => {
    if (rowSelectionModel.length === 0) {
      return;
    }
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      setIsLoading(true);
      const res = await callApi(`/eval`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: rowSelectionModel }),
      });

      if (!res.ok) {
        throw new Error('Failed to delete evals');
      }

      setEvals((prev) => prev.filter((e) => !rowSelectionModel.includes(e.evalId)));
      setRowSelectionModel([]);
      setConfirmDeleteOpen(false);
    } catch (error) {
      console.error('Failed to delete evals:', error);
      alert('Failed to delete evals');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDeleteOpen(false);
  };

  const columns: GridColDef<Eval>[] = useMemo(
    () =>
      [
        {
          field: 'evalId',
          headerName: 'ID',
          flex: 0.5,
          minWidth: 120,
          renderCell: (params: GridRenderCellParams<Eval>) =>
            params.row.evalId === focusedEvalId ? (
              params.row.evalId
            ) : (
              <Link
                href={`/eval/${params.row.evalId}`}
                /**
                 * Prevent the default behavior of the link, which is to navigate to the href.
                 * Instead, we want to call the onEvalSelected callback which may or may not navigate.
                 */
                onClick={(e) => {
                  e.preventDefault();
                  onEvalSelected(params.row.evalId);
                  return false;
                }}
                sx={{
                  textDecoration: 'none',
                  color: 'primary.main',
                  fontFamily: 'monospace',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                {params.row.evalId}
              </Link>
            ),
        },
        {
          field: 'createdAt',
          headerName: 'Created',
          flex: 0.9,
          valueGetter: (value: Eval['createdAt'], row: Eval) => {
            return new Date(value);
          },
          valueFormatter: (value: Eval['createdAt']) => formatDataGridDate(value),
        },
        // Only show the redteam column if there are redteam evals.
        ...(hasRedteamEvals
          ? [
              {
                field: 'isRedteam',
                headerName: 'Type',
                flex: 0.5,
                type: 'singleSelect',
                valueOptions: [
                  { value: true, label: 'Red Team' },
                  { value: false, label: 'Eval' },
                ],
                valueGetter: (value: Eval['isRedteam']) => Boolean(value),
                renderCell: (params: GridRenderCellParams<Eval>) => {
                  const isRedteam = params.value as Eval['isRedteam'];
                  const displayType = isRedteam ? 'Red Team' : 'Eval';

                  return (
                    <Chip
                      label={displayType}
                      size="small"
                      variant="outlined"
                      sx={(theme) => ({
                        borderColor: isRedteam
                          ? theme.palette.error.light
                          : theme.palette.mode === 'dark'
                            ? theme.palette.grey[600]
                            : theme.palette.text.disabled,
                        color: isRedteam
                          ? theme.palette.error.main
                          : theme.palette.mode === 'dark'
                            ? theme.palette.grey[300]
                            : theme.palette.text.secondary,
                        bgcolor: isRedteam
                          ? alpha(theme.palette.error.main, 0.1)
                          : theme.palette.mode === 'dark'
                            ? theme.palette.grey[800]
                            : theme.palette.grey[50],
                        fontWeight: 500,
                        '& .MuiChip-label': {
                          px: 1.5,
                        },
                      })}
                    />
                  );
                },
                cellClassName: 'dg-cursor-pointer',
              },
            ]
          : []),
        {
          field: 'description',
          headerName: 'Description',
          flex: 2,
          valueGetter: (value: Eval['description'], row: Eval) => value ?? row.label,
        },
        {
          field: 'passRate',
          headerName: 'Pass Rate',
          flex: 0.5,
          type: 'number',
          sortable: false,
          renderCell: (params: GridRenderCellParams<Eval>) => (
            <>
              <Typography
                variant="body2"
                color={
                  params.value >= 90
                    ? 'success.main'
                    : params.value >= 60
                      ? 'warning.main'
                      : 'error.main'
                }
                sx={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  // `type: number` gets overwritten by flex; manually justify content.
                  justifyContent: 'end',
                }}
              >
                {params.value.toFixed(2)}%
              </Typography>
            </>
          ),
        },
        {
          field: 'numTests',
          headerName: '# Tests',
          type: 'number',
          flex: 0.5,
          sortable: false,
        },
      ].filter(Boolean) as GridColDef<Eval>[],
    [focusedEvalId, onEvalSelected, hasRedteamEvals],
  );

  return (
    <>
      {/* Evals data grid */}
      <Paper elevation={2} sx={{ height: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.evalId}
          checkboxSelection={deletionEnabled}
          slots={{
            toolbar: CustomToolbar,
            loadingOverlay: () => (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  gap: 2,
                }}
              >
                <CircularProgress />
                <Typography variant="body2" color="text.secondary">
                  Loading evaluations...
                </Typography>
              </Box>
            ),
            noRowsOverlay: () => (
              <Box
                sx={{
                  textAlign: 'center',
                  color: 'text.secondary',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  p: 3,
                }}
              >
                {error ? (
                  <>
                    <Box sx={{ fontSize: '2rem', mb: 2 }}>⚠️</Box>
                    <Typography variant="h6" gutterBottom color="error">
                      Error loading evals
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {error.message}
                    </Typography>
                  </>
                ) : (
                  <>
                    <Box sx={{ fontSize: '2rem', mb: 2 }}>🔍</Box>
                    <Typography variant="h6" gutterBottom>
                      No evals found
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Try adjusting your search or create a new evaluation
                    </Typography>
                  </>
                )}
              </Box>
            ),
          }}
          // Server-side pagination and sorting
          paginationMode="server"
          sortingMode="server"
          filterMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          rowCount={total}
          // Filter model for server-side search
          filterModel={filterModel}
          onFilterModelChange={setFilterModel}
          slotProps={{
            toolbar: {
              showUtilityButtons,
              deletionEnabled,
              focusQuickFilterOnMount,
              selectedCount: rowSelectionModel.length,
              onDeleteSelected: handleDeleteSelected,
            },
          }}
          onCellClick={(params) => {
            if (params.id !== focusedEvalId && params.field !== '__check__') {
              handleCellClick(params);
            }
          }}
          getRowClassName={(params) => (params.id === focusedEvalId ? 'focused-row' : '')}
          sx={{
            border: 'none',
            '& .MuiDataGrid-row': {
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
              '&:hover': {
                backgroundColor: 'action.hover',
              },
            },
            '& .MuiDataGrid-row--disabled': {
              cursor: 'default',
              opacity: 0.7,
              pointerEvents: 'none',
            },
            '& .focused-row': {
              backgroundColor: 'action.selected',
              cursor: 'default',
              '&:hover': {
                backgroundColor: 'action.selected',
              },
            },
            '& .MuiDataGrid-cell': {
              borderColor: 'divider',
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: 'background.default',
              borderColor: 'divider',
            },
            '& .MuiDataGrid-selectedRow': {
              backgroundColor: 'action.selected',
            },
            '--DataGrid-overlayHeight': '300px',
          }}
          onRowSelectionModelChange={setRowSelectionModel}
          rowSelectionModel={rowSelectionModel}
          pageSizeOptions={[10, 25, 50, 100]}
          isRowSelectable={(params) => params.id !== focusedEvalId}
        />
      </Paper>

      {/* Delete confirmation dialog */}
      <Dialog open={confirmDeleteOpen} onClose={handleCancelDelete}>
        <DialogTitle>
          Delete {rowSelectionModel.length} eval{rowSelectionModel.length === 1 ? '' : 's'}?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the selected eval
            {rowSelectionModel.length === 1 ? '' : 's'}? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete} variant="outlined">
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            startIcon={<DeleteIcon />}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
