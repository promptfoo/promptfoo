import { useCallback, useEffect, useMemo, useState } from 'react';

import { DataTable } from '@app/components/data-table/data-table';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { MODEL_AUDIT_ROUTES } from '@app/constants/routes';
import { formatDataGridDate } from '@app/utils/date';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useModelAuditHistoryStore } from '../model-audit/stores';
import type { ColumnDef } from '@tanstack/react-table';

import type { HistoricalScan } from '../model-audit/stores';

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
  } = useModelAuditHistoryStore();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scanToDelete, setScanToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    const abortController = new AbortController();
    fetchHistoricalScans(abortController.signal);
    return () => abortController.abort();
  }, [fetchHistoricalScans, pageSize, currentPage, sortModel]);

  const handleRowClick = useCallback(
    (row: HistoricalScan) => {
      navigate(MODEL_AUDIT_ROUTES.DETAIL(row.id));
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const columns = useMemo<ColumnDef<HistoricalScan>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        size: 120,
        cell: ({ getValue }) => {
          const value = getValue<string>();
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm font-mono text-primary cursor-pointer hover:underline truncate block">
                  {value}
                </span>
              </TooltipTrigger>
              <TooltipContent>{value}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        size: 180,
        cell: ({ getValue }) => (
          <span className="text-sm">{formatDataGridDate(getValue<number>())}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
        size: 200,
        cell: ({ getValue }) => (
          <span className="text-sm truncate block">{getValue<string>() || 'Unnamed scan'}</span>
        ),
      },
      {
        accessorKey: 'modelPath',
        header: 'Model Path',
        size: 250,
        cell: ({ getValue }) => {
          const value = getValue<string>();
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm font-mono truncate block">{value}</span>
              </TooltipTrigger>
              <TooltipContent className="font-mono">{value}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: 'hasErrors',
        header: 'Status',
        size: 130,
        accessorFn: (row) => (row.hasErrors ? 'Issues Found' : 'Clean'),
        cell: ({ row }) => {
          const hasErrors = row.original.hasErrors;
          return (
            <Badge
              variant={hasErrors ? 'critical' : 'success'}
              className="gap-1.5 min-w-[100px] justify-center"
            >
              {hasErrors ? (
                <ErrorIcon className="size-3.5" />
              ) : (
                <CheckCircleIcon className="size-3.5" />
              )}
              {hasErrors ? 'Issues Found' : 'Clean'}
            </Badge>
          );
        },
        meta: {
          filterVariant: 'select',
          filterOptions: [
            { label: 'Issues Found', value: 'Issues Found' },
            { label: 'Clean', value: 'Clean' },
          ],
        },
      },
      {
        accessorKey: 'totalChecks',
        header: 'Checks',
        size: 100,
        cell: ({ getValue, row }) => {
          const value = getValue<number | undefined>();
          if (value === undefined || value === null) {
            return <span className="text-sm text-muted-foreground">-</span>;
          }
          return (
            <div className="flex items-center gap-1">
              <span className="text-sm text-emerald-600 dark:text-emerald-400">
                {row.original.passedChecks || 0}
              </span>
              <span className="text-sm text-muted-foreground">/</span>
              <span className="text-sm">{value}</span>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        size: 80,
        enableSorting: false,
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation();
                  setScanToDelete(row.original.id);
                  setDeleteDialogOpen(true);
                }}
              >
                <DeleteIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        ),
      },
    ],
    [setScanToDelete],
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Page Header */}
      <div className="border-b border-border bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
        <div className="container max-w-7xl mx-auto px-4 py-10">
          <div className="flex items-start gap-4">
            <div className="shrink-0 size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <HistoryIcon className="size-7 text-primary" />
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
      <div className="container max-w-7xl mx-auto px-4 py-8 space-y-4">
        {/* Toolbar */}
        <div className="flex justify-between items-center">
          <Button size="sm" onClick={handleNewScan}>
            <AddIcon className="size-4 mr-2" />
            New Scan
          </Button>
        </div>

        <Card className="overflow-hidden bg-white dark:bg-zinc-900">
          {historyError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <h3 className="text-lg font-semibold text-destructive mb-1">Error loading history</h3>
              <p className="text-sm text-muted-foreground">{historyError}</p>
            </div>
          ) : historicalScans.length === 0 && !isLoadingHistory ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <div className="text-4xl">🔍</div>
              <h3 className="text-lg font-semibold">No scan history found</h3>
              <p className="text-sm text-muted-foreground">
                Run your first model security scan to see results here
              </p>
              <Button asChild>
                <RouterLink to={MODEL_AUDIT_ROUTES.SETUP}>
                  <AddIcon className="size-4 mr-2" />
                  New Scan
                </RouterLink>
              </Button>
            </div>
          ) : (
            <>
              <DataTable
                columns={columns}
                data={historicalScans}
                isLoading={isLoadingHistory}
                onRowClick={handleRowClick}
                getRowId={(row) => row.id}
                initialSorting={sortModel.map((s) => ({ id: s.field, desc: s.sort === 'desc' }))}
                showToolbar={false}
                showPagination={false}
              />

              {/* Server-side Pagination */}
              {historicalScans.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <div className="text-sm text-muted-foreground">
                    Showing {currentPage * pageSize + 1} to{' '}
                    {Math.min((currentPage + 1) * pageSize, totalCount)} of {totalCount} scans
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(0);
                      }}
                      className="px-3 py-1.5 rounded-md border border-border bg-background text-sm"
                    >
                      <option value={10}>10 / page</option>
                      <option value={25}>25 / page</option>
                      <option value={50}>50 / page</option>
                      <option value={100}>100 / page</option>
                    </select>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(0)}
                        disabled={currentPage === 0}
                      >
                        First
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 0}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={(currentPage + 1) * pageSize >= totalCount}
                      >
                        Next
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.ceil(totalCount / pageSize) - 1)}
                        disabled={(currentPage + 1) * pageSize >= totalCount}
                      >
                        Last
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
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
                  <DeleteIcon className="size-4 mr-2" />
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
