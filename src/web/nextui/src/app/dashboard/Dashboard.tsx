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

interface OverallAttackSuccessRateDataPoint {
  name: string;
  value: number;
}

interface AttackSuccessRateDataPoint {
  date: string;
  attackSuccessRate: number;
  successfulAttacks: number;
}

export default function Dashboard() {
  const [evals, setEvals] = useState<StandaloneEval[]>([]);
  const [tagValue, setTagValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [attackSuccessRateData, setAttackSuccessRateData] = useState<AttackSuccessRateDataPoint[]>(
    [],
  );
  const [overallAttackSuccessRateData, setOverallAttackSuccessRateData] = useState<
    OverallAttackSuccessRateDataPoint[]
  >([]);

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
    const attackSuccessRateOverTime = evals
      .sort((a, b) => a.createdAt - b.createdAt)
      // Redteams only
      .filter((eval_) => eval_.isRedteam)
      .map((eval_) => ({
        date: new Date(eval_.createdAt).toLocaleDateString(),
        attackSuccessRate:
          eval_.metrics?.testFailCount && eval_.metrics?.testPassCount
            ? (eval_.metrics.testFailCount /
                (eval_.metrics.testPassCount + eval_.metrics.testFailCount)) *
              100
            : 0,
        successfulAttacks: eval_.metrics?.testFailCount || 0,
      }));

    setAttackSuccessRateData(attackSuccessRateOverTime);

    const overallAttackSuccessRate =
      evals.reduce((sum, eval_) => sum + (eval_.metrics?.testFailCount || 0), 0) /
      evals.reduce(
        (sum, eval_) =>
          sum + ((eval_.metrics?.testPassCount || 0) + (eval_.metrics?.testFailCount || 0)),
        0,
      );

    setOverallAttackSuccessRateData([
      { name: 'Succeeded', value: overallAttackSuccessRate },
      { name: 'Defended', value: 1 - overallAttackSuccessRate },
    ]);
  }, [evals]);

  const totalTests = evals.reduce(
    (sum, eval_) => sum + (eval_.metrics?.testPassCount || 0) + (eval_.metrics?.testFailCount || 0),
    0,
  );
  const averageAttackSuccessRate =
    evals.length > 0
      ? evals.reduce((sum, eval_) => {
          const attackSuccessRate =
            eval_.metrics?.testFailCount && eval_.metrics?.testPassCount
              ? eval_.metrics.testFailCount /
                (eval_.metrics.testPassCount + eval_.metrics.testFailCount)
              : 0;
          return sum + attackSuccessRate;
        }, 0) / evals.length
      : 0;
  const latestAttackSuccessRate =
    evals.length > 0
      ? evals[0].metrics?.testFailCount && evals[0].metrics?.testPassCount
        ? evals[0].metrics.testFailCount /
          (evals[0].metrics.testPassCount + evals[0].metrics.testFailCount)
        : 0
      : 0;

  const calculateMetricTrends = () => {
    const currentAttackSuccessRate = latestAttackSuccessRate;
    const previousAttackSuccessRate =
      evals.length > 1 && evals[1].metrics?.testFailCount && evals[1].metrics?.testPassCount
        ? evals[1].metrics.testFailCount /
          (evals[1].metrics.testPassCount + evals[1].metrics.testFailCount)
        : currentAttackSuccessRate;

    const attackSuccessRateTrend = calculateTrend(
      currentAttackSuccessRate,
      previousAttackSuccessRate,
      true, // increase is bad
    );

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

    const totalTestsTrend = calculateTrend(
      currentTotalTests,
      previousTotalTests,
      false /* increase is good */,
    );

    // Calculate average attack success rate trend by looking at the average attack success rate of the last half of the evals
    const currentAverageAttackSuccessRate = averageAttackSuccessRate;
    const previousAverageAttackSuccessRate =
      evals.length > 1
        ? evals.slice(Math.floor(evals.length / 2)).reduce((sum, eval_) => {
            const attackSuccessRate =
              eval_.metrics?.testFailCount && eval_.metrics?.testPassCount
                ? eval_.metrics.testFailCount /
                  (eval_.metrics.testPassCount + eval_.metrics.testFailCount)
                : 0;
            return sum + attackSuccessRate;
          }, 0) / Math.floor(evals.length / 2)
        : currentAverageAttackSuccessRate;

    const averageAttackSuccessRateTrend = calculateTrend(
      currentAverageAttackSuccessRate,
      previousAverageAttackSuccessRate,
      true, // increase is bad
    );

    return { attackSuccessRateTrend, totalTestsTrend, averageAttackSuccessRateTrend };
  };

  const { attackSuccessRateTrend, totalTestsTrend, averageAttackSuccessRateTrend } =
    calculateMetricTrends();

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
          {/*
          <Typography variant="h4" gutterBottom sx={{ mb: 3, fontWeight: 'bold' }}>
            LLM Risk - Continuous Monitoring
          </Typography>
          */}

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
                  title="Current Attack Success Rate"
                  value={`${latestAttackSuccessRate.toLocaleString(undefined, {
                    style: 'percent',
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}`}
                  trend={attackSuccessRateTrend.direction}
                  sentiment={attackSuccessRateTrend.sentiment}
                  trendValue={`${attackSuccessRateTrend.value.toLocaleString(undefined, {
                    style: 'percent',
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}`}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MetricCard
                  title="Average Attack Success Rate"
                  value={`${averageAttackSuccessRate.toLocaleString(undefined, {
                    style: 'percent',
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}`}
                  trend={averageAttackSuccessRateTrend.direction}
                  sentiment={averageAttackSuccessRateTrend.sentiment}
                  trendValue={`${averageAttackSuccessRateTrend.value.toLocaleString(undefined, {
                    style: 'percent',
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}`}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MetricCard
                  title="Total Probes"
                  value={totalTests.toLocaleString()}
                  trend={totalTestsTrend.direction}
                  sentiment={totalTestsTrend.sentiment}
                  trendValue={`${totalTestsTrend.value.toLocaleString(undefined, {
                    style: 'percent',
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}`}
                />
              </Grid>

              {/* Attack Success Rate Over Time Chart */}
              <Grid item xs={12} md={7} lg={8}>
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
                    Attack Success
                  </Typography>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={attackSuccessRateData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis
                        yAxisId="left"
                        width={40}
                        domain={[0, 100]}
                        tickFormatter={(value) => `${value}%`}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        width={40}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip
                        formatter={(value: number | string, name: string) => {
                          if (name === 'attackSuccessRate') {
                            return [
                              typeof value === 'number'
                                ? value.toLocaleString(undefined, {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 1,
                                  }) + '%'
                                : value,
                              'Attack Success Rate:',
                            ];
                          } else if (name === 'successfulAttacks') {
                            return [value, 'Successful Attacks:'];
                          }
                          return [value, name];
                        }}
                      />
                      <defs>
                        <linearGradient id="attackSuccessRateGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f44336" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#f44336" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="attackSuccessRate"
                        stroke="#f44336"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#attackSuccessRateGradient)"
                        dot={false}
                        activeDot={{ r: 6, fill: '#d32f2f', stroke: '#fff', strokeWidth: 2 }}
                      />
                      {/* 
                      <Area
                        yAxisId="right"
                        type="monotone"
                        dataKey="successfulAttacks"
                        stroke="#2196f3"
                        strokeWidth={2}
                        fill="#2196f3"
                        fillOpacity={0.3}
                        dot={false}
                        activeDot={{ r: 6, fill: '#1976d2', stroke: '#fff', strokeWidth: 2 }}
                      />
                      */}
                    </AreaChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
              {/* Overall Attack Success Rate */}
              <Grid item xs={12} md={5} lg={4}>
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
                    Attack Efficacy
                  </Typography>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={overallAttackSuccessRateData}
                        innerRadius={60}
                        outerRadius={90}
                        fill="#f44336"
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${name} ${percent.toLocaleString(undefined, {
                            style: 'percent',
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}`
                        }
                        labelLine={false}
                      >
                        {overallAttackSuccessRateData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? '#f44336' : '#4caf50'} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number | string) =>
                          typeof value === 'number'
                            ? value.toLocaleString(undefined, {
                                style: 'percent',
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              })
                            : value
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
