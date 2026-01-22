import { useMemo } from 'react';

import { DataTable } from '@app/components/data-table';
import { Badge } from '@app/components/ui/badge';
import { Button } from '@app/components/ui/button';
import { TEST_CASE_ROUTES } from '@app/constants/routes';
import { cn } from '@app/lib/utils';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TestCase } from '@app/hooks/useTestCases';
import type { ColumnDef } from '@tanstack/react-table';

interface TestCaseListProps {
  testCases: TestCase[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Formats a relative time string from a timestamp.
 */
function formatRelativeTime(timestamp: number | null | undefined): string {
  if (!timestamp) {
    return 'N/A';
  }
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return 'Just now';
}

/**
 * Truncates and formats variables for preview display.
 */
function formatVarsPreview(vars: Record<string, unknown> | undefined): string {
  if (!vars || Object.keys(vars).length === 0) {
    return '(no variables)';
  }

  const entries = Object.entries(vars).slice(0, 3);
  const formatted = entries.map(([key, value]) => {
    const strValue = typeof value === 'string' ? value : JSON.stringify(value);
    const truncated = strValue.length > 50 ? `${strValue.slice(0, 50)}...` : strValue;
    return `${key}: ${truncated}`;
  });

  if (Object.keys(vars).length > 3) {
    formatted.push(`+${Object.keys(vars).length - 3} more`);
  }

  return formatted.join(' | ');
}

/**
 * Mini progress bar for pass rate visualization.
 */
function PassRateBar({ passRate }: { passRate: number }) {
  const percentage = Math.round(passRate * 100);
  const barColor =
    percentage >= 80
      ? 'bg-emerald-500 dark:bg-emerald-600'
      : percentage >= 50
        ? 'bg-amber-500 dark:bg-amber-600'
        : 'bg-red-500 dark:bg-red-600';

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', barColor)} style={{ width: `${percentage}%` }} />
      </div>
      <span className="text-sm font-mono tabular-nums">{percentage}%</span>
    </div>
  );
}

/**
 * List view component for test cases using DataTable.
 * Displays test cases with their stats in a sortable, filterable table.
 */
export function TestCaseList({ testCases, isLoading, error }: TestCaseListProps) {
  const columns: ColumnDef<TestCase>[] = useMemo(
    () => [
      {
        accessorKey: 'vars',
        header: 'Preview',
        cell: ({ row }) => {
          const testCase = row.original;
          return (
            <div className="max-w-[300px]">
              <p className="text-sm text-muted-foreground truncate">
                {formatVarsPreview(testCase.vars)}
              </p>
              {testCase.description && (
                <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                  {testCase.description}
                </p>
              )}
            </div>
          );
        },
        size: 300,
      },
      {
        id: 'passRate',
        header: 'Pass Rate',
        accessorFn: (row) => row.stats?.passRate ?? 0,
        cell: ({ row }) => {
          const passRate = row.original.stats?.passRate ?? 0;
          return <PassRateBar passRate={passRate} />;
        },
        size: 140,
      },
      {
        id: 'evalCount',
        header: 'Evals',
        accessorFn: (row) => row.stats?.evalCount ?? 0,
        cell: ({ row }) => (
          <Badge variant="secondary" className="font-mono">
            {row.original.stats?.evalCount ?? 0}
          </Badge>
        ),
        size: 80,
      },
      {
        id: 'avgScore',
        header: 'Avg Score',
        accessorFn: (row) => row.stats?.avgScore ?? 0,
        cell: ({ row }) => {
          const score = row.original.stats?.avgScore;
          return (
            <span className="text-sm font-mono tabular-nums">
              {score != null ? score.toFixed(2) : '-'}
            </span>
          );
        },
        size: 90,
      },
      {
        id: 'lastSeen',
        header: 'Last Seen',
        accessorFn: (row) => row.stats?.lastSeenAt ?? 0,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatRelativeTime(row.original.stats?.lastSeenAt)}
          </span>
        ),
        size: 100,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" asChild>
            <Link to={TEST_CASE_ROUTES.DETAIL(row.original.id)}>
              <ExternalLink className="size-4" />
              <span className="sr-only">View details</span>
            </Link>
          </Button>
        ),
        size: 60,
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={testCases}
      isLoading={isLoading}
      error={error}
      emptyMessage="No test cases found. Run an evaluation to start tracking test cases."
      initialSorting={[{ id: 'lastSeen', desc: true }]}
    />
  );
}
