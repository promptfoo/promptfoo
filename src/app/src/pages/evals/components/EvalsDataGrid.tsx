import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import {
  DataGrid,
  type GridCellParams,
  type GridColDef,
  GridCsvExportMenuItem,
  type GridRenderCellParams,
  type GridRowSelectionModel,
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarDensitySelector,
  GridToolbarExportContainer,
  GridToolbarFilterButton,
  GridToolbarQuickFilter,
  type GridToolbarQuickFilterProps,
} from '@mui/x-data-grid';
import invariant from '@promptfoo/util/invariant';
import { useLocation } from 'react-router-dom';

type Eval = {
  createdAt: number;
  datasetId: string;
  description: string | null;
  evalId: string;
  isRedteam: number;
  label: string;
  numTests: number;
  passRate: number;
};

// augment the props for the toolbar slot
declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    showUtilityButtons: boolean;
    focusQuickFilterOnMount: boolean;
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
  focusQuickFilterOnMount,
}: {
  showUtilityButtons: boolean;
  focusQuickFilterOnMount: boolean;
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
      {showUtilityButtons && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <GridToolbarColumnsButton />
          <GridToolbarFilterButton />
          <GridToolbarDensitySelector />
          <GridToolbarExport />
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
}: {
  onEvalSelected: (evalId: string) => void;
  focusedEvalId?: string;
  showUtilityButtons?: boolean;
  filterByDatasetId?: boolean;
  focusQuickFilterOnMount?: boolean;
}) {
  if (filterByDatasetId) {
    invariant(focusedEvalId, 'focusedEvalId is required when filterByDatasetId is true');
  }

  const [evals, setEvals] = useState<Eval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>(
    focusedEvalId ? [focusedEvalId] : [],
  );

  /**
   * Fetch evals from the API.
   */
  const fetchEvals = async (signal: AbortSignal) => {
    try {
      setIsLoading(true);
      const response = await callApi('/results', { cache: 'no-store', signal });
      if (!response.ok) {
        throw new Error('Failed to fetch evals');
      }
      const body = (await response.json()) as { data: Eval[] };
      setEvals(body.data);
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
  };

  // Use React Router's location to detect navigation
  const location = useLocation();

  useEffect(() => {
    // Create AbortController for this fetch
    const abortController = new AbortController();

    // Fetch evals whenever we navigate to this page
    fetchEvals(abortController.signal);

    // Cleanup: abort any in-flight request when location changes or component unmounts
    return () => {
      abortController.abort();
    };
  }, [location.pathname, location.search]); // Refetch when the pathname or query params change

  /**
   * Construct dataset rows:
   * 1. Filter out the focused eval from the list.
   * 2. Filter by dataset ID if enabled.
   */
  const rows = useMemo(() => {
    let rows_ = evals;

    if (focusedEvalId && rows_.length > 0) {
      // Filter out the focused eval from the list; first find it for downstream filtering.
      const focusedEval = rows_.find(({ evalId }: Eval) => evalId === focusedEvalId);
      invariant(focusedEval, 'focusedEvalId is not a valid eval ID');

      // Filter by dataset ID if enabled
      if (filterByDatasetId) {
        rows_ = rows_.filter(({ datasetId }: Eval) => datasetId === focusedEval.datasetId);
      }
    }

    return rows_;
  }, [evals, filterByDatasetId, focusedEvalId]);

  const hasRedteamEvals = useMemo(() => {
    return evals.some(({ isRedteam }) => isRedteam === 1);
  }, [evals]);

  const handleCellClick = (params: GridCellParams<Eval>) => onEvalSelected(params.row.evalId);

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
          valueFormatter: (value: Eval['createdAt']) => new Date(value).toLocaleString(),
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
                valueGetter: (value: Eval['isRedteam'], row: Eval) => value === 1,
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
        },
      ].filter(Boolean) as GridColDef<Eval>[],
    [focusedEvalId, onEvalSelected, hasRedteamEvals],
  );

  return (
    <Paper elevation={2} sx={{ height: '100%' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        loading={isLoading}
        getRowId={(row) => row.evalId}
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
        slotProps={{
          toolbar: {
            showUtilityButtons,
            focusQuickFilterOnMount,
          },
        }}
        onCellClick={(params) => {
          if (params.id !== focusedEvalId) {
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
        initialState={{
          sorting: {
            sortModel: [{ field: 'createdAt', sort: 'desc' }],
          },
          pagination: {
            paginationModel: { pageSize: 50 },
          },
        }}
        pageSizeOptions={[10, 25, 50, 100]}
        isRowSelectable={(params) => params.id !== focusedEvalId}
      />
    </Paper>
  );
}
