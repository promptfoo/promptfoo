'use client';

import React, { useEffect, useState, useRef } from 'react';
import type { StandaloneEval } from '@/../../../util';
import { Box, Container, Grid, Paper, Typography } from '@mui/material';
import { Chart, registerables } from 'chart.js';
import CategoryBreakdown from './CategoryBreakdown';
import RecentEvals from './RecentEvals';

Chart.register(...registerables);

export default function Dashboard() {
  const [evals, setEvals] = useState<StandaloneEval[]>([]);
  const passRateChartRef = useRef<HTMLCanvasElement | null>(null);
  const overallPassRateChartRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    (async () => {
      const response = await fetch(`/api/progress`);
      const data = await response.json();
      if (data && data.data) {
        setEvals(data.data);
      }
    })();
  }, []);

  useEffect(() => {
    if (evals.length === 0) {
      return;
    }

    const passRateOverTime = evals.map((eval_) => ({
      date: new Date(),
      passRate:
        eval_.metrics?.testPassCount && eval_.metrics?.testFailCount
          ? (eval_.metrics.testPassCount /
              (eval_.metrics.testPassCount + eval_.metrics.testFailCount)) *
            100
          : 0,
    }));

    const overallPassRate =
      evals.reduce((sum, eval_) => sum + (eval_.metrics?.testPassCount || 0), 0) /
      evals.reduce(
        (sum, eval_) =>
          sum + ((eval_.metrics?.testPassCount || 0) + (eval_.metrics?.testFailCount || 0)),
        0,
      );

    // Pass Rate Over Time Chart
    if (passRateChartRef.current) {
      new Chart(passRateChartRef.current, {
        type: 'line',
        data: {
          labels: passRateOverTime.map((item) => item.date.toLocaleDateString()),
          datasets: [
            {
              label: 'Pass Rate',
              data: passRateOverTime.map((item) => item.passRate),
              fill: true,
              borderColor: 'rgb(75, 192, 192)',
              tension: 0.1,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: 'Pass Rate Over Time',
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
            },
          },
        },
      });
    }

    // Overall Pass Rate Chart
    if (overallPassRateChartRef.current) {
      new Chart(overallPassRateChartRef.current, {
        type: 'doughnut',
        data: {
          labels: ['Pass', 'Fail'],
          datasets: [
            {
              data: [overallPassRate * 100, (1 - overallPassRate) * 100],
              backgroundColor: ['#4caf50', '#f44336'],
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: 'Overall Pass Rate',
            },
          },
          cutout: '80%',
        },
      });
    }
  }, [evals]);

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Redteam Evaluation Dashboard
      </Typography>
      <Grid container spacing={3}>
        {/* Pass Rate Over Time Chart */}
        <Grid item xs={12} md={8} lg={9}>
          <Paper
            sx={{
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              height: 240,
            }}
          >
            <canvas ref={passRateChartRef}></canvas>
          </Paper>
        </Grid>
        {/* Overall Pass Rate */}
        <Grid item xs={12} md={4} lg={3}>
          <Paper
            sx={{
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              height: 240,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <canvas ref={overallPassRateChartRef}></canvas>
          </Paper>
        </Grid>
        {/* Category Breakdown */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
            <CategoryBreakdown evals={evals} />
          </Paper>
        </Grid>
        {/* Recent Evals */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
            <RecentEvals evals={evals} />
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
