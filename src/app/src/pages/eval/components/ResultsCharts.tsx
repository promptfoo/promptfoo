import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

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
import { X } from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';
import { usePassRates } from './hooks';
import { useTableStore } from './store';
import type { EvaluateTable, UnifiedConfig } from '@promptfoo/types';

interface ResultsChartsProps {
  handleHideCharts: () => void;
  scores: number[];
}

interface ChartProps {
  table: EvaluateTable;
  evalId?: string | null;
  config?: Partial<UnifiedConfig>;
  datasetId?: string | null;
}

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

  useEffect(() => {
    if (!histogramCanvasRef.current) {
      return;
    }

    if (histogramChartInstance.current) {
      histogramChartInstance.current.destroy();
    }

    // Calculate bins and their counts
    const scores = table.body
      .flatMap((row) => row.outputs.map((output) => output?.score))
      .filter((score) => typeof score === 'number' && !Number.isNaN(score));

    if (scores.length === 0) {
      return;
    }

    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const range = Math.ceil(maxScore) - Math.floor(minScore); // Adjust the range to be between whole numbers
    const binSize = range / 10; // Define the size of each bin
    const bins = Array.from({ length: 11 }, (_, i) =>
      Number.parseFloat((Math.floor(minScore) + i * binSize).toFixed(2)),
    );

    const datasets = table.head.prompts.map((prompt, promptIdx) => {
      const scores = table.body
        .map((row) => row.outputs[promptIdx]?.score)
        .filter((score) => typeof score === 'number' && !Number.isNaN(score));
      const counts = bins.map(
        (bin) => scores.filter((score) => score >= bin && score < bin + binSize).length,
      );
      return {
        label: prompt.provider,
        data: counts,
        backgroundColor: COLOR_PALETTE[promptIdx % COLOR_PALETTE.length],
      };
    });

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
  }, [table]);

  return <canvas ref={histogramCanvasRef} style={{ maxHeight: '300px' }}></canvas>;
}

function PassRateChart({ table }: ChartProps) {
  const passRates = usePassRates();
  const passRateCanvasRef = useRef(null);
  const passRateChartInstance = useRef<Chart | null>(null);

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

  return <canvas ref={passRateCanvasRef} style={{ maxHeight: '300px' }}></canvas>;
}

function ScatterChart({ table }: ChartProps) {
  const scatterCanvasRef = useRef(null);
  const scatterChartInstance = useRef<Chart | null>(null);
  const [xAxisPrompt, setXAxisPrompt] = useState(0);
  const [yAxisPrompt, setYAxisPrompt] = useState(1);
  const [open, setOpen] = useState(false);

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

    const data = table.body
      .map((row) => {
        const prompt1Score = row.outputs[xAxisPrompt]?.score;
        const prompt2Score = row.outputs[yAxisPrompt]?.score;
        let backgroundColor;
        if (prompt2Score > prompt1Score) {
          backgroundColor = 'green';
        } else if (prompt2Score < prompt1Score) {
          backgroundColor = 'red';
        } else {
          backgroundColor = 'gray';
        }
        return {
          x: prompt1Score,
          y: prompt2Score,
          backgroundColor,
        };
      })
      .filter(
        (point) =>
          typeof point.x === 'number' &&
          !Number.isNaN(point.x) &&
          typeof point.y === 'number' &&
          !Number.isNaN(point.y),
      );

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
                const row = table.body[tooltipItem.dataIndex];
                let prompt1Text = row.outputs[0]?.text || 'No output';
                let prompt2Text = row.outputs[1]?.text || 'No output';
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
              <SelectTrigger className="w-32">
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
              <SelectTrigger className="w-32">
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
      <canvas
        ref={scatterCanvasRef}
        style={{ maxHeight: '300px', cursor: 'pointer' }}
        onClick={() => setOpen(true)}
      ></canvas>
    </>
  );
}

function MetricChart({ table }: ChartProps) {
  const metricCanvasRef = useRef(null);
  const metricChartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!metricCanvasRef.current) {
      return;
    }

    if (metricChartInstance.current) {
      metricChartInstance.current.destroy();
    }

    const namedScoreKeys = Object.keys(table.head.prompts[0].metrics?.namedScores || {});
    const labels = namedScoreKeys;
    const datasets = table.head.prompts.map((prompt, promptIdx) => {
      const data = namedScoreKeys.map((key) => {
        const value = prompt.metrics?.namedScores[key] || 0;
        const maxValue = Math.max(
          ...table.head.prompts.map((p) => p.metrics?.namedScores[key] || 0),
        );
        return value / maxValue;
      });
      return {
        label: `${table.head.prompts[promptIdx].provider}`,
        data,
        backgroundColor: COLOR_PALETTE[promptIdx % COLOR_PALETTE.length],
      };
    });

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
  }, [table]);

  return <canvas ref={metricCanvasRef} style={{ maxHeight: '300px' }}></canvas>;
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
        const data = await res.json();
        setProgressData(data.data);
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
    const evaluationGroups = progressData.reduce(
      (groups, eval_) => {
        const date = new Date(eval_.createdAt).toISOString();
        if (!groups[date]) {
          groups[date] = [];
        }
        groups[date].push(eval_);
        return groups;
      },
      {} as Record<string, ProgressData[]>,
    );

    const evaluations = Object.values(evaluationGroups).flatMap((group, groupIndex) =>
      group.map((item) => ({
        ...item,
        evaluationNumber: groupIndex + 1,
      })),
    );

    const datasets = evaluations.reduce(
      (acc, eval_) => {
        const passRate =
          (eval_.metrics.testPassCount /
            (eval_.metrics.testPassCount + eval_.metrics.testFailCount)) *
          100;

        if (!acc[eval_.evaluationNumber]) {
          acc[eval_.evaluationNumber] = [];
        }
        acc[eval_.evaluationNumber].push({
          x: eval_.evaluationNumber,
          y: passRate,
          evalData: eval_,
        });
        return acc;
      },
      {} as Record<number, { x: number; y: number; evalData: ProgressData }[]>,
    );

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
              const passRate =
                (evalData.metrics.testPassCount /
                  (evalData.metrics.testPassCount + evalData.metrics.testFailCount)) *
                100;
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

function ResultsCharts({ handleHideCharts, scores }: ResultsChartsProps) {
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
      <div className="relative p-6 mt-2 bg-card rounded-lg border border-border shadow-sm">
        <button
          type="button"
          className="absolute right-2 top-2 p-1 rounded hover:bg-muted transition-colors"
          onClick={() => handleHideCharts()}
          aria-label="Hide charts"
        >
          <X className="size-5" />
        </button>
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
      </div>
    </ErrorBoundary>
  );
}

export default React.memo(ResultsCharts);
