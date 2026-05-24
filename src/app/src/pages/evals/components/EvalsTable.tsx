import { useCallback, useEffect, useMemo, useState } from 'react';

import { DataTable } from '@app/components/data-table/data-table';
import { useServerVirtualizedRows } from '@app/components/data-table/use-server-virtualized-rows';
import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { DeleteIcon } from '@app/components/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { EVAL_ROUTES } from '@app/constants/routes';
import { cn } from '@app/lib/utils';
import { callApi } from '@app/utils/api';
import { formatDataGridDate } from '@app/utils/date';
import invariant from '@promptfoo/util/invariant';
import { Link, useLocation } from 'react-router-dom';
import type { EvalSummary } from '@promptfoo/types';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';

interface EvalsTableProps {
  onEvalSelected: (evalId: string) => void;
  focusedEvalId?: string;
  showUtilityButtons?: boolean;
  filterByDatasetId?: boolean;
  deletionEnabled?: boolean;
}

const SERVER_PAGE_SIZE = 50;

interface ResultsResponse {
  data: EvalSummary[];
  pagination?: {
    totalCount: number;
    limit: number;
    offset: number;
  };
}

interface FetchResultsOptions {
  signal: AbortSignal;
  limit?: number;
  offset?: number;
}

export default function EvalsTable({
  onEvalSelected,
  focusedEvalId,
  showUtilityButtons = false,
  filterByDatasetId = false,
  deletionEnabled = false,
}: EvalsTableProps) {
  if (filterByDatasetId) {
    invariant(focusedEvalId, 'focusedEvalId is required when filterByDatasetId is true');
  }

  const [evals, setEvals] = useState<EvalSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [totalRows, setTotalRows] = useState(0);

  const location = useLocation();
  const useServerPagination = !filterByDatasetId;

  const fetchResults = useCallback(async ({ signal, limit, offset }: FetchResultsOptions) => {
    const searchParams = new URLSearchParams();
    if (limit !== undefined) {
      searchParams.set('limit', String(limit));
      searchParams.set('offset', String(offset ?? 0));
    }

    const url = searchParams.size > 0 ? `/results?${searchParams.toString()}` : '/results';
    const response = await callApi(url, { cache: 'no-store', signal });
    if (!response.ok) {
      throw new Error('Failed to fetch evals');
    }
    return (await response.json()) as ResultsResponse;
  }, []);

  const fetchEvals = useCallback(
    async (signal: AbortSignal) => {
      try {
        setIsLoading(true);
        const body = await fetchResults({
          signal,
          ...(useServerPagination ? { limit: SERVER_PAGE_SIZE, offset: 0 } : {}),
        });
        setEvals(body.data);
        setTotalRows(body.pagination?.totalCount ?? body.data.length);
        setError(null);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message);
        }
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [fetchResults, useServerPagination],
  );

  const fetchServerRows = useCallback(
    async ({
      startIndex,
      endIndex,
      signal,
    }: {
      startIndex: number;
      endIndex: number;
      signal: AbortSignal;
    }) => {
      try {
        const limit = endIndex - startIndex + 1;
        const body = await fetchResults({ signal, limit, offset: startIndex });
        setTotalRows(body.pagination?.totalCount ?? body.data.length);
        setError(null);
        return {
          rows: body.data,
          offset: body.pagination?.offset ?? startIndex,
        };
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message);
        }
        throw err;
      }
    },
    [fetchResults],
  );

  const serverVirtualizationResetKey = `${location.pathname}${location.search}`;
  const { serverVirtualization } = useServerVirtualizedRows<EvalSummary>({
    initialRows: useServerPagination ? evals : [],
    rowCount: useServerPagination ? totalRows : 0,
    pageSize: SERVER_PAGE_SIZE,
    fetchRows: fetchServerRows,
    resetKey: serverVirtualizationResetKey,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    const abortController = new AbortController();
    fetchEvals(abortController.signal);
    return () => {
      abortController.abort();
    };
  }, [location.pathname, location.search, fetchEvals]);

  // Construct rows with optional filtering
  const rows = useMemo(() => {
    let rows_ = evals;

    if (filterByDatasetId && focusedEvalId && rows_.length > 0) {
      const focusedEval = rows_.find(({ evalId }) => evalId === focusedEvalId);
      invariant(focusedEval, 'focusedEvalId is not a valid eval ID');

      rows_ = rows_.filter(({ datasetId }) => datasetId === focusedEval.datasetId);
    }

    return rows_;
  }, [evals, filterByDatasetId, focusedEvalId]);

  const hasRedteamEvals = useMemo(() => {
    return useServerPagination || evals.some(({ isRedteam }) => isRedteam);
  }, [evals, useServerPagination]);

  // Get selected eval IDs from row selection state
  const selectedEvalIds = useMemo(() => {
    return Object.keys(rowSelection).filter((key) => rowSelection[key]);
  }, [rowSelection]);
  const enableClientSorting = !useServerPagination;

  // Handle delete confirmation
  const handleDeleteSelected = () => {
    if (selectedEvalIds.length === 0) {
      return;
    }
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      setIsLoading(true);
      const res = await callApi('/eval', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: selectedEvalIds }),
      });

      if (!res.ok) {
        throw new Error('Failed to delete evals');
      }

      setRowSelection({});
      setConfirmDeleteOpen(false);
      const refreshController = new AbortController();
      await fetchEvals(refreshController.signal);
    } catch (err) {
      console.error('Failed to delete evals:', err);
      alert('Failed to delete evals');
    } finally {
      setIsLoading(false);
    }
  };

  // Export CSV handler
  const handleExportCSV = useCallback(async () => {
    let exportRows = rows;
    if (useServerPagination) {
      try {
        exportRows = (await fetchResults({ signal: new AbortController().signal })).data;
      } catch (err) {
        console.error('Failed to export evals:', err);
        alert('Failed to export evals');
        return;
      }
    }

    const headers = ['ID', 'Created', 'Type', 'Description', 'Pass Rate', '# Tests'];
    const csvRows = [
      headers.join(','),
      ...exportRows.map((row) =>
        [
          row.evalId,
          new Date(row.createdAt).toISOString(),
          row.isRedteam ? 'Red Team' : 'Eval',
          `"${(row.description || row.label || '').replace(/"/g, '""')}"`,
          row.passRate.toFixed(2),
          row.numTests,
        ].join(','),
      ),
    ];
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `evals-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [fetchResults, rows, useServerPagination]);

  // Column definitions
  const columns: ColumnDef<EvalSummary>[] = useMemo(
    () => [
      {
        accessorKey: 'evalId',
        header: 'ID',
        enableSorting: enableClientSorting,
        cell: ({ getValue }) => {
          const evalId = getValue<string>();
          if (evalId === focusedEvalId) {
            return (
              <span title={evalId} className="block truncate font-mono text-sm">
                {evalId}
              </span>
            );
          }
          return (
            <Link
              to={EVAL_ROUTES.DETAIL(evalId)}
              onClick={(e) => {
                e.preventDefault();
                onEvalSelected(evalId);
              }}
              title={evalId}
              className="block truncate font-mono text-sm text-primary hover:underline"
            >
              {evalId}
            </Link>
          );
        },
        size: 140,
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        enableSorting: enableClientSorting,
        cell: ({ getValue }) => (
          <span className="text-sm">{formatDataGridDate(getValue<number>())}</span>
        ),
        size: 160,
      },
      // Only show the redteam column if there are redteam evals
      ...(hasRedteamEvals
        ? [
            {
              id: 'type',
              accessorFn: (row) => (row.isRedteam ? 'Red Team' : 'Eval'),
              header: 'Type',
              enableSorting: enableClientSorting,
              cell: ({ row }) => {
                const isRedteam = row.original.isRedteam;
                return (
                  <Badge
                    variant={isRedteam ? 'destructive' : 'secondary'}
                    className={cn(
                      'font-medium whitespace-nowrap',
                      !isRedteam && 'bg-muted text-muted-foreground border-muted-foreground/20',
                    )}
                  >
                    {isRedteam ? 'Red Team' : 'Eval'}
                  </Badge>
                );
              },
              meta: {
                filterVariant: 'select',
                filterOptions: [
                  { label: 'Red Team', value: 'Red Team' },
                  { label: 'Eval', value: 'Eval' },
                ],
              },
              size: 100,
            } as ColumnDef<EvalSummary>,
          ]
        : []),
      {
        accessorKey: 'description',
        header: 'Description',
        enableSorting: enableClientSorting,
        cell: ({ row }) => {
          const text = row.original.description || row.original.label;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="text-sm block"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {text}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">{text}</TooltipContent>
            </Tooltip>
          );
        },
        size: 250,
      },
      {
        accessorKey: 'passRate',
        header: 'Pass Rate',
        enableSorting: enableClientSorting,
        cell: ({ getValue }) => {
          const rate = getValue<number>();
          const colorClass =
            rate >= 90
              ? 'text-emerald-600 dark:text-emerald-400'
              : rate >= 60
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-red-600 dark:text-red-400';
          return (
            <span className={cn('font-mono tabular-nums', colorClass)}>{rate.toFixed(2)}%</span>
          );
        },
        size: 120,
        meta: { align: 'right' },
      },
      {
        accessorKey: 'numTests',
        header: '# Tests',
        enableSorting: enableClientSorting,
        cell: ({ getValue }) => (
          <span className="font-mono tabular-nums">{getValue<number>()}</span>
        ),
        size: 80,
        meta: { align: 'right' },
      },
    ],
    [enableClientSorting, focusedEvalId, onEvalSelected, hasRedteamEvals],
  );

  // Delete button for toolbar
  const deleteButton =
    deletionEnabled && selectedEvalIds.length > 0 ? (
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDeleteSelected}
        data-testid="delete-selected-button"
      >
        <DeleteIcon className="size-4 mr-1.5" />
        Delete ({selectedEvalIds.length})
      </Button>
    ) : null;

  return (
    <>
      {useServerPagination ? (
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          error={error}
          emptyMessage="No evaluations found. Create an eval to get started."
          onRowClick={(row) => {
            if (row.evalId !== focusedEvalId) {
              onEvalSelected(row.evalId);
            }
          }}
          enableRowSelection={deletionEnabled}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          getRowId={(row) => row.evalId}
          initialSorting={[{ id: 'createdAt', desc: true }]}
          globalFilterLabel="Search evaluations"
          showToolbar={showUtilityButtons}
          showColumnToggle={showUtilityButtons}
          toolbarActions={deleteButton}
          showExport={showUtilityButtons}
          onExportCSV={handleExportCSV}
          rowDisplayMode="server-virtualized"
          serverVirtualization={serverVirtualization}
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          error={error}
          emptyMessage="No evaluations found. Create an eval to get started."
          onRowClick={(row) => {
            if (row.evalId !== focusedEvalId) {
              onEvalSelected(row.evalId);
            }
          }}
          enableRowSelection={deletionEnabled}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          getRowId={(row) => row.evalId}
          initialSorting={[{ id: 'createdAt', desc: true }]}
          globalFilterLabel="Search evaluations"
          showToolbar={showUtilityButtons}
          showColumnToggle={showUtilityButtons}
          toolbarActions={deleteButton}
          showExport={showUtilityButtons}
          onExportCSV={handleExportCSV}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedEvalIds.length} eval{selectedEvalIds.length === 1 ? '' : 's'}?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the selected eval
              {selectedEvalIds.length === 1 ? '' : 's'}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              <DeleteIcon className="size-4 mr-1.5" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
