import React from 'react';

import { DataTable } from '@app/components/data-table/data-table';
import { Button } from '@app/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@app/components/ui/dialog';
import { FilterIcon } from '@app/components/ui/icons';
import { useCustomPoliciesMap } from '@app/hooks/useCustomPoliciesMap';
import { cn } from '@app/lib/utils';
import {
  deserializePolicyIdFromMetric,
  formatPolicyIdentifierAsMetric,
  isPolicyMetric,
} from '@promptfoo/redteam/plugins/policy/utils';
import { useApplyFilterFromMetric } from './hooks';
import {
  getMetricAverage,
  getMetricDisplayKind,
  getMetricDisplayKinds,
  type MetricDisplayKind,
} from './metricDisplay';
import { useTableStore } from './store';
import type { ColumnDef } from '@tanstack/react-table';

type MetricScore = {
  score: number;
  count: number;
  hasScore: boolean;
};

type PromptMetricColumnKey = `prompt_${number}`;

type MetricRow = {
  id: string;
  metric: string;
  kind: MetricDisplayKind;
} & Partial<Record<PromptMetricColumnKey, MetricScore>>;

function formatMetricNumber(value: number): string {
  return value.toFixed(Math.abs(value) >= 1 ? 2 : 4);
}

const MetricsTable = ({ onClose }: { onClose: () => void }) => {
  const { table, config } = useTableStore();
  const applyFilterFromMetric = useApplyFilterFromMetric();

  if (!table || !table.head || !table.head.prompts) {
    return null;
  }

  const policiesById = useCustomPoliciesMap(config?.redteam?.plugins ?? []);
  const metricKinds = React.useMemo(() => getMetricDisplayKinds(table), [table]);

  /**
   * Given the pass rate percentages, calculates the Tailwind classes for the cell.
   * Uses a diverging RdYlGn scale.
   * @param percentage - The pass rate percentage.
   * @returns The Tailwind class names for styling.
   * @see https://observablehq.com/@d3/color-schemes#diverging
   */
  const getPercentageClasses = React.useCallback((percentage: number): string => {
    if (percentage >= 75) {
      if (percentage >= 90) {
        return 'bg-green-900/90 text-white dark:bg-green-800/90';
      }
      if (percentage >= 80) {
        return 'bg-green-800/90 text-white dark:bg-green-700/90';
      }
      return 'bg-green-700/90 text-white dark:bg-green-600/90';
    }
    if (percentage >= 50) {
      if (percentage >= 70) {
        return 'bg-orange-900/90 text-white dark:bg-orange-800/90';
      }
      if (percentage >= 60) {
        return 'bg-orange-800/90 text-white dark:bg-orange-700/90';
      }
      return 'bg-orange-700/90 text-white dark:bg-orange-600/90';
    }
    // Red scale for low percentages
    if (percentage <= 10) {
      return 'bg-red-900 text-white dark:bg-red-800';
    }
    if (percentage <= 20) {
      return 'bg-red-800 text-white dark:bg-red-700';
    }
    if (percentage <= 30) {
      return 'bg-red-600 text-white dark:bg-red-500';
    }
    if (percentage <= 40) {
      return 'bg-red-500 text-white dark:bg-red-400 dark:text-black';
    }
    return 'bg-red-400 text-white dark:bg-red-300 dark:text-black';
  }, []);

  /**
   * Applies the metric as a filter and closes the dialog.
   */
  const handleMetricFilterClick = React.useCallback(
    (metric: string) => {
      applyFilterFromMetric(metric);
      onClose();
    },
    [applyFilterFromMetric, onClose],
  );

  // Extract aggregated metric names from prompts
  const promptMetricNames = React.useMemo(() => {
    const metrics = new Set<string>();
    table.head.prompts.forEach((prompt) => {
      if (prompt.metrics?.namedScores) {
        Object.keys(prompt.metrics.namedScores).forEach((metric) => metrics.add(metric));
      }
    });
    return Array.from(metrics).sort();
  }, [table.head.prompts]);

  const hasValueMetrics = React.useMemo(() => {
    return promptMetricNames.some((metric) => {
      const counts = table.head.prompts.map((prompt) => prompt.metrics?.namedScoresCount?.[metric]);
      return getMetricDisplayKind(metric, metricKinds, counts) === 'value';
    });
  }, [metricKinds, promptMetricNames, table.head.prompts]);

  // Create columns for DataTable
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const columns: ColumnDef<MetricRow>[] = React.useMemo(() => {
    const rateHeader = hasValueMetrics ? 'Average' : 'Pass Rate';
    const totalHeader = hasValueMetrics ? 'Total' : 'Pass Count';
    const countHeader = hasValueMetrics ? 'Count' : 'Test Count';
    const overallHeader = hasValueMetrics ? 'Avg.' : 'Avg. Pass Rate';

    const cols: ColumnDef<MetricRow>[] = [
      {
        accessorKey: 'metric',
        header: 'Metric',
        size: 300,
        cell: ({ getValue }) => {
          const value = getValue<string>();
          if (isPolicyMetric(value)) {
            const policyId = deserializePolicyIdFromMetric(value);
            const policy = policiesById[policyId];
            if (!policy) {
              return value;
            }
            return formatPolicyIdentifierAsMetric(policy.name ?? policy.id, value);
          }
          return value;
        },
      },
    ];

    // Add a column for each prompt
    table.head.prompts.forEach((prompt, idx) => {
      const columnId = `prompt_${idx}` as PromptMetricColumnKey;
      const providerName = prompt.provider;

      cols.push({
        accessorKey: `${columnId}_pass_rate`,
        header: `${providerName} - ${rateHeader}`,
        size: 150,
        cell: ({ row }) => {
          const metricScore = row.original[columnId];
          const metricKind = row.original.kind;

          if (!metricScore) {
            return <span className="text-sm">0</span>;
          }

          const { hasScore, score, count } = metricScore;

          if (!hasScore) {
            return <span className="text-sm">0</span>;
          }

          if (metricKind === 'value') {
            return (
              <div className="flex justify-end items-center h-full">
                <span className="text-sm">
                  {formatMetricNumber(getMetricAverage('value', score, count))}
                </span>
              </div>
            );
          }

          const percentage = getMetricAverage('percentage', score, count);
          const classes = getPercentageClasses(percentage);

          return (
            <div className="flex justify-end items-center h-full">
              <span
                className={cn(
                  'rounded px-2 py-1 text-sm font-medium inline-flex justify-center items-center min-w-20',
                  classes,
                )}
              >
                {percentage.toFixed(2)}%
              </span>
            </div>
          );
        },
      });
      cols.push({
        accessorKey: `${columnId}_score`,
        header: `${providerName} - ${totalHeader}`,
        size: 120,
        cell: ({ row }) => {
          const metricScore = row.original[columnId];

          if (!metricScore) {
            return <span className="text-sm">0</span>;
          }

          const { hasScore, score } = metricScore;
          return <span className="text-sm">{hasScore ? formatMetricNumber(score) : '0'}</span>;
        },
      });
      cols.push({
        accessorKey: `${columnId}_count`,
        header: `${providerName} - ${countHeader}`,
        size: 120,
        cell: ({ row }) => {
          const metricScore = row.original[columnId];
          const metricKind = row.original.kind;

          if (!metricScore) {
            return <span className="text-sm">0</span>;
          }

          const { count } = metricScore;
          if (metricKind === 'value' && count === 0) {
            return <span className="text-sm">-</span>;
          }
          return <span className="text-sm">{count}</span>;
        },
      });
    });

    cols.push({
      accessorKey: 'avg_pass_rate',
      header: overallHeader,
      size: 150,
      cell: ({ row }) => {
        let promptCount = 0;
        let totalAverage = 0;
        const metricKind = row.original.kind;

        table.head.prompts.forEach((_prompt, promptIdx) => {
          const metricScore = row.original[`prompt_${promptIdx}` as PromptMetricColumnKey];
          if (!metricScore?.hasScore) {
            return;
          }

          promptCount++;
          totalAverage += getMetricAverage(metricKind, metricScore.score, metricScore.count);
        });
        const average = promptCount > 0 ? totalAverage / promptCount : 0;

        if (metricKind === 'value') {
          return (
            <div className="flex justify-end items-center h-full">
              <span className="text-sm">{formatMetricNumber(average)}</span>
            </div>
          );
        }

        const classes = getPercentageClasses(average);

        return (
          <div className="flex justify-end items-center h-full">
            <span
              className={cn(
                'rounded px-2 py-1 text-sm font-medium inline-flex justify-center items-center min-w-20',
                classes,
              )}
            >
              {average.toFixed(2)}%
            </span>
          </div>
        );
      },
    });

    // Actions Column:
    cols.push({
      id: 'actions',
      header: '',
      size: 80,
      cell: ({ row }) => {
        return (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleMetricFilterClick(row.original.metric)}
              className="filter-icon size-8 p-0"
            >
              <FilterIcon className="size-4" />
            </Button>
          </div>
        );
      },
    });

    return cols;
  }, [
    table.head.prompts,
    promptMetricNames,
    policiesById,
    getPercentageClasses,
    handleMetricFilterClick,
    hasValueMetrics,
    metricKinds,
  ]);

  // Create rows for DataTable
  const rows: MetricRow[] = React.useMemo(() => {
    return promptMetricNames.map((metric) => {
      const counts = table.head.prompts.map((prompt) => prompt.metrics?.namedScoresCount?.[metric]);
      const row: MetricRow = {
        id: metric,
        metric,
        kind: getMetricDisplayKind(metric, metricKinds, counts),
      };

      // Add data for each prompt
      table.head.prompts.forEach((prompt, idx) => {
        const columnId = `prompt_${idx}` as PromptMetricColumnKey;
        const score = prompt.metrics?.namedScores?.[metric];
        const count = prompt.metrics?.namedScoresCount?.[metric];
        const hasScore = score !== undefined;

        row[columnId] = {
          score: score ?? 0,
          count: count ?? 0,
          hasScore,
        };
      });

      return row;
    });
  }, [metricKinds, promptMetricNames, table.head.prompts]);

  if (promptMetricNames.length === 0) {
    return null;
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      initialSorting={[{ id: 'metric', desc: false }]}
      initialPageSize={50}
      emptyMessage="No metrics available"
      showToolbar
      showFilter
      showPagination
      showColumnToggle
    />
  );
};

export default function CustomMetricsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-[90vw] h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Custom Metrics</DialogTitle>
        </DialogHeader>
        <MetricsTable onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}
