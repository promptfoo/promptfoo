import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
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
    onLoadMore?: () => void;
    hasMore?: boolean;
    isLoadingMore?: boolean;
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
  onLoadMore,
  hasMore,
  isLoadingMore,
}: {
  showUtilityButtons: boolean;
  focusQuickFilterOnMount: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
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
      {hasMore && onLoadMore && (
        <Button 
          onClick={onLoadMore} 
          disabled={isLoadingMore}
          size="small"
          sx={{ ml: 1 }}
        >
          {isLoadingMore ? <CircularProgress size={16} /> : 'Load More'}
        </Button>
      )}
    </GridToolbarContainer>
  );
}

/**
 * Optimized version of EvalsDataGrid that uses paginated API
 */
export default function EvalsDataGridOptimized({
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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const pageSize = 100;

  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>(
    focusedEvalId ? [focusedEvalId] : [],
  );

  const hasMore = offset + evals.length < total;

  /**
   * Fetch evals from the API with pagination.
   */
  const fetchEvals = async (reset = false) => {
    try {
      const currentOffset = reset ? 0 : offset;
      setIsLoadingMore(!reset);
      
      const queryParams = new URLSearchParams({
        limit: pageSize.toString(),
        offset: currentOffset.toString(),
      });
      
      const response = await callApi(`/results?${queryParams}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to fetch evals');
      }
      
      const body = (await response.json()) as { data: Eval[]; total: number };
      
      if (reset) {
        setEvals(body.data);
        setOffset(0);
      } else {
        setEvals(prev => [...prev, ...body.data]);
      }
      
      setTotal(body.total || body.data.length);
      setOffset(currentOffset + body.data.length);
    } catch (error) {
      setError(error as Error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchEvals(true);
  }, []);

  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) {
      fetchEvals(false);
    }
  };

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
    [focusedEvalId, onEvalSelected],
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
            onLoadMore: handleLoadMore,
            hasMore,
            isLoadingMore,
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
            paginationModel: { pageSize: 100 },
          },
        }}
        pageSizeOptions={[50, 100, 200]}
        isRowSelectable={(params) => params.id !== focusedEvalId}
      />
      {hasMore && total > 0 && (
        <Box sx={{ p: 2, textAlign: 'center', borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary">
            Showing {evals.length} of {total} evaluations
          </Typography>
        </Box>
      )}
    </Paper>
  );
}