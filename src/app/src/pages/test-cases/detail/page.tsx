import { useMemo } from 'react';

import { DataTable } from '@app/components/data-table';
import { PageContainer } from '@app/components/layout/PageContainer';
import { PageHeader } from '@app/components/layout/PageHeader';
import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@app/components/ui/card';
import { CopyButton } from '@app/components/ui/copy-button';
import { Skeleton } from '@app/components/ui/skeleton';
import { EVAL_ROUTES, TEST_CASE_ROUTES } from '@app/constants/routes';
import { usePageMeta } from '@app/hooks/usePageMeta';
import {
  type TestCaseHistoryEntry,
  useTestCase,
  useTestCaseHistory,
} from '@app/hooks/useTestCases';
import { TestCaseStatsPanel } from '@app/pages/eval/components/TestCaseStatsPanel';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';

/**
 * Formats a timestamp to a readable date string.
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formats latency in milliseconds to a readable string.
 */
function formatLatency(ms: number | null): string {
  if (ms === null) {
    return '-';
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Formats cost to a readable string.
 */
function formatCost(cost: number | null): string {
  if (cost === null) {
    return '-';
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Component displaying the variables of a test case.
 */
function VariablesCard({ vars }: { vars: Record<string, unknown> | undefined }) {
  if (!vars || Object.keys(vars).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Variables</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No variables defined for this test case.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Variables</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Object.entries(vars).map(([key, value]) => (
            <div key={key} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{key}</span>
                <CopyButton
                  value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                />
              </div>
              <div className="p-2 rounded bg-muted/50 overflow-x-auto">
                <pre className="text-sm whitespace-pre-wrap font-mono">
                  {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Component displaying evaluation history for this test case.
 */
function EvaluationHistoryTable({
  history,
  loading,
  hasMore,
  onLoadMore,
}: {
  history: TestCaseHistoryEntry[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const columns: ColumnDef<TestCaseHistoryEntry>[] = useMemo(
    () => [
      {
        accessorKey: 'evalId',
        header: 'Eval',
        cell: ({ getValue }) => (
          <Link
            to={EVAL_ROUTES.DETAIL(getValue<string>())}
            className="text-primary hover:underline font-mono text-sm"
          >
            {getValue<string>().slice(0, 8)}
          </Link>
        ),
        size: 100,
      },
      {
        accessorKey: 'evalCreatedAt',
        header: 'Date',
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{formatDate(getValue<number>())}</span>
        ),
        size: 160,
      },
      {
        accessorKey: 'success',
        header: 'Result',
        cell: ({ getValue }) => {
          const success = getValue<boolean>();
          return success ? (
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="size-4" />
              <span className="text-sm">Pass</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
              <XCircle className="size-4" />
              <span className="text-sm">Fail</span>
            </div>
          );
        },
        size: 80,
      },
      {
        accessorKey: 'score',
        header: 'Score',
        cell: ({ getValue }) => (
          <span className="text-sm font-mono tabular-nums">{getValue<number>().toFixed(2)}</span>
        ),
        size: 80,
      },
      {
        accessorKey: 'provider',
        header: 'Provider',
        cell: ({ getValue }) => {
          const provider = getValue<{ id: string; label?: string }>();
          return (
            <span className="text-sm">
              {provider.label || provider.id.split(':').pop() || provider.id}
            </span>
          );
        },
        size: 120,
      },
      {
        accessorKey: 'latencyMs',
        header: 'Latency',
        cell: ({ getValue }) => (
          <span className="text-sm font-mono tabular-nums">
            {formatLatency(getValue<number | null>())}
          </span>
        ),
        size: 90,
      },
      {
        accessorKey: 'cost',
        header: 'Cost',
        cell: ({ getValue }) => (
          <span className="text-sm font-mono tabular-nums">
            {formatCost(getValue<number | null>())}
          </span>
        ),
        size: 80,
      },
    ],
    [],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Evaluation History</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={history}
          isLoading={loading && history.length === 0}
          emptyMessage="No evaluation history found for this test case."
          initialSorting={[{ id: 'evalCreatedAt', desc: true }]}
        />
        {hasMore && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={onLoadMore} disabled={loading}>
              {loading ? 'Loading...' : 'Load More'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TestCaseDetailContent() {
  const { id } = useParams<{ id: string }>();
  const { testCase, loading: testCaseLoading, error: testCaseError } = useTestCase(id);
  const { history, loading: historyLoading, hasMore, loadMore } = useTestCaseHistory(id);

  if (testCaseLoading) {
    return (
      <PageContainer className="fixed top-14 left-0 right-0 bottom-0 flex flex-col overflow-auto">
        <PageHeader>
          <div className="container max-w-5xl mx-auto p-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
        </PageHeader>
        <div className="container max-w-5xl mx-auto p-6 space-y-6">
          <Skeleton className="h-40" />
          <Skeleton className="h-60" />
          <Skeleton className="h-80" />
        </div>
      </PageContainer>
    );
  }

  if (testCaseError || !testCase) {
    return (
      <PageContainer className="fixed top-14 left-0 right-0 bottom-0 flex flex-col overflow-auto">
        <div className="container max-w-5xl mx-auto p-6">
          <Button variant="ghost" asChild className="mb-4">
            <Link to={TEST_CASE_ROUTES.LIST}>
              <ArrowLeft className="size-4 mr-2" />
              Back to Test Cases
            </Link>
          </Button>
          <Card className="p-6">
            <p className="text-muted-foreground">{testCaseError || 'Test case not found.'}</p>
          </Card>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="fixed top-14 left-0 right-0 bottom-0 flex flex-col overflow-auto">
      <PageHeader>
        <div className="container max-w-5xl mx-auto p-6">
          <div className="flex items-center gap-4 mb-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to={TEST_CASE_ROUTES.LIST}>
                <ArrowLeft className="size-4 mr-1" />
                Back
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Test Case</h1>
            <Badge variant="outline" className="font-mono text-xs">
              {testCase.id.slice(0, 16)}...
            </Badge>
            <CopyButton value={testCase.id} />
          </div>
          {testCase.description && (
            <p className="text-sm text-muted-foreground mt-1">{testCase.description}</p>
          )}
        </div>
      </PageHeader>

      <div className="container max-w-5xl mx-auto p-6 space-y-6">
        {/* Stats Panel */}
        <Card>
          <CardContent className="pt-6">
            <TestCaseStatsPanel testCaseId={testCase.id} />
          </CardContent>
        </Card>

        {/* Variables */}
        <VariablesCard vars={testCase.vars} />

        {/* Evaluation History */}
        <EvaluationHistoryTable
          history={history}
          loading={historyLoading}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />
      </div>
    </PageContainer>
  );
}

export default function TestCaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  usePageMeta({
    title: `Test Case ${id?.slice(0, 8) || ''}`,
    description: 'Test case details and history',
  });

  return <TestCaseDetailContent />;
}
