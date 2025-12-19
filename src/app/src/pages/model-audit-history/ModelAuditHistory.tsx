import { useCallback, useEffect, useMemo, useState } from 'react';

import { MODEL_AUDIT_ROUTES } from '@app/constants/routes';
import { formatDataGridDate } from '@app/utils/date';
import {
  Add as AddIcon,
  CheckCircle as CheckCircleIcon,
  Delete as DeleteIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  DataGrid,
  type GridColDef,
  GridCsvExportMenuItem,
  type GridPaginationModel,
  type GridRenderCellParams,
  type GridSortModel,
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarDensitySelector,
  GridToolbarExportContainer,
  GridToolbarFilterButton,
  GridToolbarQuickFilter,
} from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import { useModelAuditHistoryStore } from '../model-audit/stores';

import type { HistoricalScan } from '../model-audit/stores';

const GridToolbarExport = () => (
  <GridToolbarExportContainer>
    <GridCsvExportMenuItem />
  </GridToolbarExportContainer>
);

function CustomToolbar({ onNewScan }: { onNewScan: () => void }) {
  const theme = useTheme();
  return (
    <GridToolbarContainer sx={{ p: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={onNewScan}>
          New Scan
        </Button>
        <GridToolbarColumnsButton />
        <GridToolbarFilterButton />
        <GridToolbarDensitySelector />
        <GridToolbarExport />
      </Box>
      <Box sx={{ flexGrow: 1 }} />
      <Box
        sx={{
          '& .MuiInputBase-root': {
            borderRadius: 2,
            backgroundColor: theme.palette.background.paper,
          },
        }}
      >
        <GridToolbarQuickFilter />
      </Box>
    </GridToolbarContainer>
  );
}

export default function ModelAuditHistory() {
  const navigate = useNavigate();

  const {
    historicalScans,
    isLoadingHistory,
    historyError,
    totalCount,
    pageSize,
    currentPage,
    sortModel,
    fetchHistoricalScans,
    deleteHistoricalScan,
    setPageSize,
    setCurrentPage,
    setSortModel,
  } = useModelAuditHistoryStore();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scanToDelete, setScanToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();
    fetchHistoricalScans(abortController.signal);
    return () => abortController.abort();
  }, [fetchHistoricalScans, pageSize, currentPage, sortModel]);

  const handleRowClick = useCallback(
    (params: { row: HistoricalScan }) => {
      navigate(MODEL_AUDIT_ROUTES.DETAIL(params.row.id));
    },
    [navigate],
  );

  const handleNewScan = useCallback(() => {
    navigate(MODEL_AUDIT_ROUTES.SETUP);
  }, [navigate]);

  const handleDelete = useCallback(async () => {
    if (!scanToDelete) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteHistoricalScan(scanToDelete);
      setDeleteDialogOpen(false);
      setScanToDelete(null);
    } catch (error) {
      console.error('Failed to delete scan:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [scanToDelete, deleteHistoricalScan]);

  const handlePaginationModelChange = useCallback(
    (model: GridPaginationModel) => {
      setPageSize(model.pageSize);
      setCurrentPage(model.page);
    },
    [setPageSize, setCurrentPage],
  );

  const handleSortModelChange = useCallback(
    (model: GridSortModel) => {
      const newSortModel = model.map((item) => ({
        field: item.field,
        sort: item.sort || 'desc',
      })) as { field: string; sort: 'asc' | 'desc' }[];
      setSortModel(newSortModel.length > 0 ? newSortModel : [{ field: 'createdAt', sort: 'desc' }]);
    },
    [setSortModel],
  );

  const columns: GridColDef<HistoricalScan>[] = useMemo(
    () => [
      {
        field: 'id',
        headerName: 'ID',
        flex: 1,
        minWidth: 120,
        renderCell: (params: GridRenderCellParams<HistoricalScan>) => (
          <Tooltip title={params.value}>
            <Typography
              variant="body2"
              color="primary"
              fontFamily="monospace"
              sx={{
                cursor: 'pointer',
                '&:hover': { textDecoration: 'underline' },
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {params.value?.slice(0, 8)}...
            </Typography>
          </Tooltip>
        ),
      },
      {
        field: 'createdAt',
        headerName: 'Created',
        flex: 1.5,
        minWidth: 180,
        valueFormatter: (value: number) => formatDataGridDate(value),
      },
      {
        field: 'name',
        headerName: 'Name',
        flex: 2,
        minWidth: 200,
        renderCell: (params: GridRenderCellParams<HistoricalScan>) => (
          <Typography variant="body2" noWrap>
            {params.value || 'Unnamed scan'}
          </Typography>
        ),
      },
      {
        field: 'modelPath',
        headerName: 'Model Path',
        flex: 2.5,
        minWidth: 250,
        renderCell: (params: GridRenderCellParams<HistoricalScan>) => (
          <Tooltip title={params.value}>
            <Typography variant="body2" noWrap fontFamily="monospace" sx={{ fontSize: '0.85rem' }}>
              {params.value}
            </Typography>
          </Tooltip>
        ),
      },
      {
        field: 'hasErrors',
        headerName: 'Status',
        flex: 1,
        minWidth: 130,
        renderCell: (params: GridRenderCellParams<HistoricalScan>) => (
          <Chip
            label={params.value ? 'Issues Found' : 'Clean'}
            color={params.value ? 'error' : 'success'}
            size="small"
            variant="filled"
            icon={
              params.value ? (
                <ErrorIcon sx={{ fontSize: 16 }} />
              ) : (
                <CheckCircleIcon sx={{ fontSize: 16 }} />
              )
            }
            sx={{
              fontWeight: 500,
              minWidth: 100,
            }}
          />
        ),
      },
      {
        field: 'totalChecks',
        headerName: 'Checks',
        flex: 0.8,
        minWidth: 100,
        type: 'number',
        renderCell: (params: GridRenderCellParams<HistoricalScan>) => {
          if (params.value === undefined || params.value === null) {
            return (
              <Typography variant="body2" color="text.secondary">
                -
              </Typography>
            );
          }
          return (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="body2" color="success.main">
                {params.row.passedChecks || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                /
              </Typography>
              <Typography variant="body2">{params.value}</Typography>
            </Stack>
          );
        },
      },
      {
        field: 'actions',
        headerName: 'Actions',
        flex: 0.5,
        minWidth: 80,
        sortable: false,
        filterable: false,
        renderCell: (params: GridRenderCellParams<HistoricalScan>) => (
          <Tooltip title="Delete">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setScanToDelete(params.row.id);
                setDeleteDialogOpen(true);
              }}
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ),
      },
    ],
    [],
  );

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 64,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: (t) =>
          t.palette.mode === 'dark'
            ? alpha(t.palette.common.black, 0.2)
            : alpha(t.palette.grey[50], 0.5),
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
          borderColor: (t) => alpha(t.palette.divider, 0.1),
          boxShadow: (t) => `0 1px 2px ${alpha(t.palette.common.black, 0.05)}`,
          bgcolor: 'background.paper',
          borderRadius: 1,
        }}
      >
        <DataGrid
          rows={historicalScans}
          columns={columns}
          loading={isLoadingHistory}
          rowCount={totalCount}
          paginationMode="server"
          sortingMode="server"
          paginationModel={{ page: currentPage, pageSize }}
          onPaginationModelChange={handlePaginationModelChange}
          sortModel={sortModel.map((s) => ({ field: s.field, sort: s.sort }))}
          onSortModelChange={handleSortModelChange}
          pageSizeOptions={[10, 25, 50, 100]}
          onRowClick={handleRowClick}
          getRowId={(row) => row.id}
          slots={{
            toolbar: () => <CustomToolbar onNewScan={handleNewScan} />,
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
                  Loading scan history...
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
                {historyError ? (
                  <>
                    <Box sx={{ fontSize: '2rem', mb: 2 }}>⚠️</Box>
                    <Typography variant="h6" gutterBottom color="error">
                      Error loading history
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {historyError}
                    </Typography>
                  </>
                ) : (
                  <>
                    <Box sx={{ fontSize: '2rem', mb: 2 }}>🔍</Box>
                    <Typography variant="h6" gutterBottom>
                      No scan history found
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Run your first model security scan to see results here
                    </Typography>
                    <Button variant="contained" startIcon={<AddIcon />} onClick={handleNewScan}>
                      New Scan
                    </Button>
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
            '& .MuiDataGrid-selectedRow': {
              backgroundColor: 'action.selected',
            },
            '--DataGrid-overlayHeight': '300px',
          }}
          disableRowSelectionOnClick
        />
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => !isDeleting && setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Scan?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this scan from history? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
            startIcon={isDeleting ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
