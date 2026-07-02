import React from 'react';

import { DataTable } from '@app/components/data-table/data-table';
import { Button } from '@app/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@app/components/ui/dialog';
import { FilterIcon } from '@app/components/ui/icons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@app/components/ui/tooltip';
import { useCustomPoliciesMap } from '@app/hooks/useCustomPoliciesMap';
import { cn } from '@app/lib/utils';
import {
  deserializePolicyIdFromMetric,
  formatPolicyIdentifierAsMetric,
  isPolicyMetric,
} from '@promptfoo/redteam/plugins/policy/utils';
import { useApplyFilterFromMetric } from './hooks';
import { useTableStore } from './store';
import { getNamedMetricTotal, mergeFilteredNamedMetrics } from './utils';
import type { EvaluateTable } from '@promptfoo/types';
import type { ColumnDef } from '@tanstack/react-table';

type MetricScore = {
  score: number;
  total: number;
  hasScore: boolean;
};

interface MetricRow {
  id: string;
  metric: string;
  [key: string]: string | MetricScore; // For dynamic prompt columns (prompt_${idx})
}

type PromptHeader = EvaluateTable['head']['prompts'][number];

function hasValidDenominator({ hasScore, total }: MetricScore): boolean {
  return hasScore && Number.isFinite(total) && total !== 0;
}

function getMetricPercentage(metricScore: MetricScore): number {
  const { score, total } = metricScore;
  return hasValidDenominator(metricScore) ? (score / total) * 100 : 0;
}

function getPromptMetricScores(row: MetricRow): MetricScore[] {
  return Object.entries(row)
    .filter(([key]) => key.startsWith('prompt_'))
    .map(([, value]) => value as MetricScore);
}

function formatCompactMetricNumber(value: number): string {
  return Intl.NumberFormat(undefined, {
    maximumFractionDigits: 6,
  }).format(value);
}

function getAveragePassRate(row: MetricRow): number {
  const promptScores = getPromptMetricScores(row);
  let promptCount = 0;
  let totalPassRate = 0;

  promptScores.forEach((metricScore) => {
    if (hasValidDenominator(metricScore)) {
      promptCount++;
      totalPassRate += getMetricPercentage(metricScore);
    }
  });

  return promptCount > 0 ? totalPassRate / promptCount : 0;
}

function getPassRateSpread(row: MetricRow): number | null {
  const validPassRates = getPromptMetricScores(row)
    .filter(hasValidDenominator)
    .map((metricScore) => getMetricPercentage(metricScore));

  if (validPassRates.length < 2) {
    return null;
  }

  return Math.max(...validPassRates) - Math.min(...validPassRates);
}

function formatProviderLabel(prompt: PromptHeader, index: number): string {
  if (typeof prompt.provider === 'string' && prompt.provider.trim()) {
    return prompt.provider;
  }

  return `Prompt ${index + 1}`;
}

function getPromptHeaderTitle(prompt: PromptHeader, index: number): string {
  const providerLabel = formatProviderLabel(prompt, index);
  const promptLabel = prompt.label || prompt.display || prompt.raw;
  return promptLabel ? `${providerLabel} - ${promptLabel}` : providerLabel;
}

function getPromptMetricToggleLabel(
  prompt: PromptHeader,
  index: number,
  metricLabel: string,
): string {
  const providerLabel = formatProviderLabel(prompt, index);
  const defaultPromptLabel = `Prompt ${index + 1}`;
  const providerSuffix = providerLabel === defaultPromptLabel ? '' : ` - ${providerLabel}`;

  return `${defaultPromptLabel}${providerSuffix} - ${metricLabel}`;
}

function PromptMetricGroupHeader({ prompt, index }: { prompt: PromptHeader; index: number }) {
  const providerLabel = formatProviderLabel(prompt, index);

  return (
    <div
      className="min-w-0 rounded-md border border-blue-100 bg-blue-50/70 px-3 py-2 dark:border-blue-900/70 dark:bg-blue-950/30"
      title={getPromptHeaderTitle(prompt, index)}
    >
      <span className="block text-[11px] font-medium uppercase text-blue-700 dark:text-blue-300">
        Prompt {index + 1}
      </span>
      <span className="block truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
        {providerLabel}
      </span>
    </div>
  );
}

function SummaryMetricGroupHeader() {
  return (
    <div className="min-w-0 rounded-md border border-zinc-200 bg-zinc-100/80 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/80">
      <span className="block text-[11px] font-medium uppercase text-zinc-600 dark:text-zinc-300">
        Summary
      </span>
      <span className="block truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
        Across prompts
      </span>
    </div>
  );
}

const MetricsTable = ({ onClose }: { onClose: () => void }) => {
  const { table, config, filteredMetrics } = useTableStore();
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
  const getPercentageTextClasses = React.useCallback((percentage: number): string => {
    if (percentage >= 75) {
      if (percentage >= 90) {
        return 'text-emerald-700 dark:text-emerald-300';
      }
      if (percentage >= 80) {
        return 'text-green-700 dark:text-green-300';
      }
      return 'text-green-600 dark:text-green-300';
    }
    if (percentage >= 50) {
      if (percentage >= 70) {
        return 'text-amber-700 dark:text-amber-300';
      }
      if (percentage >= 60) {
        return 'text-orange-700 dark:text-orange-300';
      }
      return 'text-orange-600 dark:text-orange-300';
    }
    // Red scale for low percentages
    if (percentage <= 10) {
      return 'text-red-800 dark:text-red-300';
    }
    if (percentage <= 20) {
      return 'text-red-700 dark:text-red-300';
    }
    if (percentage <= 30) {
      return 'text-red-600 dark:text-red-300';
    }
    if (percentage <= 40) {
      return 'text-red-500 dark:text-red-300';
    }
    return 'text-red-400 dark:text-red-300';
  }, []);

  const renderPercentageValue = React.useCallback(
    (percentage: number) => {
      const classes = getPercentageTextClasses(percentage);

      return (
        <div className="flex h-full items-center justify-end">
          <span className={cn('text-sm font-semibold tabular-nums', classes)}>
            {percentage.toFixed(2)}%
          </span>
        </div>
      );
    },
    [getPercentageTextClasses],
  );

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

  const hasCompleteFilteredMetrics = filteredMetrics?.length === table.head.prompts.length;
  const derivedMetricNames = React.useMemo(
    () => config?.derivedMetrics?.map((metric) => metric.name) ?? [],
    [config?.derivedMetrics],
  );
  const totalMetricNames = React.useMemo(() => {
    const names = new Set<string>();
    if (!hasCompleteFilteredMetrics) {
      return names;
    }
    for (const metricName of derivedMetricNames) {
      table.head.prompts.forEach((prompt, idx) => {
        if (
          Object.prototype.hasOwnProperty.call(prompt.metrics?.namedScores ?? {}, metricName) &&
          !Object.prototype.hasOwnProperty.call(
            filteredMetrics?.[idx]?.namedScores ?? {},
            metricName,
          )
        ) {
          names.add(metricName);
        }
      });
    }
    return names;
  }, [derivedMetricNames, filteredMetrics, hasCompleteFilteredMetrics, table.head.prompts]);
  const displayMetrics = React.useMemo(
    () =>
      table.head.prompts.map((prompt, idx) =>
        mergeFilteredNamedMetrics(
          prompt.metrics,
          hasCompleteFilteredMetrics ? (filteredMetrics?.[idx] ?? null) : null,
          derivedMetricNames,
        ),
      ),
    [derivedMetricNames, filteredMetrics, hasCompleteFilteredMetrics, table.head.prompts],
  );

  // Extract aggregated metric names from prompts
  const promptMetricNames = React.useMemo(() => {
    const metrics = new Set<string>();
    displayMetrics.forEach((promptMetrics) => {
      if (promptMetrics?.namedScores) {
        Object.keys(promptMetrics.namedScores).forEach((metric) => metrics.add(metric));
      }
    });
    return Array.from(metrics).sort();
  }, [displayMetrics]);

  // Create columns for DataTable
  const columns: ColumnDef<MetricRow>[] = React.useMemo(() => {
    const cols: ColumnDef<MetricRow>[] = [
      {
        accessorKey: 'metric',
        header: 'Metric',
        size: 240,
        enableHiding: false,
        meta: {
          sticky: 'left',
        },
        cell: ({ getValue }) => {
          const value = getValue<string>();
          let displayValue = value;
          if (isPolicyMetric(value)) {
            const policyId = deserializePolicyIdFromMetric(value);
            const policy = policiesById[policyId];
            if (!policy) {
              return value;
            }
            displayValue = formatPolicyIdentifierAsMetric(policy.name ?? policy.id, value);
          }
          if (totalMetricNames.has(value)) {
            return (
              <span title="Derived metric from the unfiltered evaluation">
                {displayValue} (total)
              </span>
            );
          }
          return displayValue;
        },
      },
    ];

    // Add a column for each prompt
    table.head.prompts.forEach((prompt, idx) => {
      const columnId = `prompt_${idx}`;

      cols.push({
        id: `${columnId}_group`,
        header: () => <PromptMetricGroupHeader prompt={prompt} index={idx} />,
        columns: [
          {
            accessorKey: `${columnId}_pass_rate`,
            header: 'Pass',
            size: 112,
            enableSorting: false,
            enableColumnFilter: false,
            meta: {
              align: 'right',
              columnToggleLabel: getPromptMetricToggleLabel(prompt, idx, 'Pass'),
            },
            cell: ({ row }) => {
              const metricScore = row.original[columnId] as MetricScore;
              return renderPercentageValue(getMetricPercentage(metricScore));
            },
          },
          {
            accessorKey: `${columnId}_score`,
            header: 'Score',
            size: 112,
            enableSorting: false,
            enableColumnFilter: false,
            meta: {
              align: 'right',
              columnToggleLabel: getPromptMetricToggleLabel(prompt, idx, 'Score'),
            },
            cell: ({ row }) => {
              const metricScore = row.original[columnId] as MetricScore;
              const { hasScore, score } = metricScore;
              const displayValue = hasScore ? formatCompactMetricNumber(score) : '0';
              return (
                <span className="text-sm" title={hasScore ? String(score) : '0'}>
                  {displayValue}
                </span>
              );
            },
          },
          {
            accessorKey: `${columnId}_total`,
            header: 'Denominator',
            size: 112,
            enableSorting: false,
            enableColumnFilter: false,
            meta: {
              align: 'right',
              columnToggleLabel: getPromptMetricToggleLabel(prompt, idx, 'Denominator'),
            },
            cell: ({ row }) => {
              const metricScore = row.original[columnId] as MetricScore;
              const { total } = metricScore;
              return <span className="text-sm">{total}</span>;
            },
          },
        ],
      });
    });

    if (table.head.prompts.length > 1) {
      cols.push({
        id: 'summary_group',
        header: () => <SummaryMetricGroupHeader />,
        columns: [
          {
            accessorKey: 'avg_pass_rate',
            header: 'Avg. Pass',
            size: 112,
            enableSorting: false,
            enableColumnFilter: false,
            meta: {
              align: 'right',
              columnToggleLabel: 'Summary - Avg. Pass',
            },
            cell: ({ row }) => renderPercentageValue(getAveragePassRate(row.original)),
          },
          {
            accessorKey: 'pass_spread',
            header: 'Spread',
            size: 96,
            enableSorting: false,
            enableColumnFilter: false,
            meta: {
              align: 'right',
              columnToggleLabel: 'Summary - Spread',
            },
            cell: ({ row }) => {
              const spread = getPassRateSpread(row.original);
              return (
                <div className="flex h-full items-center justify-end">
                  <span
                    className="text-sm font-medium text-zinc-700 dark:text-zinc-200"
                    title="Pass-rate spread across prompt columns"
                  >
                    {spread === null ? '--' : `${spread.toFixed(2)} pts`}
                  </span>
                </div>
              );
            },
          },
        ],
      });
    }

    // Actions Column:
    cols.push({
      id: 'actions',
      header: '',
      size: 64,
      enableHiding: false,
      enableSorting: false,
      enableColumnFilter: false,
      meta: {
        sticky: 'right',
      },
      cell: ({ row }) => {
        return (
          <div className="flex justify-end">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={`Filter results by ${row.original.metric}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMetricFilterClick(row.original.metric)}
                    className="filter-icon size-8 p-0"
                  >
                    <FilterIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Filter results by this metric</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      },
    });

    return cols;
  }, [
    table.head.prompts,
    policiesById,
    renderPercentageValue,
    handleMetricFilterClick,
    totalMetricNames,
  ]);

  // Create rows for DataTable
  const rows: MetricRow[] = React.useMemo(() => {
    return promptMetricNames.map((metric) => {
      const row: MetricRow = {
        id: metric,
        metric,
      };

      // Add data for each prompt
      displayMetrics.forEach((promptMetrics, idx) => {
        const namedScores = promptMetrics?.namedScores;
        const rawScore =
          namedScores && Object.prototype.hasOwnProperty.call(namedScores, metric)
            ? namedScores[metric]
            : undefined;
        const score =
          typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : undefined;
        const total = getNamedMetricTotal(promptMetrics, metric);
        const hasScore = score !== undefined;

        row[`prompt_${idx}`] = {
          score: score ?? 0,
          total: total ?? 0,
          hasScore,
        };
      });

      return row;
    });
  }, [displayMetrics, promptMetricNames]);

  if (promptMetricNames.length === 0) {
    return null;
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      initialSorting={[{ id: 'metric', desc: false }]}
      emptyMessage="No metrics available"
      showToolbar
      showFilter
      showColumnToggle
      showExport={false}
      globalFilterLabel="Search custom metrics"
      className="min-h-0 flex-1"
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
      <DialogContent className="flex h-[80vh] max-w-[98vw] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Custom Metrics</DialogTitle>
        </DialogHeader>
        <MetricsTable onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}
