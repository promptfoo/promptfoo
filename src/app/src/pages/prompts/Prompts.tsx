import { useEffect, useMemo, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarDensitySelector,
  GridToolbarExport,
  GridToolbarFilterButton,
  GridToolbarQuickFilter,
} from '@mui/x-data-grid';
import { Link, useSearchParams } from 'react-router-dom';
import PromptDialog from './PromptDialog';
import type { ServerPromptWithMetadata } from '@promptfoo/types';

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

interface PromptsProps {
  data: ServerPromptWithMetadata[];
  isLoading: boolean;
  error: string | null;
  showDatasetColumn?: boolean;
}

export default function Prompts({
  data,
  isLoading,
  error,
  showDatasetColumn = true,
}: PromptsProps) {
  const [searchParams] = useSearchParams();
  const [dialogState, setDialogState] = useState<{ open: boolean; selectedIndex: number }>({
    open: false,
    selectedIndex: 0,
  });
  const hasShownPopup = useRef(false);

  const handleClickOpen = (index: number) => {
    setDialogState({ open: true, selectedIndex: index });
  };

  const handleClose = () => {
    setDialogState((prev) => ({ ...prev, open: false }));
  };

  useEffect(() => {
    if (hasShownPopup.current) {
      return;
    }

    const promptId = searchParams.get('id');
    if (promptId) {
      const promptIndex = data.findIndex((prompt) => prompt.id.startsWith(promptId));
      if (promptIndex !== -1) {
        handleClickOpen(promptIndex);
        hasShownPopup.current = true;
      }
    }
  }, [data, searchParams]);

  const columns: GridColDef<ServerPromptWithMetadata>[] = useMemo(
    () => [
      {
        field: 'id',
        headerName: 'ID',
        flex: 1,
        minWidth: 100,
        valueFormatter: (value: ServerPromptWithMetadata['id']) => value.toString().slice(0, 6),
      },
      {
        field: 'prompt',
        headerName: 'Prompt',
        flex: 2,
        minWidth: 300,
        valueGetter: (value: ServerPromptWithMetadata['prompt']) => value.raw,
      },
      {
        field: 'recentEvalDate',
        headerName: 'Most recent eval',
        flex: 1,
        minWidth: 150,
        renderCell: (params: GridRenderCellParams<ServerPromptWithMetadata>) => {
          if (!params.value) {
            return (
              <Typography variant="body2" color="text.secondary">
                Unknown
              </Typography>
            );
          }
          return (
            <Link to={`/eval?evalId=${params.row.recentEvalId}`} style={{ textDecoration: 'none' }}>
              <Typography
                variant="body2"
                color="primary"
                fontFamily="monospace"
                sx={{
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                {params.value}
              </Typography>
            </Link>
          );
        },
      },
      {
        field: 'count',
        headerName: '# Evals',
        flex: 1,
        minWidth: 80,
      },
    ],
    [],
  );

  const handleRowClick = (params: any) => {
    const index = data.findIndex((p) => p.id === params.id);
    if (index !== -1) {
      handleClickOpen(index);
    }
  };

  return (
    <Box
      sx={{
        position: 'absolute',
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
          getRowId={(row) => row.id}
          onRowClick={handleRowClick}
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
                  Loading prompts...
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
                      Error loading prompts
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {error}
                    </Typography>
                  </>
                ) : (
                  <>
                    <Box sx={{ fontSize: '2rem', mb: 2 }}>🔍</Box>
                    <Typography variant="h6" gutterBottom>
                      No prompts found
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Create a prompt to start evaluating your AI responses
                    </Typography>
                  </>
                )}
              </Box>
            ),
          }}
          slotProps={{ toolbar: { showUtilityButtons: true } }}
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
              sortModel: [{ field: 'recentEvalDate', sort: 'desc' }],
            },
            pagination: {
              paginationModel: { pageSize: 25 },
            },
          }}
          pageSizeOptions={[10, 25, 50, 100]}
        />
      </Paper>

      {data[dialogState.selectedIndex] && (
        <PromptDialog
          openDialog={dialogState.open}
          handleClose={handleClose}
          selectedPrompt={data[dialogState.selectedIndex]}
          showDatasetColumn={showDatasetColumn}
        />
      )}
    </Box>
  );
}
