import React, { useRef, useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { callApi } from '@app/utils/api';
import CloseIcon from '@mui/icons-material/Close';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import { useTheme } from '@mui/material/styles';
import type { VisibilityState } from '@tanstack/table-core';
import {
  Chart,
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
  type TooltipItem,
} from 'chart.js';
import { useStore } from './store';
import type { EvaluateTable, UnifiedConfig, ResultLightweightWithLabel } from './types';

interface ResultsChartsProps {
  columnVisibility: VisibilityState;
  recentEvals: ResultLightweightWithLabel[];
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
    const scores = table.body.flatMap((row) => row.outputs.map((output) => output.score));
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const range = Math.ceil(maxScore) - Math.floor(minScore); // Adjust the range to be between whole numbers
    const binSize = range / 10; // Define the size of each bin
    const bins = Array.from({ length: 11 }, (_, i) =>
      Number.parseFloat((Math.floor(minScore) + i * binSize).toFixed(2)),
    );

    const datasets = table.head.prompts.map((prompt, promptIdx) => {
      const scores = table.body.flatMap((row) => row.outputs[promptIdx].score);
      const counts = bins.map(
        (bin) => scores.filter((score) => score >= bin && score < bin + binSize).length,
      );
      return {
        label: `Column ${promptIdx + 1}`,
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
                return `Column ${datasetIndex + 1}`;
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
      },
    });
  }, [table]);

  return <canvas ref={histogramCanvasRef} style={{ maxHeight: '300px' }}></canvas>;
}

function PassRateChart({ table }: ChartProps) {
  const passRateCanvasRef = useRef(null);
  const passRateChartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!passRateCanvasRef.current) {
      return;
    }

    if (passRateChartInstance.current) {
      passRateChartInstance.current.destroy();
    }

    const datasets = table.head.prompts.map((prompt, promptIdx) => {
      const outputs = table.body.flatMap((row) => row.outputs[promptIdx]);
      const passCount = outputs.filter((output) => output.pass).length;
      const passRate = (passCount / outputs.length) * 100;
      return {
        label: `Column ${promptIdx + 1}`,
        data: [passRate],
        backgroundColor: COLOR_PALETTE[promptIdx % COLOR_PALETTE.length],
      };
    });

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
            text: 'Pass rate',
          },
          legend: {
            display: true,
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

    const scores = table.body.flatMap((row) => row.outputs.map((output) => output.score));
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    const data = table.body.map((row) => {
      const prompt1Score = row.outputs[xAxisPrompt].score;
      const prompt2Score = row.outputs[yAxisPrompt].score;
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
                const row = table.body[tooltipItem.dataIndex];
                let prompt1Text = row.outputs[0].text;
                let prompt2Text = row.outputs[1].text;
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
              callback(value: string | number, index: number, values: any[]) {
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
              callback(value: string | number, index: number, values: any[]) {
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
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Compare prompt outputs</DialogTitle>
        <DialogContent>
          <FormControl sx={{ m: 1, minWidth: 120 }}>
            <Select value={xAxisPrompt} onChange={(e) => setXAxisPrompt(Number(e.target.value))}>
              {table.head.prompts.map((prompt, idx) => (
                <MenuItem key={idx} value={idx}>
                  Prompt {idx + 1}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ m: 1, minWidth: 120 }}>
            <Select value={yAxisPrompt} onChange={(e) => setYAxisPrompt(Number(e.target.value))}>
              {table.head.prompts.map((prompt, idx) => (
                <MenuItem key={idx} value={idx}>
                  Prompt {idx + 1}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
              callback(value: string | number, index: number, values: any[]) {
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
                const value = tooltipItem.parsed.y;
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
  const { config } = useStore();
  const lineCanvasRef = useRef(null);
  const lineChartInstance = useRef<Chart | null>(null);
  const [progressData, setProgressData] = useState<ProgressData[]>([]);

  useEffect(() => {
    const fetchProgressData = async () => {
      if (!config?.description) {
        return;
      }

      try {
        const res = await callApi(
          `/progress?description=${encodeURIComponent(config.description)}`,
        );
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
            title: (context: any) => {
              return context[0].raw.evalData.evalId;
            },
            label: (context: any) => {
              const item = context.raw as { x: number; y: number; evalData: ProgressData };
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
      onClick: (event: any, elements: any) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          window.open(`/eval/?evalId=${chartData[index].evalData.evalId}`, '_blank');
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

function ResultsCharts({ columnVisibility, recentEvals }: ResultsChartsProps) {
  const theme = useTheme();
  Chart.defaults.color = theme.palette.mode === 'dark' ? '#aaa' : '#666';
  const [showCharts, setShowCharts] = useState(true);
  const [showPerformanceOverTimeChart, setShowPerformanceOverTimeChart] = useState(false);

  const { table, evalId, config } = useStore();

  useEffect(() => {
    if (config?.description && import.meta.env.VITE_PROMPTFOO_EXPERIMENTAL) {
      const filteredEvals = recentEvals.filter(
        (evaluation) => evaluation.description === config.description,
      );
      if (filteredEvals.length > 1) {
        setShowPerformanceOverTimeChart(true);
      }
    } else {
      setShowPerformanceOverTimeChart(false);
    }
  }, [config?.description, recentEvals]);

  if (
    !table ||
    !config ||
    !showCharts ||
    (table.head.prompts.length < 2 && !showPerformanceOverTimeChart)
  ) {
    return null;
  }

  if (table.head.prompts.length < 2 && showPerformanceOverTimeChart) {
    return (
      <ErrorBoundary fallback={null}>
        <Paper sx={{ position: 'relative', padding: 3, mt: 2 }}>
          <IconButton
            style={{ position: 'absolute', right: 0, top: 0 }}
            onClick={() => setShowCharts(false)}
          >
            <CloseIcon />
          </IconButton>

          <div style={{ width: '100%' }}>
            <PerformanceOverTimeChart table={table} evalId={evalId} />
          </div>
        </Paper>
      </ErrorBoundary>
    );
  }

  const scores = table.body.flatMap((row) => row.outputs.map((output) => output.score));
  const scoreSet = new Set(scores);
  if (scoreSet.size === 1) {
    // All scores are the same, charts not useful.
    return null;
  }

  const chartWidth = showPerformanceOverTimeChart ? '25%' : '33%';

  return (
    <ErrorBoundary fallback={null}>
      <Paper sx={{ position: 'relative', padding: 3, mt: 2 }}>
        <IconButton
          style={{ position: 'absolute', right: 0, top: 0 }}
          onClick={() => setShowCharts(false)}
        >
          <CloseIcon />
        </IconButton>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ width: chartWidth }}>
            <PassRateChart table={table} />
          </div>
          <div style={{ width: chartWidth }}>
            {scoreSet.size <= 3 &&
            Object.keys(table.head.prompts[0].metrics?.namedScores || {}).length > 1 ? (
              <MetricChart table={table} />
            ) : (
              <HistogramChart table={table} />
            )}
          </div>
          <div style={{ width: chartWidth }}>
            <ScatterChart table={table} />
          </div>
          {showPerformanceOverTimeChart && (
            <div style={{ width: chartWidth }}>
              <PerformanceOverTimeChart table={table} evalId={evalId} />
            </div>
          )}
        </div>
      </Paper>
    </ErrorBoundary>
  );
}

export default React.memo(ResultsCharts);
