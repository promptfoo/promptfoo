import { useMemo } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useCustomPoliciesMap } from '@app/hooks/useCustomPoliciesMap';
import { cn } from '@app/lib/utils';
import {
  deserializePolicyIdFromMetric,
  formatPolicyIdentifierAsMetric,
  isPolicyMetric,
} from '@promptfoo/redteam/plugins/policy/utils';
import { useTableStore } from './store';

/**
 * Renders toggleable filter chips for metrics.
 * Shows in the filters section below table actions for red team evaluations.
 */
export function FilterChips() {
  const { filters, addFilter, removeFilter, config, table } = useTableStore();
  const policiesById = useCustomPoliciesMap(config?.redteam?.plugins ?? []);

  // Extract metrics from table with aggregated pass/test counts
  const metricsWithCounts = useMemo(() => {
    if (!table?.head?.prompts) {
      return [];
    }
    const metricMap = new Map<string, { passCount: number; testCount: number }>();

    table.head.prompts.forEach((prompt) => {
      if (prompt.metrics?.namedScores) {
        Object.keys(prompt.metrics.namedScores).forEach((metric) => {
          const existing = metricMap.get(metric) || { passCount: 0, testCount: 0 };
          const score = prompt.metrics?.namedScores?.[metric] ?? 0;
          const count = prompt.metrics?.namedScoresCount?.[metric] ?? 0;
          metricMap.set(metric, {
            passCount: existing.passCount + score,
            testCount: existing.testCount + count,
          });
        });
      }
    });

    return Array.from(metricMap.entries())
      .map(([metric, counts]) => ({ metric, ...counts }))
      .sort((a, b) => a.metric.localeCompare(b.metric));
  }, [table]);

  // Get display name for a metric (handles policy metrics)
  const getDisplayName = (metric: string): string => {
    if (isPolicyMetric(metric)) {
      const policyId = deserializePolicyIdFromMetric(metric);
      const policy = policiesById[policyId];
      if (policy) {
        return formatPolicyIdentifierAsMetric(policy.name ?? policy.id, metric);
      }
    }
    return metric;
  };

  // Check if a metric filter is active and get its ID
  const getActiveFilterId = useMemo(() => {
    return (metric: string): string | null => {
      if (!filters?.values) {
        return null;
      }
      const entry = Object.entries(filters.values).find(
        ([, f]) => f.type === 'metric' && f.field === metric,
      );
      return entry ? entry[0] : null;
    };
  }, [filters?.values]);

  // Get color classes based on pass rate
  const getPassRateStyles = (passCount: number, testCount: number, isActive: boolean): string => {
    if (isActive) {
      return 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/40 dark:border-blue-700 dark:text-blue-300';
    }

    if (testCount === 0) {
      return 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground';
    }

    const passRate = passCount / testCount;

    if (passRate < 0.5) {
      // Low pass rate - red (needs attention)
      return 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/50';
    } else if (passRate < 0.8) {
      // Medium pass rate - amber
      return 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/50';
    } else {
      // High pass rate - green
      return 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/50';
    }
  };

  // Only show for red team evals
  const isRedteam = config?.redteam !== undefined;
  if (!isRedteam) {
    return null;
  }

  // Don't render if no metrics available
  if (metricsWithCounts.length === 0) {
    return null;
  }

  const handleClick = (metric: string) => {
    const activeFilterId = getActiveFilterId(metric);
    if (activeFilterId) {
      removeFilter(activeFilterId);
    } else {
      addFilter({
        type: 'metric',
        operator: 'is_defined',
        value: '',
        field: metric,
        logicOperator: 'or',
      });
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {metricsWithCounts.map(({ metric, passCount, testCount }) => {
        const isActive = getActiveFilterId(metric) !== null;
        const passRate = testCount > 0 ? Math.round((passCount / testCount) * 100) : 0;
        return (
          <Tooltip key={`metric-${metric}`}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => handleClick(metric)}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer',
                  getPassRateStyles(passCount, testCount, isActive),
                )}
              >
                {getDisplayName(metric)}
                <span className="opacity-70">
                  ({passCount}/{testCount})
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {isActive ? 'Click to remove filter' : `${passRate}% pass rate — Click to filter`}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
