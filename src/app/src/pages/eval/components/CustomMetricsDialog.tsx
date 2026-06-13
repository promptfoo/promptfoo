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
import {
  formatRawMetricValue,
  getMetricAverage,
  getMetricDisplayKind,
  getMetricDisplayKinds,
  type MetricDisplayKind,
} from './metricDisplay';
import { useTableStore } from './store';
import { getNamedMetricTotal } from './utils';
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
  return formatRawMetricValue(value, Math.abs(value) >= 1 ? 2 : 4);
}

type PromptHeader = {
  raw?: string;
  display?: string;
  label?: string;
  provider?: string | object;
};

function getMetricValue(metricScore: MetricScore, kind: MetricDisplayKind): number {
  if (!metricScore.hasScore) {
    return 0;
  }

  return getMetricAverage(kind, metricScore.score, metricScore.count);
}

function getPromptMetricScores(row: MetricRow): MetricScore[] {
  return Object.entries(row)
    .filter(([key]) => key.startsWith('prompt_'))
    .map(([, value]) => value as MetricScore);
}

function getAverageMetricValue(row: MetricRow): number {
  const promptScores = getPromptMetricScores(row);
  let promptCount = 0;
  let totalValue = 0;

  promptScores.forEach((metricScore) => {
    if (metricScore.hasScore) {
      promptCount++;
      totalValue += getMetricValue(metricScore, row.kind);
    }
  });

  return promptCount > 0 ? totalValue / promptCount : 0;
}

function getMetricSpread(row: MetricRow): number | null {
  const validPassRates = getPromptMetricScores(row)
    .filter(({ hasScore }) => hasScore)
    .map((metricScore) => getMetricValue(metricScore, row.kind));

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
  const { table, config } = useTableStore();
  const applyFilterFromMetric = useApplyFilterFromMetric();

  if (!table || !table.head || !table.head.prompts) {
    return null;
  }

  const policiesById = useCustomPoliciesMap(config?.redteam?.plugins ?? []);
  const metricKinds = React.useMemo(() => getMetricDisplayKinds(table, config), [table, config]);

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

  const renderMetricValue = React.useCallback(
    (metricScore: MetricScore | undefined, metricKind: MetricDisplayKind) => {
      if (!metricScore?.hasScore) {
        return <span className="text-sm">0</span>;
      }

      const value = getMetricValue(metricScore, metricKind);
      if (metricKind === 'value') {
        return (
          <div className="flex h-full items-center justify-end">
            <span className="text-sm tabular-nums">{formatMetricNumber(value)}</span>
          </div>
        );
      }

      return renderPercentageValue(value);
    },
    [renderPercentageValue],
  );

  // Create columns for DataTable
  const columns: ColumnDef<MetricRow>[] = React.useMemo(() => {
    const valueColumnLabel = hasValueMetrics ? 'Pass / Avg.' : 'Pass';
    const scoreColumnLabel = hasValueMetrics ? 'Score / Total' : 'Score';
    const summaryAverageLabel = hasValueMetrics ? 'Avg.' : 'Avg. Pass';

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

      cols.push({
        id: `${columnId}_group`,
        header: () => <PromptMetricGroupHeader prompt={prompt} index={idx} />,
        columns: [
          {
            accessorKey: `${columnId}_pass_rate`,
            header: valueColumnLabel,
            size: 112,
            enableSorting: false,
            enableColumnFilter: false,
            meta: {
              align: 'right',
              columnToggleLabel: getPromptMetricToggleLabel(prompt, idx, valueColumnLabel),
            },
            cell: ({ row }) => {
              const metricScore = row.original[columnId];
              return renderMetricValue(metricScore, row.original.kind);
            },
          },
          {
            accessorKey: `${columnId}_score`,
            header: scoreColumnLabel,
            size: 112,
            enableSorting: false,
            enableColumnFilter: false,
            meta: {
              align: 'right',
              columnToggleLabel: getPromptMetricToggleLabel(prompt, idx, scoreColumnLabel),
            },
            cell: ({ row }) => {
              const metricScore = row.original[columnId];
              if (!metricScore) {
                return <span className="text-sm">0</span>;
              }
              const { hasScore, score } = metricScore;
              const displayValue = hasScore ? formatMetricNumber(score) : '0';
              return (
                <span className="text-sm tabular-nums" title={hasScore ? String(score) : '0'}>
                  {displayValue}
                </span>
              );
            },
          },
          {
            accessorKey: `${columnId}_count`,
            header: 'Count',
            size: 72,
            enableSorting: false,
            enableColumnFilter: false,
            meta: {
              align: 'right',
              columnToggleLabel: getPromptMetricToggleLabel(prompt, idx, 'Count'),
            },
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
              return <span className="text-sm tabular-nums">{count}</span>;
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
            header: summaryAverageLabel,
            size: 112,
            enableSorting: false,
            enableColumnFilter: false,
            meta: {
              align: 'right',
              columnToggleLabel: `Summary - ${summaryAverageLabel}`,
            },
            cell: ({ row }) => {
              const value = getAverageMetricValue(row.original);
              if (row.original.kind === 'value') {
                return (
                  <div className="flex h-full items-center justify-end">
                    <span className="text-sm tabular-nums">{formatMetricNumber(value)}</span>
                  </div>
                );
              }
              return renderPercentageValue(value);
            },
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
              const spread = getMetricSpread(row.original);
              const spreadText =
                spread === null
                  ? '--'
                  : row.original.kind === 'value'
                    ? formatMetricNumber(spread)
                    : `${spread.toFixed(2)} pts`;
              return (
                <div className="flex h-full items-center justify-end">
                  <span
                    className="text-sm font-medium text-zinc-700 dark:text-zinc-200"
                    title="Metric spread across prompt columns"
                  >
                    {spreadText}
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
    hasValueMetrics,
    renderMetricValue,
    handleMetricFilterClick,
    renderPercentageValue,
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
        const count = getNamedMetricTotal(prompt.metrics, metric);
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
