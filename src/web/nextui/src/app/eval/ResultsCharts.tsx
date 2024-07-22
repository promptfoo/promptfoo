import React, { useRef, useEffect, useState, useMemo } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { getApiBaseUrl } from '@/api';
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
import { createHash } from 'crypto';
import { useStore } from './store';
import type {
  EvaluateTable,
  UnifiedConfig,
  TestCasesWithMetadata,
  ResultLightweightWithLabel,
} from './types';

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
      parseFloat((Math.floor(minScore) + i * binSize).toFixed(2)),
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
              title: function (context) {
                const datasetIndex = context[0].datasetIndex;
                return `Column ${datasetIndex + 1}`;
              },
              label: function (context) {
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
              label: function (tooltipItem: TooltipItem<'scatter'>) {
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
              callback: function (value: string | number, index: number, values: any[]) {
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
              callback: function (value: string | number, index: number, values: any[]) {
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
              callback: function (value: string | number, index: number, values: any[]) {
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
              title: function (tooltipItem: TooltipItem<'bar'>[]) {
                return tooltipItem[0].dataset.label;
              },
              label: function (tooltipItem: TooltipItem<'bar'>) {
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

function PerformanceOverTimeChart({ table, evalId, config, datasetId }: ChartProps) {
  const lineCanvasRef = useRef(null);
  const lineChartInstance = useRef<Chart | null>(null);
  const [dataset, setDataset] = useState<TestCasesWithMetadata>();

  interface PointMetadata {
    evalId: string;
    highlight: boolean;
    label: string;
    date: string;
    score: string;
  }

  interface Point {
    x: number;
    y: number;
    metadata: PointMetadata;
  }

  const fetchDataset = async (id: string) => {
    try {
      const res = await fetch(`${await getApiBaseUrl()}/api/evals/${id}`);
      return await res.json();
    } catch (err) {
      const error = err as Error;
      throw new Error(`Fetch dataset data using given id failed: ${error.message}.`);
    }
  };

  function ordinalSuffixOf(i: number): string {
    const j = i % 10,
      k = i % 100;
    if (j === 1 && k !== 11) {
      return i + 'st';
    }
    if (j === 2 && k !== 12) {
      return i + 'nd';
    }
    if (j === 3 && k !== 13) {
      return i + 'rd';
    }
    return i + 'th';
  }

  useEffect(() => {
    if (!datasetId) return;
    (async () => {
      const data = await fetchDataset(datasetId);
      setDataset(data.data[0]);
    })();
  }, [datasetId]);

  useEffect(() => {
    if (
      !lineCanvasRef.current ||
      !evalId ||
      !datasetId ||
      !dataset ||
      dataset.prompts.length <= 1
    ) {
      return;
    }

    if (lineChartInstance.current) {
      lineChartInstance.current.destroy();
    }

    const evalIdToIndex = new Map<string, number>();
    const highestScoreMap = new Map<string, Point>();
    let currentIndex = 1;
    const allPoints: Point[] = [];

    dataset.prompts.forEach((promptObject, index) => {
      const evalIdKey = promptObject.evalId;
      const isCurrentEval = evalIdKey === evalId;

      if (!evalIdToIndex.has(evalIdKey)) {
        evalIdToIndex.set(evalIdKey, currentIndex);
        currentIndex++;
      }

      if (promptObject.prompt.metrics) {
        const point: Point = {
          x: evalIdToIndex.get(evalIdKey)!,
          y:
            (promptObject.prompt.metrics.testPassCount /
              (promptObject.prompt.metrics.testPassCount +
                promptObject.prompt.metrics.testFailCount)) *
            100,
          metadata: {
            evalId: promptObject.evalId,
            highlight: isCurrentEval,
            label: promptObject.prompt.label,
            date: promptObject.evalId.split('T')[0],
            score: promptObject.prompt.metrics.score.toFixed(2),
          },
        };

        allPoints.push(point);

        if (!highestScoreMap.has(evalIdKey) || highestScoreMap.get(evalIdKey)!.y < point.y) {
          highestScoreMap.set(evalIdKey, point);
        }
      }
    });

    if (evalIdToIndex.size == 1) {
      return;
    }

    const highestScorePoints: Point[] = Array.from(highestScoreMap.values());

    lineChartInstance.current = new Chart(lineCanvasRef.current, {
      type: 'line',
      data: {
        datasets: [
          {
            type: 'scatter',
            data: allPoints,
            backgroundColor: allPoints.map((point) => (point.metadata.highlight ? 'red' : 'black')),
            pointRadius: allPoints.map((point) => (point.metadata.highlight ? 3.0 : 2.5)),
          },
          {
            type: 'line',
            data: highestScorePoints,
            backgroundColor: 'black',
            pointRadius: 0,
            pointHitRadius: 0,
          },
        ],
      },

      options: {
        animation: false,
        scales: {
          x: {
            title: {
              display: true,
              text: `Eval Index`,
            },
            type: 'linear',
            position: 'bottom',
            ticks: {
              callback: function (value) {
                if (Number.isInteger(value)) {
                  return ordinalSuffixOf(Number(value));
                }
                return '';
              },
            },
          },
          y: {
            title: {
              display: true,
              text: `Pass Rate`,
            },
            ticks: {
              callback: function (value: string | number, index: number, values: any[]) {
                let ret = String(Math.round(Number(value)));
                if (index === values.length - 1) {
                  ret += '%';
                }
                return ret;
              },
            },
          },
        },

        plugins: {
          legend: {
            display: true,
          },
          tooltip: {
            callbacks: {
              title: function (context) {
                return `Pass Rate: ${context[0].parsed.y.toFixed(2)}%`;
              },
              label: function (context) {
                const point = context.raw as Point;
                let label = point.metadata.label;
                if (label && label.length > 30) {
                  label = label.substring(0, 30) + '...';
                }
                return [
                  `evalId: ${point.metadata.evalId}`,
                  `Prompt: ${label}`,
                  `Date: ${point.metadata.date}`,
                  `Score: ${point.metadata.score}`,
                ];
              },
            },
          },
        },

        onClick: function (event, elements) {
          if (elements.length > 0) {
            const topMostElement = elements[0];
            const pointData = (topMostElement.element as any).$context.raw as Point;
            const evalId = pointData.metadata.evalId;
            window.open(`/eval/?evalId=${evalId}`, '_blank');
          }
        },
      },
    });
  }, [table, evalId, config, datasetId, dataset]);

  return <canvas ref={lineCanvasRef} style={{ maxHeight: '300px', cursor: 'pointer' }} />;
}

function ResultsCharts({ columnVisibility, recentEvals }: ResultsChartsProps) {
  const theme = useTheme();
  Chart.defaults.color = theme.palette.mode === 'dark' ? '#aaa' : '#666';
  const [showCharts, setShowCharts] = useState(true);
  const [showPerformanceOverTimeChart, setShowPerformanceOverTimeChart] = useState(false);

  const { table, evalId, config } = useStore();

  const datasetId = useMemo(() => {
    if (config) {
      return createHash('sha256').update(JSON.stringify(config.tests)).digest('hex');
    }
  }, [config]);

  useMemo(async () => {
    if (datasetId) {
      const filteredEvals = recentEvals.filter((evaluation) => evaluation.datasetId === datasetId);
      console.log(filteredEvals);
      setShowPerformanceOverTimeChart(filteredEvals.length > 1);
    } else {
      setShowCharts(false);
    }
  }, [datasetId, recentEvals]);

  if (!table || !config || !showCharts) {
    return null;
  }

  console.log(datasetId);

  if (table.head.prompts.length < 2) {
    if (showPerformanceOverTimeChart) {
      return (
        <ErrorBoundary fallback={null}>
          <Paper style={{ position: 'relative', padding: theme.spacing(3) }}>
            <IconButton
              style={{ position: 'absolute', right: 0, top: 0 }}
              onClick={() => setShowCharts(false)}
            >
              <CloseIcon />
            </IconButton>

            <div style={{ width: '100%' }}>
              <PerformanceOverTimeChart
                table={table}
                evalId={evalId}
                config={config}
                datasetId={datasetId}
              />
            </div>
          </Paper>
        </ErrorBoundary>
      );
    }
    return null;
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
      <Paper style={{ position: 'relative', padding: theme.spacing(3) }}>
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
              <PerformanceOverTimeChart
                table={table}
                evalId={evalId}
                config={config}
                datasetId={datasetId}
              />
            </div>
          )}
        </div>
      </Paper>
    </ErrorBoundary>
  );
}

export default React.memo(ResultsCharts);
