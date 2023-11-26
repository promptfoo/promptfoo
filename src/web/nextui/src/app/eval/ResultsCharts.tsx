import React, { useRef, useEffect, useState } from 'react';
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
} from 'chart.js';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import { useTheme } from '@mui/material/styles';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import { ErrorBoundary } from 'react-error-boundary';

import { useStore } from './store';

import type { VisibilityState } from '@tanstack/table-core';
import type { EvaluateTable } from './types';

interface ResultsChartsProps {
  columnVisibility: VisibilityState;
}

interface ChartProps {
  table: EvaluateTable;
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
        label: `Prompt ${promptIdx + 1}`,
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
                return `Prompt ${datasetIndex + 1}`;
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
        label: `Prompt ${promptIdx + 1}`,
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
              label: function (tooltipItem) {
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
          },
          y: {
            title: {
              display: true,
              text: `Prompt ${yAxisPrompt + 1} Score`,
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

export default function ResultsCharts({ columnVisibility }: ResultsChartsProps) {
  const theme = useTheme();
  Chart.defaults.color = theme.palette.mode === 'dark' ? '#aaa' : '#666';
  const [showCharts, setShowCharts] = useState(true);

  const { table } = useStore();
  if (!table || !showCharts || table.head.prompts.length < 2) {
    return null;
  }

  const scores = table.body.flatMap((row) => row.outputs.map((output) => output.score));
  if (new Set(scores).size === 1) {
    // All scores are the same, charts not useful.
    return null;
  }

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
          <div style={{ width: '33%' }}>
            <PassRateChart table={table} />
          </div>
          <div style={{ width: '33%' }}>
            <HistogramChart table={table} />
          </div>
          <div style={{ width: '33%' }}>
            <ScatterChart table={table} />
          </div>
        </div>
      </Paper>
    </ErrorBoundary>
  );
}
