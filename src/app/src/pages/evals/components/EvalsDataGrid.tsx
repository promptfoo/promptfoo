import { useMemo, useEffect, useState } from 'react';
import { callApi } from '@app/utils/api';
import { Box, Typography, Paper, CircularProgress, useTheme, Link } from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  GridToolbarContainer,
  GridToolbarColumnsButton,
  GridToolbarFilterButton,
  GridToolbarDensitySelector,
  GridToolbarQuickFilter,
  type GridRowSelectionModel,
  type GridRenderCellParams,
  GridToolbarExportContainer,
  GridCsvExportMenuItem,
} from '@mui/x-data-grid';

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
  }
}

const GridToolbarExport = () => (
  <GridToolbarExportContainer>
    <GridCsvExportMenuItem />
  </GridToolbarExportContainer>
);

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
  useEffect(() => {
    const fetchEvals = async () => {
      try {
        const response = await callApi('/results', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Failed to fetch evals');
        }
        const body = (await response.json()) as { data: Eval[] };
        setEvals(body.data);
      } catch (error) {
        setError(error as Error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvals();
  }, []);

  const handleCellClick = (params: any) => onEvalSelected(params.row.evalId);

  const columns: GridColDef<Eval>[] = useMemo(
    () =>
      [
        {
          field: 'evalId',
          headerName: 'ID',
          flex: 1,
          renderCell: (params: GridRenderCellParams<Eval>) => (
            <Link href={`/eval/${params.row.evalId}`}>{params.row.evalId}</Link>
          ),
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
    [],
  );

  return (
    <Paper elevation={2} sx={{ height: '100%' }}>
      <DataGrid
        rows={evals}
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
