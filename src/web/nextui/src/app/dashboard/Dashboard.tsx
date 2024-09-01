'use client';

import React, { useEffect, useState } from 'react';
import type { StandaloneEval } from '@/../../../util';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import CategoryBreakdown from './CategoryBreakdown';
import EmergingRisks from './EmergingRisks';
import MetricCard from './MetricCard';
import RecentEvals from './RecentEvals';
import Sidebar from './Sidebar';
import TopFailingCategories from './TopFailingCategories';
import { calculateTrend } from './utils';

interface OverallPassRateDataPoint {
  name: string;
  value: number;
}

interface PassRateDataPoint {
  date: string;
  passRate: number;
}

export default function Dashboard() {
  const [evals, setEvals] = useState<StandaloneEval[]>([]);
  const [tagValue, setTagValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [passRateData, setPassRateData] = useState<PassRateDataPoint[]>([]);
  const [overallPassRateData, setOverallPassRateData] = useState<OverallPassRateDataPoint[]>([]);

  const fetchEvals = async () => {
    setIsLoading(true);
    const queryParams = new URLSearchParams();
    if (tagValue) {
      queryParams.append('tagName', 'application');
      queryParams.append('tagValue', tagValue);
    }
    if (startDate) {
      queryParams.append('startDate', startDate);
    }
    if (endDate) {
      queryParams.append('endDate', endDate);
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

    // Prepare data for Recharts
    const passRateOverTime = evals
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((eval_) => ({
        date: new Date(eval_.createdAt).toLocaleDateString(),
        passRate:
          eval_.metrics?.testPassCount && eval_.metrics?.testFailCount
            ? (eval_.metrics.testPassCount /
                (eval_.metrics.testPassCount + eval_.metrics.testFailCount)) *
              100
            : 0,
      }))
      .filter((item) => item.passRate);

    setPassRateData(passRateOverTime);

    const overallPassRate =
      evals.reduce((sum, eval_) => sum + (eval_.metrics?.testPassCount || 0), 0) /
      evals.reduce(
        (sum, eval_) =>
          sum + ((eval_.metrics?.testPassCount || 0) + (eval_.metrics?.testFailCount || 0)),
        0,
      );

    setOverallPassRateData([
      { name: 'Pass', value: overallPassRate * 100 },
      { name: 'Fail', value: (1 - overallPassRate) * 100 },
    ]);
  }, [evals]);

  const totalTests = evals.reduce(
    (sum, eval_) => sum + (eval_.metrics?.testPassCount || 0) + (eval_.metrics?.testFailCount || 0),
    0,
  );
  const averagePassRate =
    evals.length > 0
      ? evals.reduce((sum, eval_) => {
          const passRate =
            eval_.metrics?.testPassCount && eval_.metrics?.testFailCount
              ? eval_.metrics.testPassCount /
                (eval_.metrics.testPassCount + eval_.metrics.testFailCount)
              : 0;
          return sum + passRate;
        }, 0) / evals.length
      : 0;
  const latestPassRate =
    evals.length > 0
      ? evals[0].metrics?.testPassCount && evals[0].metrics?.testFailCount
        ? evals[0].metrics.testPassCount /
          (evals[0].metrics.testPassCount + evals[0].metrics.testFailCount)
        : 0
      : 0;

  const calculateMetricTrends = () => {
    const currentPassRate = latestPassRate * 100;
    const previousPassRate =
      evals.length > 1 && evals[1].metrics?.testPassCount && evals[1].metrics?.testFailCount
        ? (evals[1].metrics.testPassCount /
            (evals[1].metrics.testPassCount + evals[1].metrics.testFailCount)) *
          100
        : currentPassRate;

    const passRateTrend = calculateTrend(currentPassRate, previousPassRate);

    const currentTotalTests = totalTests;
    const previousTotalTests =
      evals.length > 1
        ? evals
            .slice(1)
            .reduce(
              (sum, eval_) =>
                sum + (eval_.metrics?.testPassCount || 0) + (eval_.metrics?.testFailCount || 0),
              0,
            )
        : currentTotalTests;

    const totalTestsTrend = calculateTrend(currentTotalTests, previousTotalTests);

    // Calculate average pass rate trend by looking at the average pass rate of the last half of the evals
    const currentAveragePassRate = averagePassRate * 100;
    const previousAveragePassRate =
      evals.length > 1
        ? (evals.slice(Math.floor(evals.length / 2)).reduce((sum, eval_) => {
            const passRate =
              eval_.metrics?.testPassCount && eval_.metrics?.testFailCount
                ? eval_.metrics.testPassCount /
                  (eval_.metrics.testPassCount + eval_.metrics.testFailCount)
                : 0;
            return sum + passRate;
          }, 0) /
            Math.floor(evals.length / 2)) *
          100
        : currentAveragePassRate;

    const averagePassRateTrend = calculateTrend(currentAveragePassRate, previousAveragePassRate);

    return { passRateTrend, totalTestsTrend, averagePassRateTrend };
  };

  const { passRateTrend, totalTestsTrend, averagePassRateTrend } = calculateMetricTrends();

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
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          transition: 'margin-left 0.3s ease-in-out',
          ...(sidebarOpen && { marginLeft: '180px' }),
        }}
      >
        <Container maxWidth={false} disableGutters sx={{ mt: 2, mb: 4, px: 4 }}>
          <Typography variant="h4" gutterBottom sx={{ mb: 3, fontWeight: 'bold' }}>
            LLM Risk - Continuous Monitoring
          </Typography>

          {/* Filters */}
          <Paper
            sx={{ p: 3, mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}
          >
            <TextField
              label="Application Name"
              variant="outlined"
              size="small"
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
            />
            <TextField
              label="Start Date"
              type="date"
              variant="outlined"
              size="small"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End Date"
              type="date"
              variant="outlined"
              size="small"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
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
              {/* Metric cards */}
              <Grid item xs={12} md={4}>
                <MetricCard
                  title="Current Pass Rate"
                  value={`${(latestPassRate * 100).toFixed(2)}%`}
                  trend={passRateTrend.direction}
                  trendValue={`${passRateTrend.value.toFixed(2)}%`}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MetricCard
                  title="Average Pass Rate"
                  value={`${(averagePassRate * 100).toFixed(2)}%`}
                  trend={averagePassRateTrend.direction}
                  trendValue={`${averagePassRateTrend.value.toFixed(2)}%`}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MetricCard
                  title="Total Probes"
                  value={totalTests.toLocaleString()}
                  trend={totalTestsTrend.direction}
                  trendValue={`${totalTestsTrend.value.toFixed(2)}%`}
                />
              </Grid>

              {/* Pass Rate Over Time Chart */}
              <Grid item xs={12} md={8} lg={9}>
                <Paper
                  elevation={3}
                  sx={{
                    p: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    height: 350,
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="h6" mb={4}>
                    Pass Rate Over Time
                  </Typography>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={passRateData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis
                        width={40}
                        domain={[0, 100]}
                        tickFormatter={(value) => `${value}%`}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip
                        formatter={(value: number | string) => [
                          typeof value === 'number'
                            ? value.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              }) + '%'
                            : value,
                          'Pass Rate:',
                        ]}
                      />
                      <defs>
                        <linearGradient id="passRateGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2196f3" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#2196f3" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="passRate"
                        stroke="#0d47a1"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#passRateGradient)"
                        dot={false}
                        activeDot={{ r: 6, fill: '#0d47a1', stroke: '#fff', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
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
                    height: 350,
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="h6" gutterBottom>
                    Overall Pass Rate
                  </Typography>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={overallPassRateData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        fill="#2196f3"
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {overallPassRateData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? '#2196f3' : '#f44336'} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number | string) =>
                          typeof value === 'number' ? `${value.toFixed(2)}%` : value
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
              {/* Emerging Risks */}
              <Grid item xs={12} md={12}>
                <EmergingRisks evals={evals} />
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
              {/* Top Failing Categories */}
              <Grid item xs={12} md={6}>
                <Paper
                  elevation={3}
                  sx={{ p: 3, display: 'flex', flexDirection: 'column', borderRadius: 2 }}
                >
                  <TopFailingCategories evals={evals} />
                </Paper>
              </Grid>
              {/* Category Breakdown */}
              <Grid item xs={12}>
                <CategoryBreakdown evals={evals} />
              </Grid>
            </Grid>
          )}
        </Container>
      </Box>
    </Box>
  );
}
