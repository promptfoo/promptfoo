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
import { useTableStore } from './store';
import type { ColumnDef } from '@tanstack/react-table';

type MetricScore = {
  score: number;
  count: number;
  hasScore: boolean;
};

interface MetricRow {
  id: string;
  metric: string;
  [key: string]: string | MetricScore; // For dynamic prompt columns (prompt_${idx})
}

const MetricsTable = ({ onClose }: { onClose: () => void }) => {
  const { table, config } = useTableStore();
  const applyFilterFromMetric = useApplyFilterFromMetric();

  if (!table || !table.head || !table.head.prompts) {
    return null;
  }

  const policiesById = useCustomPoliciesMap(config?.redteam?.plugins ?? []);

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

  // Create columns for DataTable
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const columns: ColumnDef<MetricRow>[] = React.useMemo(() => {
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
      const columnId = `prompt_${idx}`;
      const providerName = prompt.provider;

      cols.push({
        accessorKey: `${columnId}_pass_rate`,
        header: `${providerName} - Pass Rate`,
        size: 150,
        cell: ({ row }) => {
          const metricScore = row.original[columnId] as MetricScore;
          const { hasScore, score, count } = metricScore;
          const percentage =
            hasScore && typeof count === 'number' && count > 0 ? (score / count) * 100 : 0;
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
        header: `${providerName} - Pass Count`,
        size: 120,
        cell: ({ row }) => {
          const metricScore = row.original[columnId] as MetricScore;
          const { hasScore, score } = metricScore;
          return <span className="text-sm">{hasScore ? score : 0}</span>;
        },
      });
      cols.push({
        accessorKey: `${columnId}_count`,
        header: `${providerName} - Test Count`,
        size: 120,
        cell: ({ row }) => {
          const metricScore = row.original[columnId] as MetricScore;
          const { count } = metricScore;
          return <span className="text-sm">{count}</span>;
        },
      });
    });

    cols.push({
      accessorKey: 'avg_pass_rate',
      header: 'Avg. Pass Rate',
      size: 150,
      cell: ({ row }) => {
        let promptCount = 0;
        let totalPassRate = 0;
        Object.entries(row.original).forEach(([key, value]) => {
          if (key.startsWith('prompt_')) {
            const { score, count, hasScore } = value as MetricScore;
            if (hasScore && typeof count === 'number' && count > 0) {
              promptCount++;
              totalPassRate += (score / count) * 100;
            }
          }
        });
        const percentage = promptCount > 0 ? totalPassRate / promptCount : 0;
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
  ]);

  // Create rows for DataTable
  const rows: MetricRow[] = React.useMemo(() => {
    return promptMetricNames.map((metric) => {
      const row: MetricRow = {
        id: metric,
        metric,
      };

      // Add data for each prompt
      table.head.prompts.forEach((prompt, idx) => {
        const score = prompt.metrics?.namedScores?.[metric];
        const count = prompt.metrics?.namedScoresCount?.[metric];
        const hasScore = score !== undefined;

        row[`prompt_${idx}`] = {
          score: score ?? 0,
          count: count ?? 0,
          hasScore,
        };
      });

      return row;
    });
  }, [promptMetricNames, table.head.prompts]);

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
