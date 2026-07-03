import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@app/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { EVAL_ROUTES } from '@app/constants/routes';
import { callApi } from '@app/utils/api';
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
import type { EvaluateTable, UnifiedConfig } from '@promptfoo/types';

interface ResultsChartsProps {
  scores: number[];
}

interface ChartProps {
  table: EvaluateTable;
  evalId?: string | null;
  config?: Partial<UnifiedConfig>;
  datasetId?: string | null;
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
  prompt?.provider || `Prompt ${promptIdx + 1}`;

// Axis identity for the scatter comparison. The 1-based prompt index keeps each axis
// unique even when several prompts share a provider (e.g. "echo" vs "echo"), so the
// non-visual summary never collapses two distinct prompts into the same name.
const getScatterAxisLabel = (
  prompt: { provider?: string } | undefined,
  promptIdx: number,
): string =>
  prompt?.provider ? `Prompt ${promptIdx + 1} (${prompt.provider})` : `Prompt ${promptIdx + 1}`;

const formatSummaryScore = (score: number): string =>
  Number.isInteger(score) ? String(score) : score.toFixed(2);

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

  // Compute the binned dataset once so the canvas and the non-visual accessible
  // summary describe the exact same distribution (per-bin, per-prompt counts).
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
    const binSize = range / 10; // Define the size of each bin
    const bins = Array.from({ length: 11 }, (_, i) =>
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

  // Derive the accessible summary from the SAME binned dataset the chart renders so
  // materially different distributions (e.g. swapped prompt/bin frequencies) produce
  // materially different non-visual summaries.
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
        ? `${formatSummaryScore(bin)} and above`
        : `${formatSummaryScore(bin)} to ${formatSummaryScore(upperBound)}`;
      return { range, counts: datasets.map((dataset) => dataset.data[binIdx]) };
    });
    const text = `Score distribution across ${totalScores} scored outputs from ${table.head.prompts.length} prompts. Scores range from ${formatSummaryScore(minScore)} to ${formatSummaryScore(maxScore)}. The table lists how many outputs from each prompt fall into each score range.`;

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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
    const promptXLabel = getScatterAxisLabel(table.head.prompts[xAxisPrompt], xAxisPrompt);
    const promptYLabel = getScatterAxisLabel(table.head.prompts[yAxisPrompt], yAxisPrompt);
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

    // Include the actual plotted (x, y) score pairs so plots with identical
    // direction counts but different coordinates (e.g. [(0, 1), (1, 0)] vs
    // [(0.49, 0.51), (0.51, 0.49)]) produce distinct non-visual summaries.
    const pairSummary =
      pairs.length > 0
        ? ` Plotted score pairs as (${promptXLabel}, ${promptYLabel}): ${pairs
            .map((point) => `(${formatSummaryScore(point.x)}, ${formatSummaryScore(point.y)})`)
            .join('; ')}.`
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
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Compare prompt outputs</DialogTitle>
          </DialogHeader>
          <div className="flex gap-4 py-4">
            <Select
              value={String(xAxisPrompt)}
              onValueChange={(val) => setXAxisPrompt(Number(val))}
            >
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
            <Select
              value={String(yAxisPrompt)}
              onValueChange={(val) => setYAxisPrompt(Number(val))}
            >
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
      </Dialog>
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
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Compare prompt outputs
          </Button>
        </div>
      </section>
    </>
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
      label: `${prompt.provider}`,
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

interface ProgressData {
  evalId: string;
  description: string;
  promptId: string;
  createdAt: number;
  label: string;
  provider: string;
  metrics: {
    testPassCount: number;
    testFailCount: number;
    score: number;
  };
}

function getPassRate(metrics: ProgressData['metrics']): number {
  const totalTests = metrics.testPassCount + metrics.testFailCount;
  return totalTests === 0 ? 0 : (metrics.testPassCount / totalTests) * 100;
}

function PerformanceOverTimeChart({ evalId }: ChartProps) {
  const { config } = useTableStore();
  const lineCanvasRef = useRef(null);
  const lineChartInstance = useRef<Chart | null>(null);
  const [progressData, setProgressData] = useState<ProgressData[]>([]);

  useEffect(() => {
    const fetchProgressData = async () => {
      if (!config?.description) {
        return;
      }

      try {
        const res = await callApi(`/history?description=${encodeURIComponent(config.description)}`);
        if (!res.ok) {
          throw new Error(`Failed to fetch progress data: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        setProgressData(Array.isArray(data?.data) ? data.data : []);
      } catch (error) {
        console.error('Error fetching progress data:', error);
      }
    };

    fetchProgressData();
  }, [config?.description]);

  useEffect(() => {
    if (!lineCanvasRef.current || !evalId || progressData.length === 0) {
      return;
    }

    if (lineChartInstance.current) {
      lineChartInstance.current.destroy();
    }

    // Group evaluations by createdAt and assign evaluation numbers
    const evaluationGroups = progressData.reduce<Record<string, ProgressData[]>>(
      (groups, eval_) => {
        const date = new Date(eval_.createdAt).toISOString();
        if (!groups[date]) {
          groups[date] = [];
        }
        groups[date].push(eval_);
        return groups;
      },
      {},
    );

    const evaluations = Object.values(evaluationGroups).flatMap((group, groupIndex) =>
      group.map((item) => ({
        ...item,
        evaluationNumber: groupIndex + 1,
      })),
    );

    const datasets = evaluations.reduce<
      Record<number, { x: number; y: number; evalData: ProgressData }[]>
    >((acc, eval_) => {
      const passRate = getPassRate(eval_.metrics);

      if (!acc[eval_.evaluationNumber]) {
        acc[eval_.evaluationNumber] = [];
      }
      acc[eval_.evaluationNumber].push({
        x: eval_.evaluationNumber,
        y: passRate,
        evalData: eval_,
      });
      return acc;
    }, {});

    const chartData = Object.values(datasets).flat();

    // Find the highest pass rate for each evaluation number to connect with a line
    const highestPassRates = Object.values(datasets).map((group) => {
      return group.reduce((max, current) => (current.y > max.y ? current : max));
    });

    const chartOptions = {
      responsive: true,
      scales: {
        x: {
          type: 'linear' as const,
          position: 'bottom' as const,
          title: {
            display: true,
            text: 'Evaluation',
          },
          ticks: {
            stepSize: 1,
          },
        },
        y: {
          title: {
            display: true,
            text: 'Pass Rate (%)',
          },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: (context: unknown) => {
              const items = context as TooltipItem<'scatter'>[];
              const raw = items[0].raw as { evalData: { evalId: string } };
              return raw.evalData.evalId;
            },
            label: (context: unknown) => {
              const item = (context as TooltipItem<'scatter'>).raw as {
                x: number;
                y: number;
                evalData: ProgressData;
              };
              const { evalData } = item;
              const passRate = getPassRate(evalData.metrics);
              return [
                `Label: ${evalData.label}`,
                `Provider: ${evalData.provider}`,
                `Pass Rate: ${passRate.toFixed(2)}%`,
                `Score: ${evalData.metrics.score.toFixed(2)}`,
              ];
            },
          },
        },
      },
      onClick: (_event: unknown, elements: unknown) => {
        if (Array.isArray(elements) && elements.length > 0) {
          const index = (elements[0] as { index: number }).index;
          window.open(EVAL_ROUTES.DETAIL(chartData[index].evalData.evalId), '_blank');
        }
      },
    };

    lineChartInstance.current = new Chart(lineCanvasRef.current, {
      type: 'scatter',
      data: {
        datasets: [
          {
            type: 'scatter',
            data: chartData,
            pointBackgroundColor: chartData.map((point) =>
              point.evalData.evalId === evalId ? '#4CAF50' : '#2196F3',
            ),
          },
          {
            type: 'line',
            data: highestPassRates,
            borderColor: '#2196F3AA',
            borderWidth: 2,
            pointRadius: 0,
          },
        ],
      },
      options: chartOptions,
    });
  }, [progressData, evalId]);

  return <canvas ref={lineCanvasRef} style={{ maxHeight: '300px', cursor: 'pointer' }} />;
}

function ResultsCharts({ scores }: ResultsChartsProps) {
  const [
    showPerformanceOverTimeChart,
    //setShowPerformanceOverTimeChart
  ] = useState(false);

  // Update Chart.js defaults when theme changes
  // useLayoutEffect ensures defaults are set before charts render
  useLayoutEffect(() => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    Chart.defaults.color = isDark ? '#aaa' : '#666';
  }, []);

  // NOTE: Parent component is responsible for conditionally rendering the charts based on the table being
  // non-null.
  const { table, evalId } = useTableStore();

  // TODO(Will): Release performance over time chart; it's been hidden for 10 months.
  // useEffect(() => {
  //   if (config?.description && import.meta.env.VITE_PROMPTFOO_EXPERIMENTAL) {
  //     const filteredEvals = recentEvals.filter(
  //       (evaluation) => evaluation.description === config.description,
  //     );
  //     if (filteredEvals.length > 1) {
  //       setShowPerformanceOverTimeChart(true);
  //     }
  //   } else {
  //     setShowPerformanceOverTimeChart(false);
  //   }
  // }, [config?.description, recentEvals]);

  // if (table.head.prompts.length < 2 && showPerformanceOverTimeChart) {
  //   return (
  //     <ErrorBoundary fallback={null}>
  //       <Paper sx={{ position: 'relative', padding: 3, mt: 2 }}>
  //         <IconButton
  //           style={{ position: 'absolute', right: 0, top: 0 }}
  //           onClick={() => handleHideCharts()}
  //         >
  //           <CloseIcon />
  //         </IconButton>

  //         <div style={{ width: '100%' }}>
  //           <PerformanceOverTimeChart table={table} evalId={evalId} />
  //         </div>
  //       </Paper>
  //     </ErrorBoundary>
  //   );
  // }

  const chartWidth = showPerformanceOverTimeChart ? '25%' : '33%';

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
          {showPerformanceOverTimeChart && (
            <div style={{ width: chartWidth }}>
              <PerformanceOverTimeChart table={table!} evalId={evalId} />
            </div>
          )}
        </div>
      </section>
    </ErrorBoundary>
  );
}

export default React.memo(ResultsCharts);
