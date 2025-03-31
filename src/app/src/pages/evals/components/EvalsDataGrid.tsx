import { useMemo, useEffect, useState, useCallback } from 'react';
import { callApi } from '@app/utils/api';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Box, Typography, Paper, CircularProgress, useTheme, Button } from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  GridToolbarContainer,
  GridToolbarColumnsButton,
  GridToolbarFilterButton,
  GridToolbarDensitySelector,
  GridToolbarExport,
  GridToolbarQuickFilter,
  type GridRowSelectionModel,
} from '@mui/x-data-grid';

type Eval = {
  createdAt: number;
  datasetId: string;
  description: string | null;
  evalId: string;
  isRedteam: number;
  label: string;
  numTests: number;
};

// augment the props for the toolbar slot
declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    showUtilityButtons: boolean;
  }
}

function CustomToolbar({ showUtilityButtons }: { showUtilityButtons: boolean }) {
  const theme = useTheme();
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
      <GridToolbarQuickFilter
        sx={{
          '& .MuiInputBase-root': {
            borderRadius: 2,
            backgroundColor: theme.palette.background.paper,
          },
        }}
      />
    </GridToolbarContainer>
  );
}

/**
 * Displays a list of evals.
 *
 * @param onEvalSelected - Callback to handle when an eval is selected (via clicking on its id cell).
 * @param focusedEvalId - An optional ID of the eval to focus when the grid loads.
 */
export default function EvalsDataGrid({
  onEvalSelected,
  focusedEvalId,
  showUtilityButtons = false,
}: {
  onEvalSelected: (evalId: string) => void;
  focusedEvalId?: string;
  showUtilityButtons?: boolean;
}) {
  const [evals, setEvals] = useState<Eval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>(
    focusedEvalId ? [focusedEvalId] : [],
  );

  /**
   * Fetch evals from the API.
   */
  const fetchEvals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await callApi('/results', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to fetch evals: ${response.status} ${response.statusText}`);
      }
      const body = (await response.json()) as { data: Eval[] };
      setEvals(body.data);
    } catch (error) {
      setError(error as Error);
      console.error('Error fetching evals:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvals();
  }, [fetchEvals]);

  const handleCellClick = (params: any) => onEvalSelected(params.row.evalId);

  const handleRetry = () => {
    fetchEvals();
  };

  const columns: GridColDef<Eval>[] = useMemo(
    () =>
      [
        {
          field: 'evalId',
          headerName: 'ID',
          flex: 1,
        },
        {
          field: 'createdAt',
          headerName: 'Created',
          flex: 1,
          valueFormatter: (value: Eval['createdAt']) => new Date(value).toLocaleString(),
        },
        {
          field: 'description',
          headerName: 'Description',
          flex: 1,
          valueGetter: (value: Eval['description'], row: Eval) => value ?? row.label,
        },
        {
          field: 'numTests',
          headerName: '# Tests',
          flex: 1,
        },
      ].filter(Boolean) as GridColDef<Eval>[],
    [],
  );

  // Custom loading overlay component
  const LoadingOverlay = () => (
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
  );

  // Custom no rows overlay with error handling and retry button
  const NoRowsOverlay = () => (
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
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {error.message}
          </Typography>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={handleRetry}
            color="primary"
          >
            Retry
          </Button>
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
  );

  return (
    <Paper elevation={2} sx={{ height: '100%', overflow: 'hidden' }}>
      <DataGrid
        rows={evals}
        columns={columns}
        loading={isLoading}
        getRowId={(row) => row.evalId}
        slots={{
          toolbar: CustomToolbar,
          loadingOverlay: LoadingOverlay,
          noRowsOverlay: NoRowsOverlay,
        }}
        slotProps={{ toolbar: { showUtilityButtons } }}
        onCellClick={handleCellClick}
        sx={{
          border: 'none',
          '& .MuiDataGrid-row': {
            cursor: 'pointer',
            transition: 'background-color 0.2s ease',
            '&:hover': {
              backgroundColor: 'action.hover',
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
        }}
        onRowSelectionModelChange={setRowSelectionModel}
        rowSelectionModel={rowSelectionModel}
        initialState={{
          sorting: {
            sortModel: [{ field: 'createdAt', sort: 'desc' }],
          },
          pagination: {
            paginationModel: { pageSize: 25 },
          },
        }}
        pageSizeOptions={[10, 25, 50, 100]}
      />
    </Paper>
  );
}
