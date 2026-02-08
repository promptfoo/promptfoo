import { useMemo, useState } from 'react';

import { DataTable } from '@app/components/data-table';
import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { CopyButton } from '@app/components/ui/copy-button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { EVAL_ROUTES, ROUTES } from '@app/constants/routes';
import { Link } from 'react-router-dom';
import type { StandaloneEval } from '@promptfoo/util/database';
import type { ColumnDef } from '@tanstack/react-table';

interface HistoryProps {
  data: StandaloneEval[];
  isLoading: boolean;
  error: string | null;
  showDatasetColumn?: boolean;
}

const calculatePassRate = (evalItem: StandaloneEval): string => {
  const testPassCount = evalItem.metrics?.testPassCount ?? 0;
  const testFailCount = evalItem.metrics?.testFailCount ?? 0;
  const totalCount = testPassCount + testFailCount;
  const passRate = totalCount > 0 ? (testPassCount / totalCount) * 100 : 0;
  return passRate?.toFixed(2) ?? '0.00';
};

export default function History({
  data,
  isLoading,
  error,
  showDatasetColumn = true,
}: HistoryProps) {
  const [selectedPrompt, setSelectedPrompt] = useState<{
    promptId: string;
    raw: string;
  } | null>(null);

  const handleExportJSON = () => {
    const jsonData = data.map((row) => ({
      evalId: row.evalId,
      ...(showDatasetColumn && { datasetId: row.datasetId }),
      provider: row.provider,
      prompt: `[${row.promptId?.slice(0, 6)}]: ${row.raw}`,
      passRate: calculatePassRate(row),
      passCount: row.metrics?.testPassCount ?? 0,
      failCount: (row.metrics?.testFailCount ?? 0) + (row.metrics?.testErrorCount ?? 0),
      score: row.metrics?.score?.toFixed(2) ?? '-',
    }));

    const json = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([json], { type: 'text/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'promptfoo-eval-history.json';
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    });
  };

  const handleExportCSV = () => {
    const headers = [
      'evalId',
      ...(showDatasetColumn ? ['datasetId'] : []),
      'provider',
      'prompt',
      'passRate',
      'passCount',
      'failCount',
      'score',
    ];

    const rows = data.map((row) => {
      const testPassCount = row.metrics?.testPassCount ?? 0;
      const testFailCount = row.metrics?.testFailCount ?? 0;

      return [
        row.evalId,
        ...(showDatasetColumn ? [row.datasetId || ''] : []),
        row.provider || '',
        `[${row.promptId?.slice(0, 6)}]: ${row.raw}`,
        calculatePassRate(row),
        testPassCount,
        (testFailCount ?? 0) + (row.metrics?.testErrorCount ?? 0),
        row.metrics?.score?.toFixed(2) ?? '-',
      ];
    });

    const csvContent =
      headers.join(',') +
      '\n' +
      rows
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'promptfoo-eval-history.csv';
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    });
  };

  const columns: ColumnDef<StandaloneEval>[] = useMemo(
    () => [
      {
        accessorKey: 'evalId',
        header: 'Eval',
        cell: ({ getValue }) => (
          <Link
            to={EVAL_ROUTES.DETAIL(getValue<string>() || '')}
            className="text-primary hover:underline font-mono text-sm"
          >
            {getValue<string>()}
          </Link>
        ),
        size: 120,
      },
      ...(showDatasetColumn
        ? [
            {
              accessorKey: 'datasetId',
              header: 'Dataset',
              cell: ({ getValue }: { getValue: () => string | null }) => {
                const value = getValue();
                if (!value) {
                  return null;
                }
                return (
                  <Link
                    to={ROUTES.DATASET_DETAIL(value)}
                    className="text-primary hover:underline font-mono text-sm"
                  >
                    {value.slice(0, 6)}
                  </Link>
                );
              },
              size: 100,
            } as ColumnDef<StandaloneEval>,
          ]
        : []),
      {
        accessorKey: 'provider',
        header: 'Provider',
        cell: ({ getValue }) => <span className="text-sm">{getValue<string>()}</span>,
        size: 120,
      },
      {
        id: 'prompt',
        header: 'Prompt',
        accessorFn: (row) => `[${row.promptId?.slice(0, 6)}]: ${row.raw}`,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Link
              to={ROUTES.PROMPT_DETAIL(row.original.promptId || '')}
              className="text-primary hover:underline font-mono text-xs shrink-0"
            >
              [{row.original.promptId?.slice(0, 6)}]
            </Link>
            <button
              onClick={() =>
                setSelectedPrompt({
                  promptId: row.original.promptId || '',
                  raw: row.original.raw,
                })
              }
              className="text-sm text-muted-foreground text-left hover:text-foreground transition-colors cursor-pointer line-clamp-2"
            >
              {row.original.raw}
            </button>
          </div>
        ),
        size: 300,
      },
      {
        id: 'passRate',
        header: 'Pass Rate %',
        accessorFn: (row) => {
          return calculatePassRate(row);
        },
        cell: ({ getValue }) => (
          <span className="font-mono tabular-nums">{getValue<number>()}%</span>
        ),
        size: 120,
        meta: { align: 'right' },
      },
      {
        accessorKey: 'metrics.testPassCount',
        header: 'Pass Count',
        cell: ({ row }) => (
          <Badge variant="success" className="font-mono">
            {row.original.metrics?.testPassCount ?? 0}
          </Badge>
        ),
        size: 120,
        meta: { align: 'right' },
      },
      {
        id: 'failCount',
        header: 'Fail Count',
        accessorFn: (row) => (row.metrics?.testFailCount ?? 0) + (row.metrics?.testErrorCount ?? 0),
        cell: ({ row }) => {
          const failCount = row.original.metrics?.testFailCount ?? 0;
          const errorCount = row.original.metrics?.testErrorCount ?? 0;
          return (
            <div className="flex items-center justify-end gap-1 overflow-hidden">
              <Badge variant="critical" className="font-mono shrink-0">
                {failCount}
              </Badge>
              {errorCount > 0 && (
                <>
                  <span className="text-xs text-muted-foreground shrink-0">+</span>
                  <Badge variant="warning" className="font-mono text-xs shrink-0">
                    {errorCount} err
                  </Badge>
                </>
              )}
            </div>
          );
        },
        size: 150,
        meta: { align: 'right' },
      },
      {
        accessorKey: 'metrics.score',
        header: 'Raw score',
        cell: ({ getValue }) => {
          const value = getValue<number | undefined>();
          return <span className="font-mono tabular-nums">{value ? value.toFixed(2) : '-'}</span>;
        },
        size: 120,
        meta: { align: 'right' },
      },
    ],
    [showDatasetColumn],
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="border-b border-border bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
        <div className="container max-w-7xl mx-auto px-4 py-10">
          <h1 className="text-2xl font-bold tracking-tight">Evaluation History</h1>
          <p className="text-sm text-muted-foreground mt-1">View and compare all evaluation runs</p>
        </div>
      </div>
      <div className="container max-w-7xl mx-auto px-4 py-8">
        <Card className="bg-white dark:bg-zinc-900 p-4">
          <DataTable
            columns={columns}
            data={data}
            isLoading={isLoading}
            error={error}
            emptyMessage="No evaluation history found. Run an evaluation to see results here."
            onExportCSV={handleExportCSV}
            onExportJSON={handleExportJSON}
            initialSorting={[{ id: 'evalId', desc: true }]}
          />
        </Card>
      </div>

      {selectedPrompt && (
        <Dialog open={!!selectedPrompt} onOpenChange={(open) => !open && setSelectedPrompt(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Prompt Details
                <Badge variant="outline" className="font-mono text-xs">
                  {selectedPrompt.promptId.slice(0, 6)}
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-2 py-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Full Prompt</h4>
                <CopyButton value={selectedPrompt.raw} />
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border border-border max-h-96 overflow-y-auto">
                <pre className="text-sm whitespace-pre-wrap font-mono">{selectedPrompt.raw}</pre>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedPrompt(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
