import { useMemo } from 'react';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import {
  DataGrid,
  type GridColDef,
  GridCsvExportMenuItem,
  type GridExportMenuItemProps,
  GridPrintExportMenuItem,
  type GridRenderCellParams,
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarDensitySelector,
  GridToolbarExportContainer,
  GridToolbarFilterButton,
  GridToolbarQuickFilter,
  gridFilteredSortedRowIdsSelector,
  gridVisibleColumnFieldsSelector,
  useGridApiContext,
} from '@mui/x-data-grid';
import { Link } from 'react-router-dom';
import type { StandaloneEval } from '@promptfoo/util/database';

function JsonExportMenuItem(props: GridExportMenuItemProps<{}>) {
  const apiRef = useGridApiContext();

  const json = useMemo(() => {
    // Select rows and columns
    const filteredSortedRowIds = gridFilteredSortedRowIdsSelector(apiRef);
    const visibleColumnsField = gridVisibleColumnFieldsSelector(apiRef);

    // Format the data. Here we only keep the value
    const data = filteredSortedRowIds.map((id) => {
      const row: Record<string, any> = {};
      visibleColumnsField.forEach((field) => {
        row[field] = apiRef.current.getCellParams(id, field).value;
      });
      return row;
    });

    // Stringify with some indentation
    return JSON.stringify(data, null, 2);
  }, [apiRef]);

  const handleClick = () => {
    const blob = new Blob([json], { type: 'text/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'promptfoo-eval-history.json';
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    });

    // Hide the export menu after the export
    props.hideMenu?.();
  };

  return <MenuItem onClick={handleClick}>Export JSON</MenuItem>;
}

const GridToolbarExport = () => (
  <GridToolbarExportContainer>
    <GridCsvExportMenuItem />
    <JsonExportMenuItem />
    <GridPrintExportMenuItem />
  </GridToolbarExportContainer>
);

function CustomToolbar() {
  const theme = useTheme();
  return (
    <GridToolbarContainer sx={{ p: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <GridToolbarColumnsButton />
        <GridToolbarFilterButton />
        <GridToolbarDensitySelector />
        <GridToolbarExport />
      </Box>
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

interface HistoryProps {
  data: StandaloneEval[];
  isLoading: boolean;
  error: string | null;
  showDatasetColumn?: boolean;
}

export default function History({
  data,
  isLoading,
  error,
  showDatasetColumn = true,
}: HistoryProps) {
  const columns: GridColDef<StandaloneEval>[] = useMemo(
    () => [
      {
        field: 'evalId',
        headerName: 'Eval',
        flex: 2,
        minWidth: 120,
        renderCell: (params: GridRenderCellParams<StandaloneEval>) => (
          <Link to={`/eval?evalId=${params.value || ''}`}>{params.value}</Link>
        ),
      },
      ...(showDatasetColumn
        ? [
            {
              field: 'datasetId',
              headerName: 'Dataset',
              flex: 0.5,
              minWidth: 100,
              renderCell: (params: GridRenderCellParams<StandaloneEval>) => (
                <Link to={`/datasets?id=${params.value || ''}`}>{params.value?.slice(0, 6)}</Link>
              ),
            },
          ]
        : []),
      {
        field: 'provider',
        headerName: 'Provider',
        flex: 1,
        minWidth: 120,
      },
      {
        field: 'prompt',
        headerName: 'Prompt',
        flex: 3,
        minWidth: 200,
        // Ensure proper formatting for export:
        valueGetter: (value: undefined, row: StandaloneEval) =>
          `[${row.promptId?.slice(0, 6)}]: ${row.raw}`,
        renderCell: (params: GridRenderCellParams<StandaloneEval>) => (
          <>
            <Link to={`/prompts?id=${params.row.promptId || ''}`}>
              [{params.row.promptId?.slice(0, 6)}]
            </Link>
            <span style={{ marginLeft: 4 }}>{params.row.raw}</span>
          </>
        ),
      },
      {
        field: 'passRate',
        headerName: 'Pass Rate %',
        flex: 1,
        type: 'number',
        minWidth: 120,
        valueGetter: (value: undefined, row: StandaloneEval) => {
          const testPassCount = row.metrics?.testPassCount ?? 0;
          const testFailCount = row.metrics?.testFailCount ?? 0;
          const totalCount = testPassCount + testFailCount;
          return totalCount > 0 ? (testPassCount / totalCount) * 100 : 0;
        },
        valueFormatter: (value: number) => (value ? value?.toFixed(2) : 0),
      },
      {
        field: 'metrics.testPassCount',
        headerName: 'Pass Count',
        flex: 1,
        type: 'number',
        minWidth: 120,
        valueGetter: (value: undefined, row: StandaloneEval) => row.metrics?.testPassCount,
        valueFormatter: (value: number) => value?.toString() ?? '-',
      },
      {
        field: 'metrics.testFailCount',
        headerName: 'Fail Count',
        flex: 1,
        type: 'number',
        minWidth: 120,
        valueGetter: (value: undefined, row: StandaloneEval) =>
          (row.metrics?.testFailCount ?? 0) + (row.metrics?.testErrorCount ?? 0),
        renderCell: (params: GridRenderCellParams<StandaloneEval>) => {
          const failCount = params.row.metrics?.testFailCount ?? 0;
          const errorCount = params.row.metrics?.testErrorCount ?? 0;
          return (
            <>
              {failCount}
              {errorCount > 0 && (
                <>
                  <span style={{ margin: '0 4px' }}>+</span>
                  <span style={{ color: 'red' }}>{errorCount} errors</span>
                </>
              )}
            </>
          );
        },
      },
      {
        field: 'metrics.score',
        headerName: 'Raw score',
        flex: 1,
        type: 'number',
        minWidth: 120,
        valueGetter: (value, row) => row.metrics?.score,
        valueFormatter: (value: number) => value?.toFixed(2) ?? '-',
      },
    ],
    [showDatasetColumn],
  );

  return (
    <Box
      sx={{
        top: 64,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: (theme) =>
          theme.palette.mode === 'dark'
            ? alpha(theme.palette.common.black, 0.2)
            : alpha(theme.palette.grey[50], 0.5),
        p: 3,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderTop: 1,
          borderColor: (theme) => alpha(theme.palette.divider, 0.1),
          boxShadow: (theme) => `0 1px 2px ${alpha(theme.palette.common.black, 0.05)}`,
          bgcolor: 'background.paper',
          borderRadius: 1,
        }}
      >
        <DataGrid
          rows={data}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.uuid}
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
                  Loading history...
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
                      Error loading history
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {error}
                    </Typography>
                  </>
                ) : (
                  <>
                    <Box sx={{ fontSize: '2rem', mb: 2 }}>🔍</Box>
                    <Typography variant="h6" gutterBottom>
                      No history found
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Run some evals to see their results here
                    </Typography>
                  </>
                )}
              </Box>
            ),
          }}
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
              display: 'flex',
              alignItems: 'center',
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: 'background.default',
              borderColor: 'divider',
            },
          }}
          initialState={{
            sorting: {
              sortModel: [{ field: 'createdAt', sort: 'desc' }],
            },
          }}
        />
      </Paper>
    </Box>
  );
}
