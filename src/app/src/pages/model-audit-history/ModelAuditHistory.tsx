import { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import {
  AddIcon,
  CheckCircleIcon,
  DeleteIcon,
  ErrorIcon,
  HistoryIcon,
} from '@app/components/ui/icons';
import { Spinner } from '@app/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@app/components/ui/tooltip';
import { MODEL_AUDIT_ROUTES } from '@app/constants/routes';
import { formatDataGridDate } from '@app/utils/date';
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
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useModelAuditHistoryStore } from '../model-audit/stores';

import type { HistoricalScan } from '../model-audit/stores';

const GridToolbarExport = () => (
  <GridToolbarExportContainer>
    <GridCsvExportMenuItem />
  </GridToolbarExportContainer>
);

function CustomToolbar({ onNewScan }: { onNewScan: () => void }) {
  return (
    <GridToolbarContainer className="p-2 border-b border-border gap-2 flex-wrap">
      <div className="flex gap-2">
        <Button size="sm" onClick={onNewScan}>
          <AddIcon className="h-4 w-4 mr-2" />
          New Scan
        </Button>
        <GridToolbarColumnsButton />
        <GridToolbarFilterButton />
        <GridToolbarDensitySelector />
        <GridToolbarExport />
      </div>
      <div className="flex-grow" />
      <GridToolbarQuickFilter className="[&_.MuiInputBase-root]:rounded-lg [&_.MuiInputBase-root]:bg-background" />
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm font-mono text-primary cursor-pointer hover:underline truncate">
                  {params.value}
                </span>
              </TooltipTrigger>
              <TooltipContent>{params.value}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
          <span className="text-sm truncate">{params.value || 'Unnamed scan'}</span>
        ),
      },
      {
        field: 'modelPath',
        headerName: 'Model Path',
        flex: 2.5,
        minWidth: 250,
        renderCell: (params: GridRenderCellParams<HistoricalScan>) => (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm font-mono truncate">{params.value}</span>
              </TooltipTrigger>
              <TooltipContent className="font-mono">{params.value}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ),
      },
      {
        field: 'hasErrors',
        headerName: 'Status',
        flex: 1,
        minWidth: 130,
        renderCell: (params: GridRenderCellParams<HistoricalScan>) => (
          <Badge
            variant={params.value ? 'critical' : 'success'}
            className="gap-1.5 min-w-[100px] justify-center"
          >
            {params.value ? (
              <ErrorIcon className="h-3.5 w-3.5" />
            ) : (
              <CheckCircleIcon className="h-3.5 w-3.5" />
            )}
            {params.value ? 'Issues Found' : 'Clean'}
          </Badge>
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
            return <span className="text-sm text-muted-foreground">-</span>;
          }
          return (
            <div className="flex items-center gap-1">
              <span className="text-sm text-emerald-600 dark:text-emerald-400">
                {params.row.passedChecks || 0}
              </span>
              <span className="text-sm text-muted-foreground">/</span>
              <span className="text-sm">{params.value}</span>
            </div>
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setScanToDelete(params.row.id);
                    setDeleteDialogOpen(true);
                  }}
                >
                  <DeleteIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ),
      },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Page Header */}
      <div className="border-b border-border bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
        <div className="container max-w-7xl mx-auto px-4 py-10">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <HistoryIcon className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Scan History</h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                View and manage your model security scan results
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container max-w-7xl mx-auto px-4 py-8">
        <Card className="overflow-hidden bg-white dark:bg-zinc-900">
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
            autoHeight
            slots={{
              toolbar: () => <CustomToolbar onNewScan={handleNewScan} />,
              loadingOverlay: () => (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                  <Spinner size="lg" />
                  <span className="text-sm text-muted-foreground">Loading scan history...</span>
                </div>
              ),
              noRowsOverlay: () => (
                <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                  {historyError ? (
                    <>
                      <div className="text-4xl mb-4">⚠️</div>
                      <h3 className="text-lg font-semibold text-destructive mb-1">
                        Error loading history
                      </h3>
                      <p className="text-sm text-muted-foreground">{historyError}</p>
                    </>
                  ) : (
                    <>
                      <div className="text-4xl mb-4">🔍</div>
                      <h3 className="text-lg font-semibold mb-1">No scan history found</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Run your first model security scan to see results here
                      </p>
                      <Button asChild>
                        <RouterLink to={MODEL_AUDIT_ROUTES.SETUP}>
                          <AddIcon className="h-4 w-4 mr-2" />
                          New Scan
                        </RouterLink>
                      </Button>
                    </>
                  )}
                </div>
              ),
            }}
            sx={{
              border: 'none',
              '& .MuiDataGrid-row': {
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
                '&:hover': {
                  backgroundColor: 'hsl(var(--muted) / 0.5)',
                },
              },
              '& .MuiDataGrid-cell': {
                borderColor: 'hsl(var(--border))',
                display: 'flex',
                alignItems: 'center',
              },
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: 'hsl(var(--muted) / 0.3)',
                borderColor: 'hsl(var(--border))',
              },
              '& .MuiDataGrid-footerContainer': {
                borderColor: 'hsl(var(--border))',
              },
              '--DataGrid-overlayHeight': '300px',
            }}
            disableRowSelectionOnClick
          />
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => !isDeleting && setDeleteDialogOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Scan?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this scan from history? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <DeleteIcon className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
