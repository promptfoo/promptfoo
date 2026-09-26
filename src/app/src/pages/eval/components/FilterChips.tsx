import { useMemo, useState } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useCustomPoliciesMap } from '@app/hooks/useCustomPoliciesMap';
import { cn } from '@app/lib/utils';
import {
  deserializePolicyIdFromMetric,
  formatPolicyIdentifierAsMetric,
  isPolicyMetric,
} from '@promptfoo/redteam/plugins/policy/utils';
import { CheckCircle, ChevronDown, ChevronUp, XCircle } from 'lucide-react';
import { useTableStore } from './store';
import { getNamedMetricTotal, mergeFilteredNamedMetrics } from './utils';

const DEFAULT_VISIBLE_COUNT = 8;

/**
 * Renders toggleable filter chips for metrics.
 * Shows in the filters section below table actions for red team evaluations.
 */
export function FilterChips() {
  const { filters, addFilter, removeFilter, config, table } = useTableStore();
  const policiesById = useCustomPoliciesMap(config?.redteam?.plugins ?? []);
  const [isExpanded, setIsExpanded] = useState(false);

  // Extract metrics from table with aggregated pass/test counts
  const metricsWithCounts = useMemo(() => {
    if (!table?.head?.prompts) {
      return [];
    }
    const metricMap = new Map<string, { score: number; denominator: number | undefined }>();
    const derivedMetricNames = config?.derivedMetrics?.map((metric) => metric.name) ?? [];

    table.head.prompts.forEach((prompt) => {
      const metrics = mergeFilteredNamedMetrics(prompt.metrics, null, derivedMetricNames);
      if (metrics?.namedScores) {
        Object.entries(metrics.namedScores).forEach(([metric, score]) => {
          if (!Number.isFinite(score)) {
            return;
          }
          const existing = metricMap.get(metric) ?? { score: 0, denominator: 0 };
          const denominator = getNamedMetricTotal(metrics, metric);
          metricMap.set(metric, {
            score: existing.score + score,
            denominator:
              existing.denominator === undefined || denominator === undefined
                ? undefined
                : existing.denominator + denominator,
          });
        });
      }
    });

    return (
      Array.from(metricMap.entries())
        .map(([metric, { score, denominator }]) => ({
          metric,
          score,
          denominator,
          percentage:
            denominator !== undefined &&
            Number.isFinite(denominator) &&
            denominator !== 0 &&
            Number.isFinite((score / denominator) * 100)
              ? (score / denominator) * 100
              : undefined,
        }))
        // Sort by pass rate (lowest first) so most concerning metrics appear first when collapsed
        .sort((a, b) => {
          const rateA = a.percentage ?? Number.POSITIVE_INFINITY;
          const rateB = b.percentage ?? Number.POSITIVE_INFINITY;
          if (rateA !== rateB) {
            return rateA - rateB;
          }
          return a.metric.localeCompare(b.metric);
        })
    );
  }, [config?.derivedMetrics, table]);

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

  const getChipStyles = (isActive: boolean): string => {
    if (isActive) {
      return 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/40 dark:border-blue-700 dark:text-blue-300';
    }
    return 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground';
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

  // Determine which chips to show
  const hasMoreChips = metricsWithCounts.length > DEFAULT_VISIBLE_COUNT;
  const visibleMetrics = isExpanded
    ? metricsWithCounts
    : metricsWithCounts.slice(0, DEFAULT_VISIBLE_COUNT);
  const hiddenCount = metricsWithCounts.length - DEFAULT_VISIBLE_COUNT;

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
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Filter by metric:</span>
      {visibleMetrics.map(({ metric, score, denominator, percentage }) => {
        const isActive = getActiveFilterId(metric) !== null;
        return (
          <Tooltip key={`metric-${metric}`}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => handleClick(metric)}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-border transition-colors cursor-pointer',
                  getChipStyles(isActive),
                )}
              >
                {percentage !== undefined &&
                  (percentage < 100 ? (
                    <XCircle className="size-3 text-red-500 dark:text-red-400" />
                  ) : (
                    <CheckCircle className="size-3 text-emerald-500 dark:text-emerald-400" />
                  ))}
                {getDisplayName(metric)}
                <span className="opacity-70">
                  ({score}/{denominator ?? '—'})
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {isActive
                ? 'Click to remove filter'
                : percentage === undefined
                  ? 'Percentage unavailable — Click to filter'
                  : `${Math.round(percentage)}% pass rate — Click to filter`}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {hasMoreChips && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer',
            'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="size-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />+{hiddenCount} more
            </>
          )}
        </button>
      )}
    </div>
  );
}
