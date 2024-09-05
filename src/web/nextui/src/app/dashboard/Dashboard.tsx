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
  Legend,
} from 'recharts';
import { Severity, riskCategorySeverityMap } from '../report/constants';
import CategoryBreakdown from './CategoryBreakdown';
import EmergingRisks from './EmergingRisks';
import MetricCard from './MetricCard';
import RecentEvals from './RecentEvals';
import Sidebar from './Sidebar';
import TopFailingCategories from './TopFailingCategories';
import { calculateTrend, processCategoryData, CategoryData } from './utils';

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
      setEvals(data.data.filter((eval_: StandaloneEval) => eval_.isRedteam));
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

  const totalProbes = evals.reduce(
    (sum, eval_) => sum + (eval_.metrics?.testPassCount || 0) + (eval_.metrics?.testFailCount || 0),
    0,
  );
  const totalSuccessfulAttacks = evals.reduce(
    (sum, eval_) => sum + (eval_.metrics?.testFailCount || 0),
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
  const latestAttackSuccessRate = (() => {
    if (evals.length === 0) {
      return 0;
    }
    const latestEval = evals[evals.length - 1];
    if (latestEval.metrics?.testFailCount && latestEval.metrics?.testPassCount) {
      return (
        latestEval.metrics.testFailCount /
        (latestEval.metrics.testPassCount + latestEval.metrics.testFailCount)
      );
    }
    return 0;
  })();

  const calculateMetricTrends = () => {
    if (evals.length < 2) {
      const flatTrend = {
        direction: 'flat' as const,
        sentiment: 'flat' as const,
        value: 0,
      };
      return {
        attackSuccessRateTrend: flatTrend,
        totalSuccessfulAttacksTrend: flatTrend,
        averageAttackSuccessRateTrend: flatTrend,
      };
    }

    const currentAttackSuccessRate = latestAttackSuccessRate;
    const previousAttackSuccessRate = (() => {
      if (evals.length <= 1) {
        return currentAttackSuccessRate;
      }
      const previousEval = evals[evals.length - 2];
      if (previousEval.metrics?.testFailCount && previousEval.metrics?.testPassCount) {
        return (
          previousEval.metrics.testFailCount /
          (previousEval.metrics.testPassCount + previousEval.metrics.testFailCount)
        );
      }
      return currentAttackSuccessRate;
    })();

    const attackSuccessRateTrend = calculateTrend(
      currentAttackSuccessRate,
      previousAttackSuccessRate,
      true, // increase is bad
    );

    const currentTotalSuccessfulAttacks = totalSuccessfulAttacks;
    const previousTotalSuccessfulAttacks =
      evals.length > 1
        ? evals.slice(1).reduce((sum, eval_) => sum + (eval_.metrics?.testFailCount || 0), 0)
        : currentTotalSuccessfulAttacks;

    const totalSuccessfulAttacksTrend = calculateTrend(
      currentTotalSuccessfulAttacks,
      previousTotalSuccessfulAttacks,
      true /* increase is bad */,
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

    return { attackSuccessRateTrend, totalSuccessfulAttacksTrend, averageAttackSuccessRateTrend };
  };

  const { attackSuccessRateTrend, totalSuccessfulAttacksTrend, averageAttackSuccessRateTrend } =
    calculateMetricTrends();

  const latestEvalDate = evals.length > 0 ? new Date(evals[evals.length - 1].createdAt) : null;
  const formattedLatestEvalDate = latestEvalDate
    ? latestEvalDate.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'N/A';

  const categoryData = processCategoryData(evals);

  const calculateSeveritySummary = () => {
    const severityCounts = {
      [Severity.Critical]: 0,
      [Severity.High]: 0,
      [Severity.Medium]: 0,
      [Severity.Low]: 0,
    };

    Object.values(categoryData).forEach((data) => {
      if (data.currentFailCount > 0) {
        severityCounts[data.severity]++;
      }
    });

    const totalIssues = Object.values(severityCounts).reduce((a, b) => a + b, 0);
    const highestSeverity =
      Object.keys(severityCounts).find((severity) => severityCounts[severity as Severity] > 0) ||
      Severity.Low;

    return { severityCounts, totalIssues, highestSeverity };
  };

  const { severityCounts, totalIssues, highestSeverity } = calculateSeveritySummary();

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
                  title="Attack Success Rate"
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
                  subtitle={`As of ${formattedLatestEvalDate}`}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MetricCard
                  title="Successful Attacks"
                  value={totalSuccessfulAttacks.toLocaleString()}
                  trend={totalSuccessfulAttacksTrend.direction}
                  sentiment={totalSuccessfulAttacksTrend.sentiment}
                  trendValue={`${totalSuccessfulAttacksTrend.value.toLocaleString(undefined, {
                    style: 'percent',
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}`}
                  subtitle={`Out of ${totalProbes.toLocaleString()} total`}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MetricCard
                  title="Open Issues"
                  value={`${totalIssues} Issues`}
                  trend={highestSeverity.toLowerCase() as 'up' | 'down' | 'flat'}
                  sentiment={
                    highestSeverity === Severity.Low
                      ? 'good'
                      : highestSeverity === Severity.Medium
                        ? 'flat'
                        : 'bad'
                  }
                  trendValue={highestSeverity}
                  subtitle={`Critical: ${severityCounts[Severity.Critical]}, High: ${severityCounts[Severity.High]}, Medium: ${severityCounts[Severity.Medium]}, Low: ${severityCounts[Severity.Low]}`}
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
                    Attack Success Trend
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
                              'Attack Success Rate',
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
              {/* Attack Severity Breakdown */}
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
                    Issues by Severity
                  </Typography>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { severity: 'Critical', count: severityCounts[Severity.Critical] },
                          { severity: 'High', count: severityCounts[Severity.High] },
                          { severity: 'Medium', count: severityCounts[Severity.Medium] },
                          { severity: 'Low', count: severityCounts[Severity.Low] },
                        ].filter((item) => item.count > 0)} // Only include non-zero counts
                        dataKey="count"
                        nameKey="severity"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={4}
                      >
                        {[
                          { severity: 'Critical', color: '#f44336' },
                          { severity: 'High', color: '#4caf50' },
                          { severity: 'Medium', color: '#ff9800' },
                          { severity: 'Low', color: '#f44336' },
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`${value} attack types`, `Severity ${name}`]}
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.8)',
                          backdropFilter: 'blur(4px)',
                          border: 'none',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconType="circle"
                        iconSize={10}
                        formatter={(value) => (
                          <span style={{ color: '#666', fontSize: '12px' }}>{value}</span>
                        )}
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
