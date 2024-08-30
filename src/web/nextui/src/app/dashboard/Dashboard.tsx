'use client';

import React, { useEffect, useState, useRef } from 'react';
import type { StandaloneEval } from '@/../../../util';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DashboardIcon from '@mui/icons-material/Dashboard';
import HelpIcon from '@mui/icons-material/Help';
import MenuIcon from '@mui/icons-material/Menu';
import SettingsIcon from '@mui/icons-material/Settings';
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  TextField,
  Button,
  CircularProgress,
} from '@mui/material';
import Drawer from '@mui/material/Drawer';
import { Chart, type ChartConfiguration, registerables } from 'chart.js';
import CategoryBreakdown from './CategoryBreakdown';
import RecentEvals from './RecentEvals';

Chart.register(...registerables);

export default function Dashboard() {
  const [evals, setEvals] = useState<StandaloneEval[]>([]);
  const [tagName, setTagName] = useState('');
  const [tagValue, setTagValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const passRateChartRef = useRef<HTMLCanvasElement | null>(null);
  const overallPassRateChartRef = useRef<HTMLCanvasElement | null>(null);
  const passRateChartInstanceRef = useRef<Chart | null>(null);
  const overallPassRateChartInstanceRef = useRef<Chart<'doughnut', number[], string> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const fetchEvals = async () => {
    setIsLoading(true);
    const queryParams = new URLSearchParams();
    if (tagName) {
      queryParams.append('tagName', tagName);
    }
    if (tagValue) {
      queryParams.append('tagValue', tagValue);
    }

    const response = await fetch(`/api/progress?${queryParams}`);
    const data = await response.json();
    if (data && data.data) {
      setEvals(data.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchEvals();
  }, []);

  useEffect(() => {
    if (evals.length === 0) {
      return;
    }

    const passRateOverTime = evals
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((eval_) => ({
        date: new Date(eval_.createdAt),
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

    // Destroy existing chart instances
    if (passRateChartInstanceRef.current) {
      passRateChartInstanceRef.current.destroy();
    }
    if (overallPassRateChartInstanceRef.current) {
      overallPassRateChartInstanceRef.current.destroy();
    }

    // Pass Rate Over Time Chart
    if (passRateChartRef.current) {
      passRateChartInstanceRef.current = new Chart(passRateChartRef.current, {
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
      const config: ChartConfiguration<'doughnut', number[], string> = {
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
      };
      overallPassRateChartInstanceRef.current = new Chart(overallPassRateChartRef.current, config);
    }

    // Cleanup function
    return () => {
      if (passRateChartInstanceRef.current) {
        passRateChartInstanceRef.current.destroy();
      }
      if (overallPassRateChartInstanceRef.current) {
        overallPassRateChartInstanceRef.current.destroy();
      }
    };
  }, [evals]);

  return (
    <Box
      sx={{
        display: 'flex',
        width: '100vw',
        maxWidth: '100%',
        overflowX: 'hidden',
        bgcolor: '#f5f5f5',
      }}
    >
      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: 60,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: 60,
            boxSizing: 'border-box',
            overflowX: 'hidden',
            transition: 'width 0.3s ease-in-out',
            top: '48px', // Adjust this value to match your navbar height
            height: 'calc(100% - 48px)', // Adjust this value to match your navbar height
            zIndex: 1, // Ensure it's below the navbar
            ...(sidebarOpen && {
              width: 240,
            }),
          },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ display: 'flex', p: 1 }}>
            <Button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              sx={{ justifyContent: 'flex-start' }}
            >
              <MenuIcon />
            </Button>
          </Box>
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', mt: 2 }}>
            <Button
              startIcon={<DashboardIcon />}
              sx={{
                justifyContent: sidebarOpen ? 'flex-start' : 'center',
                px: sidebarOpen ? 2 : 1,
                mb: 1,
              }}
            >
              {sidebarOpen && 'Dashboard'}
            </Button>
            <Button
              startIcon={<AssessmentIcon />}
              sx={{
                justifyContent: sidebarOpen ? 'flex-start' : 'center',
                px: sidebarOpen ? 2 : 1,
                mb: 1,
              }}
            >
              {sidebarOpen && 'Reports'}
            </Button>
            <Button
              startIcon={<SettingsIcon />}
              sx={{
                justifyContent: sidebarOpen ? 'flex-start' : 'center',
                px: sidebarOpen ? 2 : 1,
                mb: 1,
              }}
            >
              {sidebarOpen && 'Settings'}
            </Button>
          </Box>
          <Box sx={{ mb: 2 }}>
            <Button
              startIcon={<HelpIcon />}
              sx={{
                justifyContent: sidebarOpen ? 'flex-start' : 'center',
                px: sidebarOpen ? 2 : 1,
              }}
            >
              {sidebarOpen && 'Help'}
            </Button>
          </Box>
        </Box>
      </Drawer>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          transition: 'margin-left 0.3s ease-in-out',
          ...(sidebarOpen && { marginLeft: '180px' }),
        }}
      >
        <Container maxWidth={false} disableGutters sx={{ mt: 4, mb: 4, px: 4 }}>
          <Typography variant="h4" gutterBottom sx={{ mb: 3, fontWeight: 'bold', color: '#333' }}>
            LLM Risk - Continuous Monitoring
          </Typography>

          {/* Filters */}
          <Paper sx={{ p: 3, mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField
              label="Tag Name"
              variant="outlined"
              size="small"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
            />
            <TextField
              label="Tag Value"
              variant="outlined"
              size="small"
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
            />
            <Button variant="contained" color="inherit" onClick={fetchEvals}>
              Apply Filters
            </Button>
          </Paper>

          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
              <CircularProgress size={60} thickness={4} />
            </Box>
          ) : (
            <Grid container spacing={3}>
              {/* Pass Rate Over Time Chart */}
              <Grid item xs={12} md={8} lg={9}>
                <Paper
                  elevation={3}
                  sx={{
                    p: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    height: 300,
                    borderRadius: 2,
                  }}
                >
                  <canvas ref={passRateChartRef}></canvas>
                </Paper>
              </Grid>
              {/* Overall Pass Rate */}
              <Grid item xs={12} md={4} lg={3}>
                <Paper
                  elevation={3}
                  sx={{
                    p: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    height: 300,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderRadius: 2,
                  }}
                >
                  <canvas ref={overallPassRateChartRef}></canvas>
                </Paper>
              </Grid>
              {/* Category Breakdown */}
              <Grid item xs={12} md={6}>
                <Paper
                  elevation={3}
                  sx={{ p: 3, display: 'flex', flexDirection: 'column', borderRadius: 2 }}
                >
                  <CategoryBreakdown evals={evals} />
                </Paper>
              </Grid>
              {/* Recent Evals */}
              <Grid item xs={12} md={6}>
                <Paper
                  elevation={3}
                  sx={{ p: 3, display: 'flex', flexDirection: 'column', borderRadius: 2 }}
                >
                  <RecentEvals evals={evals} />
                </Paper>
              </Grid>
            </Grid>
          )}
        </Container>
      </Box>
    </Box>
  );
}
