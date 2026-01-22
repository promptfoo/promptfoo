import { Badge } from '@app/components/ui/badge';
import { Skeleton } from '@app/components/ui/skeleton';
import { useTestCaseStats } from '@app/hooks/useTestCaseStats';
import { AlertCircle, History } from 'lucide-react';

function formatDate(timestamp: number | null): string {
  if (!timestamp) {
    return 'N/A';
  }
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatLatency(ms: number | null): string {
  if (ms === null) {
    return 'N/A';
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatCost(cost: number | null): string {
  if (cost === null) {
    return 'N/A';
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

interface TestCaseStatsPanelProps {
  testCaseId: string;
}

/**
 * Displays historical statistics for a test case across multiple evaluations.
 * Shows pass rate, average score, latency, and cost trends over time.
 */
export function TestCaseStatsPanel({ testCaseId }: TestCaseStatsPanelProps) {
  const { stats, loading, error } = useTestCaseStats(testCaseId);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="size-4" />
        <span>Unable to load stats: {error}</span>
      </div>
    );
  }

  if (!stats || stats.totalResults === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          No historical data available for this test case.
        </p>
        <p className="text-xs text-muted-foreground">
          Test case tracking is available for evals run after the feature was enabled. Run the
          backfill command to populate history for existing evals.
        </p>
      </div>
    );
  }

  const passRatePercent = (stats.passRate * 100).toFixed(1);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <History className="size-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">Test Case History</h4>
        <Badge variant="secondary" className="text-xs">
          {stats.evalCount} eval{stats.evalCount !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Stats Grid - matching StrategyStats pattern */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* Pass Rate */}
          <div className="text-center">
            <p className="text-2xl font-bold">{passRatePercent}%</p>
            <p className="text-sm text-muted-foreground">Pass Rate</p>
            <p className="text-xs text-muted-foreground">
              ({stats.passCount}/{stats.totalResults})
            </p>
          </div>

          {/* Average Score */}
          <div className="text-center">
            <p className="text-2xl font-bold">{stats.avgScore.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">Avg Score</p>
          </div>

          {/* Average Latency */}
          <div className="text-center">
            <p className="text-2xl font-bold">{formatLatency(stats.avgLatencyMs)}</p>
            <p className="text-sm text-muted-foreground">Avg Latency</p>
          </div>

          {/* Average Cost */}
          <div className="text-center">
            <p className="text-2xl font-bold">{formatCost(stats.avgCost)}</p>
            <p className="text-sm text-muted-foreground">Avg Cost</p>
          </div>
        </div>
      </div>

      {/* Error/Fail breakdown */}
      {(stats.failCount > 0 || stats.errorCount > 0) && (
        <div className="flex gap-2 text-xs">
          {stats.failCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {stats.failCount} assertion failure{stats.failCount !== 1 ? 's' : ''}
            </Badge>
          )}
          {stats.errorCount > 0 && (
            <Badge
              variant="outline"
              className="text-xs border-amber-500 text-amber-700 dark:text-amber-400"
            >
              {stats.errorCount} error{stats.errorCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      )}

      {/* Time range */}
      <div className="text-xs text-muted-foreground">
        First seen: {formatDate(stats.firstSeenAt)} · Last seen: {formatDate(stats.lastSeenAt)}
      </div>
    </div>
  );
}
