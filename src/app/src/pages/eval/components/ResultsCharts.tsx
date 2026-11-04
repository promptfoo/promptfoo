import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@app/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Colors,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  ScatterController,
  Tooltip,
  type TooltipItem,
} from 'chart.js';
import { ErrorBoundary } from 'react-error-boundary';
import { usePassRates } from './hooks';
import { useTableStore } from './store';
import type { EvaluateTable } from '@promptfoo/types';

interface ResultsChartsProps {
  scores: number[];
}

interface ChartProps {
  table: EvaluateTable;
}

type ScatterPoint = {
  x: number;
  y: number;
  backgroundColor: string;
  rowIndex: number;
};

const COLOR_PALETTE = [
  '#fd7f6f',
  '#7eb0d5',
  '#b2e061',
  '#bd7ebe',
  '#ffb55a',
  '#ffee65',
  '#beb9db',
  '#fdcce5',
  '#8bd3c7',
];

const getPromptLabel = (prompt: { provider?: string } | undefined, promptIdx: number): string =>
  prompt?.provider ? `Prompt ${promptIdx + 1} (${prompt.provider})` : `Prompt ${promptIdx + 1}`;

Chart.register(
  BarController,
  LineController,
  ScatterController,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Colors,
);

function HistogramChart({ table }: ChartProps) {
  const histogramCanvasRef = useRef(null);
  const histogramChartInstance = useRef<Chart | null>(null);
  const titleId = useId();
  const summaryId = useId();

  // Share bins between the chart and its accessible table.
  const binnedData = useMemo(() => {
    const scores = table.body
      .flatMap((row) => row.outputs.map((output) => output?.score))
      .filter((score) => typeof score === 'number' && !Number.isNaN(score));

    if (scores.length === 0) {
      return null;
    }

    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const range = Math.ceil(maxScore) - Math.floor(minScore); // Adjust the range to be between whole numbers
    const binSize = range === 0 ? 1 : range / 10; // Define the size of each bin
    const bins = Array.from({ length: range === 0 ? 1 : 11 }, (_, i) =>
      Number.parseFloat((Math.floor(minScore) + i * binSize).toFixed(2)),
    );

    const datasets = table.head.prompts.map((prompt, promptIdx) => {
      const promptScores = table.body
        .map((row) => row.outputs[promptIdx]?.score)
        .filter((score) => typeof score === 'number' && !Number.isNaN(score));
      const counts = bins.map(
        (bin) => promptScores.filter((score) => score >= bin && score < bin + binSize).length,
      );
      return {
        label: prompt.provider,
        data: counts,
        backgroundColor: COLOR_PALETTE[promptIdx % COLOR_PALETTE.length],
      };
    });

    return { totalScores: scores.length, minScore, maxScore, binSize, bins, datasets };
  }, [table]);

  const summary = useMemo(() => {
    if (!binnedData) {
      return {
        text: 'No scored outputs are available for the score distribution chart.',
        promptLabels: [] as string[],
        rows: [] as { range: string; counts: number[] }[],
      };
    }

    const { totalScores, minScore, maxScore, binSize, bins, datasets } = binnedData;
    const promptLabels = table.head.prompts.map((prompt, promptIdx) =>
      getPromptLabel(prompt, promptIdx),
    );
    const rows = bins.map((bin, binIdx) => {
      const isLastBin = binIdx === bins.length - 1;
      const upperBound = Number.parseFloat((bin + binSize).toFixed(2));
      const range = isLastBin
        ? `${String(bin)} and above`
        : `${String(bin)} to ${String(upperBound)}`;
      return { range, counts: datasets.map((dataset) => dataset.data[binIdx]) };
    });
    const text = `Score distribution across ${totalScores} scored outputs from ${table.head.prompts.length} prompts. Scores range from ${String(minScore)} to ${String(maxScore)}. The table lists how many outputs from each prompt fall into each score range.`;

    return { text, promptLabels, rows };
  }, [binnedData, table.head.prompts]);

  useEffect(() => {
    if (!histogramCanvasRef.current) {
      return;
    }

    if (histogramChartInstance.current) {
      histogramChartInstance.current.destroy();
    }

    if (!binnedData) {
      return;
    }

    const { bins, datasets } = binnedData;

    histogramChartInstance.current = new Chart(histogramCanvasRef.current, {
      type: 'bar',
      data: {
        labels: bins,
        datasets,
      },
      options: {
        animation: false,
        plugins: {
          title: {
            display: true,
            text: 'Score Distribution',
          },
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              title(context) {
                const datasetIndex = context[0].datasetIndex;
                return table.head.prompts[datasetIndex].provider;
              },
              label(context) {
                const labelIndex = context.dataIndex;
                const lowerBound = bins[labelIndex];
                const upperBound = bins[labelIndex + 1];
                if (!upperBound) {
                  return `${lowerBound} <= score`;
                }
                return `${lowerBound} <= score < ${upperBound}`;
              },
            },
          },
        },
        scales: {
          y: {
            title: {
              display: true,
              text: 'Frequency',
            },
          },
          x: {
            title: {
              display: true,
              text: 'Score',
            },
          },
        },
      },
    });
  }, [binnedData, table]);

  return (
    <section role="region" aria-labelledby={titleId} aria-describedby={summaryId}>
      <h3 id={titleId} className="sr-only">
        Score distribution chart
      </h3>
      <p id={summaryId} className="sr-only">
        {summary.text}
      </p>
      {summary.rows.length > 0 && (
        <table className="sr-only">
          <caption>Score distribution counts per prompt by score range</caption>
          <thead>
            <tr>
              <th scope="col">Score range</th>
              {summary.promptLabels.map((label, promptIdx) => (
                <th key={promptIdx} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row, binIdx) => (
              <tr key={binIdx}>
                <th scope="row">{row.range}</th>
                {row.counts.map((count, promptIdx) => (
                  <td key={promptIdx}>{count}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <canvas
        ref={histogramCanvasRef}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={summaryId}
        style={{ maxHeight: '300px' }}
      ></canvas>
    </section>
  );
}

function PassRateChart({ table }: ChartProps) {
  const passRates = usePassRates();
  const passRateCanvasRef = useRef(null);
  const passRateChartInstance = useRef<Chart | null>(null);
  const titleId = useId();
  const summaryId = useId();

  const summary = useMemo(() => {
    const providerSummaries = table.head.prompts.map((prompt, promptIdx) => {
      const label = getPromptLabel(prompt, promptIdx);
      return `${label}: ${(passRates[promptIdx]?.total ?? 0).toFixed(2)}%`;
    });

    return providerSummaries.length > 0
      ? `Pass rates by provider. ${providerSummaries.join('; ')}.`
      : 'No provider pass rates are available.';
  }, [passRates, table.head.prompts]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pass rates use stable totals
  useEffect(() => {
    if (!passRateCanvasRef.current) {
      return;
    }

    if (passRateChartInstance.current) {
      passRateChartInstance.current.destroy();
    }

    const datasets = table.head.prompts.map((prompt, promptIdx) => ({
      label: prompt.provider,
      data: [passRates[promptIdx]?.total ?? 0],
      backgroundColor: COLOR_PALETTE[promptIdx % COLOR_PALETTE.length],
    }));

    passRateChartInstance.current = new Chart(passRateCanvasRef.current, {
      type: 'bar',
      data: {
        labels: ['Pass Rate (%)'],
        datasets,
      },
      options: {
        animation: false,
        plugins: {
          title: {
            display: true,
            text: 'Pass Rate',
          },
          legend: {
            display: true,
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return `${context.dataset.label}: ${(context.parsed.y ?? 0).toFixed(2)}%`;
              },
            },
          },
        },
      },
    });
  }, [table]);

  return (
    <section role="region" aria-labelledby={titleId} aria-describedby={summaryId}>
      <h3 id={titleId} className="sr-only">
        Pass rate chart
      </h3>
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
      <canvas
        ref={passRateCanvasRef}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={summaryId}
        style={{ maxHeight: '300px' }}
      ></canvas>
    </section>
  );
}

function ScatterChart({ table }: ChartProps) {
  const scatterCanvasRef = useRef(null);
  const scatterChartInstance = useRef<Chart | null>(null);
  const [xAxisPrompt, setXAxisPrompt] = useState(0);
  const [yAxisPrompt, setYAxisPrompt] = useState(1);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const summaryId = useId();

  const comparisonSummary = useMemo(() => {
    const promptXLabel = getPromptLabel(table.head.prompts[xAxisPrompt], xAxisPrompt);
    const promptYLabel = getPromptLabel(table.head.prompts[yAxisPrompt], yAxisPrompt);
    const pairs = table.body
      .map((row) => ({
        x: row.outputs[xAxisPrompt]?.score,
        y: row.outputs[yAxisPrompt]?.score,
      }))
      .filter(
        (
          point,
        ): point is {
          x: number;
          y: number;
        } =>
          typeof point.x === 'number' &&
          !Number.isNaN(point.x) &&
          typeof point.y === 'number' &&
          !Number.isNaN(point.y),
      );

    const xHigher = pairs.filter((point) => point.x > point.y).length;
    const yHigher = pairs.filter((point) => point.y > point.x).length;
    const ties = pairs.length - xHigher - yHigher;

    const summaryPairs = pairs.slice(0, 20);
    const pairSummary =
      summaryPairs.length > 0
        ? ` Plotted score pairs as (${promptXLabel}, ${promptYLabel}): ${summaryPairs
            .map((point) => `(${String(point.x)}, ${String(point.y)})`)
            .join(
              '; ',
            )}${pairs.length > summaryPairs.length ? `; and ${pairs.length - summaryPairs.length} more` : ''}.`
        : '';

    return `Comparing ${promptXLabel} with ${promptYLabel} across ${pairs.length} paired scores. ${promptYLabel} is higher in ${yHigher} rows, ${promptXLabel} is higher in ${xHigher} rows, and ${ties} rows tie.${pairSummary}`;
  }, [table, xAxisPrompt, yAxisPrompt]);

  useEffect(() => {
    if (!scatterCanvasRef.current) {
      return;
    }

    if (scatterChartInstance.current) {
      scatterChartInstance.current.destroy();
    }

    const scores = table.body
      .flatMap((row) => row.outputs.map((output) => output?.score))
      .filter((score) => typeof score === 'number' && !Number.isNaN(score));

    if (scores.length === 0) {
      return;
    }

    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    const data = table.body.flatMap<ScatterPoint>((row, rowIndex) => {
      const prompt1Score = row.outputs[xAxisPrompt]?.score;
      const prompt2Score = row.outputs[yAxisPrompt]?.score;

      if (
        typeof prompt1Score !== 'number' ||
        Number.isNaN(prompt1Score) ||
        typeof prompt2Score !== 'number' ||
        Number.isNaN(prompt2Score)
      ) {
        return [];
      }

      let backgroundColor;
      if (prompt2Score > prompt1Score) {
        backgroundColor = 'green';
      } else if (prompt2Score < prompt1Score) {
        backgroundColor = 'red';
      } else {
        backgroundColor = 'gray';
      }

      return [
        {
          x: prompt1Score,
          y: prompt2Score,
          backgroundColor,
          rowIndex,
        },
      ];
    });

    scatterChartInstance.current = new Chart(scatterCanvasRef.current, {
      type: 'scatter',
      data: {
        datasets: [
          {
            data,
            backgroundColor: data.map((point) => point.backgroundColor),
          },
          {
            type: 'line',
            data: [
              // @ts-ignore: types seem wrong, it wants backgroundColor
              { x: minScore, y: minScore },
              // @ts-ignore: types seem wrong, it wants backgroundColor
              { x: maxScore, y: maxScore },
            ],
            borderColor: 'gray',
            borderWidth: 1,
            borderDash: [5, 5],
            pointRadius: 0,
          },
        ],
      },
      options: {
        animation: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label(tooltipItem: TooltipItem<'scatter'>) {
                const point = tooltipItem.raw as Partial<ScatterPoint> | undefined;
                const rowIndex =
                  typeof point?.rowIndex === 'number' ? point.rowIndex : tooltipItem.dataIndex;
                const row = table.body[rowIndex];
                if (!row) {
                  return '';
                }

                let prompt1Text = row.outputs[xAxisPrompt]?.text || 'No output';
                let prompt2Text = row.outputs[yAxisPrompt]?.text || 'No output';
                if (prompt1Text.length > 30) {
                  prompt1Text = prompt1Text.substring(0, 30) + '...';
                }
                if (prompt2Text.length > 30) {
                  prompt2Text = prompt2Text.substring(0, 30) + '...';
                }
                return `Output 1: ${prompt1Text}\nOutput 2: ${prompt2Text}`;
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: `Prompt ${xAxisPrompt + 1} Score`,
            },
            ticks: {
              callback(value: string | number, index: number, values: unknown[]) {
                let ret = String(Math.round(Number(value) * 100));
                if (index === values.length - 1) {
                  ret += '%';
                }
                return ret;
              },
            },
          },
          y: {
            title: {
              display: true,
              text: `Prompt ${yAxisPrompt + 1} Score`,
            },
            ticks: {
              callback(value: string | number, index: number, values: unknown[]) {
                let ret = String(Math.round(Number(value) * 100));
                if (index === values.length - 1) {
                  ret += '%';
                }
                return ret;
              },
            },
          },
        },
      },
    });
  }, [table, xAxisPrompt, yAxisPrompt]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compare prompt outputs</DialogTitle>
        </DialogHeader>
        <div className="flex gap-4 py-4">
          <Select value={String(xAxisPrompt)} onValueChange={(val) => setXAxisPrompt(Number(val))}>
            <SelectTrigger aria-label="X-axis prompt" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {table.head.prompts.map((_prompt, idx) => (
                <SelectItem key={idx} value={String(idx)}>
                  Prompt {idx + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(yAxisPrompt)} onValueChange={(val) => setYAxisPrompt(Number(val))}>
            <SelectTrigger aria-label="Y-axis prompt" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {table.head.prompts.map((_prompt, idx) => (
                <SelectItem key={idx} value={String(idx)}>
                  Prompt {idx + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </DialogContent>
      <section role="region" aria-labelledby={titleId} aria-describedby={summaryId}>
        <h3 id={titleId} className="sr-only">
          Prompt score comparison chart
        </h3>
        <p id={summaryId} className="sr-only">
          {comparisonSummary}
        </p>
        <canvas
          ref={scatterCanvasRef}
          role="img"
          aria-labelledby={titleId}
          aria-describedby={summaryId}
          style={{ maxHeight: '300px', cursor: 'pointer' }}
          onClick={() => setOpen(true)}
        ></canvas>
        <div className="mt-2 flex justify-end">
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-auto max-w-full whitespace-normal">
              Compare prompt outputs
            </Button>
          </DialogTrigger>
        </div>
      </section>
    </Dialog>
  );
}

function MetricChart({ table }: ChartProps) {
  const metricCanvasRef = useRef(null);
  const metricChartInstance = useRef<Chart | null>(null);
  const titleId = useId();
  const summaryId = useId();

  const metricChartData = useMemo(() => {
    const labels = Object.keys(table.head.prompts[0].metrics?.namedScores || {});
    // Compute each metric's normalization value once; it depends only on the key, not the prompt.
    const normalizationValueByKey = new Map(
      labels.map((key) => {
        const values = table.head.prompts.map((p) => p.metrics?.namedScores[key] || 0);
        const maxValue = Math.max(...values);
        return [key, maxValue > 0 ? maxValue : Math.max(...values.map(Math.abs))];
      }),
    );
    const datasets = table.head.prompts.map((prompt, promptIdx) => ({
      label: getPromptLabel(prompt, promptIdx),
      data: labels.map((key) => {
        const value = prompt.metrics?.namedScores[key] || 0;
        const normalizationValue = normalizationValueByKey.get(key) ?? 0;
        return normalizationValue > 0 ? value / normalizationValue : 0;
      }),
      backgroundColor: COLOR_PALETTE[promptIdx % COLOR_PALETTE.length],
    }));
    const summary =
      labels.length > 0
        ? `Normalized named scores by provider. ${datasets
            .map(
              (dataset) =>
                `${dataset.label}: ${labels
                  .map(
                    (label, metricIdx) =>
                      `${label} ${((dataset.data[metricIdx] ?? 0) * 100).toFixed(2)}%`,
                  )
                  .join(', ')}`,
            )
            .join('; ')}.`
        : 'No named-score metrics are available for the metric chart.';

    return { datasets, labels, summary };
  }, [table]);

  useEffect(() => {
    if (!metricCanvasRef.current) {
      return;
    }

    if (metricChartInstance.current) {
      metricChartInstance.current.destroy();
    }

    const { datasets, labels } = metricChartData;

    const config = {
      type: 'bar' as const,
      data: {
        labels,
        datasets,
      },
      options: {
        scales: {
          x: {
            grid: {
              display: false,
            },
          },
          y: {
            ticks: {
              callback(value: string | number, index: number, values: unknown[]) {
                let ret = String(Math.round(Number(value) * 100));
                if (index === values.length - 1) {
                  ret += '%';
                }
                return ret;
              },
            },
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              title(tooltipItem: TooltipItem<'bar'>[]) {
                return tooltipItem[0].dataset.label;
              },
              label(tooltipItem: TooltipItem<'bar'>) {
                const value = tooltipItem.parsed.y ?? 0;
                return `${labels[tooltipItem.dataIndex]}: ${(value * 100).toFixed(2)}% pass rate`;
              },
            },
          },
        },
      },
    };
    metricChartInstance.current = new Chart(metricCanvasRef.current, config);
  }, [metricChartData]);

  return (
    <section role="region" aria-labelledby={titleId} aria-describedby={summaryId}>
      <h3 id={titleId} className="sr-only">
        Named score metric chart
      </h3>
      <p id={summaryId} className="sr-only">
        {metricChartData.summary}
      </p>
      <canvas
        ref={metricCanvasRef}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={summaryId}
        style={{ maxHeight: '300px' }}
      ></canvas>
    </section>
  );
}

function ResultsCharts({ scores }: ResultsChartsProps) {
  // Update Chart.js defaults when theme changes
  // useLayoutEffect ensures defaults are set before charts render
  useLayoutEffect(() => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    Chart.defaults.color = isDark ? '#aaa' : '#666';
  }, []);

  // NOTE: Parent component is responsible for conditionally rendering the charts based on the table being
  // non-null.
  const { table } = useTableStore();

  const chartWidth = '33%';

  const scoreSet = new Set(scores);

  return (
    <ErrorBoundary fallback={null}>
      <section
        aria-label="Evaluation result visualizations"
        className="relative p-6 mt-2 bg-card rounded-lg border border-border shadow-sm"
      >
        <div className="flex justify-between w-full">
          <div style={{ width: chartWidth }}>
            <PassRateChart table={table!} />
          </div>
          <div style={{ width: chartWidth }}>
            {scoreSet.size <= 3 &&
            Object.keys(table!.head.prompts[0].metrics?.namedScores || {}).length > 1 ? (
              <MetricChart table={table!} />
            ) : (
              <HistogramChart table={table!} />
            )}
          </div>
          <div style={{ width: chartWidth }}>
            <ScatterChart table={table!} />
          </div>
        </div>
      </section>
    </ErrorBoundary>
  );
}

export default React.memo(ResultsCharts);
