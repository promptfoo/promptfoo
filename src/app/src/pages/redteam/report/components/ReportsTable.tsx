import { useCallback, useEffect, useMemo, useState } from 'react';

import { DataTable } from '@app/components/data-table/data-table';
import { Badge } from '@app/components/ui/badge';
import { EVAL_ROUTES, REDTEAM_ROUTES } from '@app/constants/routes';
import { cn } from '@app/lib/utils';
import { callApi } from '@app/utils/api';
import { formatDataGridDate } from '@app/utils/date';
import { formatASRForDisplay } from '@app/utils/redteam';
import { Link } from 'react-router-dom';
import type { EvalSummary } from '@promptfoo/types';
import type { ColumnDef } from '@tanstack/react-table';

interface ReportsTableProps {
  onReportSelected: (evalId: string) => void;
}

/**
 * Get Tailwind color classes for attack success rate.
 * High ASR = bad (red), Low ASR = good (green)
 */
function getASRColorClass(percentage: number): string {
  if (percentage >= 75) {
    return 'text-red-700 dark:text-red-400';
  }
  if (percentage >= 50) {
    return 'text-red-600 dark:text-red-400';
  }
  if (percentage >= 25) {
    return 'text-amber-600 dark:text-amber-400';
  }
  if (percentage >= 10) {
    return 'text-amber-500 dark:text-amber-300';
  }
  return 'text-emerald-600 dark:text-emerald-400';
}

export default function ReportsTable({ onReportSelected }: ReportsTableProps) {
  const [reports, setReports] = useState<EvalSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async (signal: AbortSignal) => {
    try {
      setIsLoading(true);
      const response = await callApi('/results?type=redteam&includeProviders=true', {
        cache: 'no-store',
        signal,
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      const body = (await response.json()) as { data: EvalSummary[] };
      setReports(body.data);
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
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    fetchReports(abortController.signal);
    return () => {
      abortController.abort();
    };
  }, [fetchReports]);

  // Export CSV handler
  const handleExportCSV = useCallback(() => {
    const headers = ['Name', 'Target', 'Scanned At', 'Attack Success Rate', '# Tests', 'Eval ID'];
    const csvRows = [
      headers.join(','),
      ...reports.map((row) => {
        const target =
          row.providers.length > 0 ? (row.providers[0].label ?? row.providers[0].id) : 'No target';
        return [
          `"${(row.description || 'Untitled Evaluation').replace(/"/g, '""')}"`,
          `"${target.replace(/"/g, '""')}"`,
          new Date(row.createdAt).toISOString(),
          formatASRForDisplay(row.attackSuccessRate ?? 0),
          row.numTests,
          row.evalId,
        ].join(',');
      }),
    ];
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `redteam-reports-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [reports]);

  // Column definitions
  const columns: ColumnDef<EvalSummary>[] = useMemo(
    () => [
      {
        accessorKey: 'description',
        header: 'Name',
        cell: ({ getValue, row }) => {
          const description = getValue<string>() || 'Untitled Evaluation';
          return (
            <Link
              to={REDTEAM_ROUTES.REPORT_DETAIL(row.original.evalId)}
              onClick={(e) => {
                e.preventDefault();
                onReportSelected(row.original.evalId);
              }}
              className="text-primary hover:underline font-medium"
            >
              {description}
            </Link>
          );
        },
      },
      {
        accessorKey: 'providers',
        header: 'Target',
        cell: ({ row }) => {
          const providers = row.original.providers;
          const target =
            providers.length > 0 ? (providers[0].label ?? providers[0].id) : 'No target';
          return (
            <Badge variant="secondary" truncate className="font-medium" title={target}>
              {target}
            </Badge>
          );
        },
        size: 150,
      },
      {
        accessorKey: 'createdAt',
        header: 'Scanned At',
        cell: ({ getValue }) => (
          <span className="text-sm">{formatDataGridDate(getValue<number>())}</span>
        ),
        size: 160,
      },
      {
        accessorKey: 'attackSuccessRate',
        header: 'Attack Success Rate',
        cell: ({ getValue }) => {
          const rate = getValue<number>() ?? 0;
          const colorClass = getASRColorClass(rate);
          return (
            <span className={cn('font-mono tabular-nums', colorClass)}>
              {formatASRForDisplay(rate)}%
            </span>
          );
        },
        size: 140,
        meta: { align: 'right' },
      },
      {
        accessorKey: 'numTests',
        header: '# Tests',
        cell: ({ getValue }) => (
          <span className="font-mono tabular-nums">{getValue<number>()}</span>
        ),
        size: 80,
        meta: { align: 'right' },
      },
      {
        accessorKey: 'evalId',
        header: 'Eval ID',
        cell: ({ getValue }) => {
          const evalId = getValue<string>();
          return (
            <Link
              to={EVAL_ROUTES.DETAIL(evalId)}
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-sm text-primary hover:underline"
            >
              {evalId}
            </Link>
          );
        },
        size: 140,
      },
    ],
    [onReportSelected],
  );

  return (
    <DataTable
      columns={columns}
      data={reports}
      isLoading={isLoading}
      error={error}
      emptyMessage="No red team reports found. Run a red team evaluation to get started."
      onRowClick={(row) => onReportSelected(row.evalId)}
      initialSorting={[{ id: 'createdAt', desc: true }]}
      initialPageSize={50}
      showToolbar
      showColumnToggle
      showExport
      onExportCSV={handleExportCSV}
    />
  );
}
