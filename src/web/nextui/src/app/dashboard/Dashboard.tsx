'use client';

import React, { useEffect, useState } from 'react';
import type { StandaloneEval } from '@/../../../util';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  Severity,
  categoryAliases,
  categoryAliasesReverse,
  riskCategories,
  riskCategorySeverityMap,
} from '../report/constants';
import CategoryBreakdown from './CategoryBreakdown';
import DashboardCharts from './DashboardCharts';
import EmergingRisks from './EmergingRisks';
import HighestSeverityCategories from './HighestSeverityCategories';
import IssuesBySeverity from './IssuesBySeverity';
import RecentEvals from './RecentEvals';
import Sidebar from './Sidebar';
import TopFailingCategories from './TopFailingCategories';
import { calculateTrend, processCategoryData } from './utils';

function getPluginIdFromMetricName(metricName: string): string {
  const metricBaseName = metricName.split('/')[0];
  return categoryAliasesReverse[metricBaseName as keyof typeof categoryAliases];
}

interface OverallAttackSuccessRateDataPoint {
  name: string;
  value: number;
}

interface AttackSuccessRateDataPoint {
  date: string;
  [Severity.Critical]: number;
  [Severity.High]: number;
  [Severity.Medium]: number;
  [Severity.Low]: number;
  total: number;
}

export default function Dashboard() {
  const [evals, setEvals] = useState<StandaloneEval[]>([]);
  const [originalEvals, setOriginalEvals] = useState<StandaloneEval[]>([]);
  const [selectedApplication, setSelectedApplication] = useState<string | null>(null);
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
  const [issuesResolvedData, setIssuesResolvedData] = useState<
    { date: string; resolved: number }[]
  >([]);
  const [activeChart, setActiveChart] = useState<'attackSuccess' | 'issuesResolved'>(
    'attackSuccess',
  );

  const fetchEvals = async () => {
    setIsLoading(true);
    const queryParams = new URLSearchParams();
    if (selectedApplication) {
      queryParams.append('tagName', 'application');
      queryParams.append('tagValue', selectedApplication);
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
      const newEvals = data.data.filter((eval_: StandaloneEval) => eval_.isRedteam);
      setEvals(newEvals);
      setOriginalEvals(newEvals);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchEvals();
  }, []);

  useEffect(() => {
    if (selectedApplication) {
      setEvals(originalEvals.filter((eval_) => eval_.description === selectedApplication));
    } else {
      setEvals(originalEvals);
    }
  }, [selectedApplication]);

  useEffect(() => {
    if (evals.length === 0) {
      return;
    }

    // Prepare data for Recharts
    const attackSuccessRateOverTime = evals
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((eval_) => {
        const dataPoint: AttackSuccessRateDataPoint = {
          date: new Date(eval_.createdAt).toLocaleDateString(),
          [Severity.Critical]: 0,
          [Severity.High]: 0,
          [Severity.Medium]: 0,
          [Severity.Low]: 0,
          total: 0,
        };

        Object.entries(eval_.metrics?.namedScores || {}).forEach(([category, score]) => {
          if (score <= 0) {
            const severity =
              riskCategorySeverityMap[getPluginIdFromMetricName(category)] || Severity.Low;
            dataPoint[severity]++;
            dataPoint.total++;
          }
        });

        return dataPoint;
      });

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

    // Calculate issues resolved over time
    const calculateTotalIssues = (eval_: StandaloneEval) => {
      let total = 0;
      Object.entries(riskCategories).forEach(([category, subCategories]) => {
        subCategories.forEach((subCategory) => {
          const scoreName = categoryAliases[subCategory as keyof typeof categoryAliases];
          if (eval_.metrics?.namedScores && scoreName in eval_.metrics.namedScores) {
            const score = eval_.metrics.namedScores[scoreName];
            if (score <= 0) {
              total++;
            }
          }
        });
      });
      return total;
    };
    const issuesResolved = evals
      .sort((a, b) => a.createdAt - b.createdAt)
      .reduce(
        (acc, eval_, index) => {
          const date = new Date(eval_.createdAt).toLocaleDateString();
          const previousIssues = index > 0 ? calculateTotalIssues(evals[index - 1]) : 0;
          const currentIssues = calculateTotalIssues(eval_);
          const resolved = Math.max(0, previousIssues - currentIssues); // Ensure we don't have negative resolutions

          if (acc.length > 0 && acc[acc.length - 1].date === date) {
            acc[acc.length - 1].resolved += resolved;
          } else {
            acc.push({ date, resolved });
          }
          return acc;
        },
        [] as { date: string; resolved: number }[],
      );

    setIssuesResolvedData(issuesResolved);
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

  const calculateSeveritySummary = () => {
    const severityCounts = {
      [Severity.Critical]: 0,
      [Severity.High]: 0,
      [Severity.Medium]: 0,
      [Severity.Low]: 0,
    };

    evals.forEach((eval_) => {
      Object.entries(riskCategories).forEach(([category, subCategories]) => {
        subCategories.forEach((subCategory) => {
          const scoreName = categoryAliases[subCategory as keyof typeof categoryAliases];
          if (eval_.metrics?.namedScores && scoreName in eval_.metrics.namedScores) {
            const score = eval_.metrics.namedScores[scoreName];
            if (score <= 0) {
              const severity = riskCategorySeverityMap[subCategory] || Severity.Low;
              severityCounts[severity]++;
            }
          }
        });
      });
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

          {/*
          <Typography variant="h4" gutterBottom sx={{ mb: 3, fontWeight: 'bold' }}>
            LLM Risk - Continuous Monitoring
          </Typography>
          */}

          {/* Filters */}
          <Paper
            sx={{ p: 3, mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}
          >
            <Autocomplete
              options={Array.from(new Set(evals.map((eval_) => eval_.description)))}
              renderInput={(params) => <TextField {...params} label="Application Name" />}
              value={selectedApplication}
              onChange={(event, newValue) => setSelectedApplication(newValue)}
              sx={{ width: 300 }}
              size="small"
              clearOnBlur
              handleHomeEndKeys
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
              {/* Severity Cards */}
              <Grid item xs={12}>
                <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }}>
                  {[Severity.Critical, Severity.High, Severity.Medium, Severity.Low].map(
                    (severity) => (
                      <Box key={severity} flex={1}>
                        <Card
                          className={`severity-card card-${severity.toLowerCase()}`}
                          sx={{
                            transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
                            '&:hover': {
                              transform: 'translateY(-5px)',
                              boxShadow: '0 8px 16px rgba(0, 0, 0, 0.1)',
                              '[data-theme="dark"] &': {
                                boxShadow: 'none',
                              },
                            },
                            borderLeft: '5px solid',
                            borderLeftColor: {
                              critical: '#ff1744',
                              high: '#ff9100',
                              medium: '#ffc400',
                              low: '#00e676',
                            }[severity.toLowerCase()],
                          }}
                        >
                          <CardContent>
                            <Typography variant="h6" gutterBottom>
                              {severity}
                            </Typography>
                            <Typography variant="h4" color="text.primary">
                              {severityCounts[severity]}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              issues
                            </Typography>
                          </CardContent>
                        </Card>
                      </Box>
                    ),
                  )}
                </Stack>
              </Grid>

              {/*
              <Grid item xs={12} md={4}>
                <MetricCard
                  title="Attack Success Rate"
                  value={`${(latestAttackSuccessRate * 100).toFixed(1)}%`}
                  trend={attackSuccessRateTrend.direction}
                  sentiment={attackSuccessRateTrend.sentiment}
                  trendValue={`${attackSuccessRateTrend.value.toLocaleString(undefined, {
                    style: 'percent',
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}`}
                  subtitle={`Updated ${formattedLatestEvalDate}`}
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
              */}

              {/* Dashboard Charts */}
              <Grid item xs={12} md={7} lg={8}>
                <DashboardCharts
                  attackSuccessRateData={attackSuccessRateData}
                  issuesResolvedData={issuesResolvedData}
                  activeChart={activeChart}
                  setActiveChart={setActiveChart}
                />
              </Grid>
              {/* Attack Severity Breakdown */}
              <Grid item xs={12} md={5} lg={4}>
                <IssuesBySeverity severityCounts={severityCounts} totalIssues={totalIssues} />
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper
                  elevation={3}
                  sx={{ p: 3, display: 'flex', flexDirection: 'column', borderRadius: 2 }}
                >
                  <TopFailingCategories evals={evals} />
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper
                  elevation={3}
                  sx={{ p: 3, display: 'flex', flexDirection: 'column', borderRadius: 2 }}
                >
                  <HighestSeverityCategories evals={evals} />
                </Paper>
              </Grid>
              {/* Emerging Risks */}
              <Grid item xs={12} md={12}>
                <EmergingRisks evals={evals} />
              </Grid>
              {/* Recent Evals */}
              <Grid item xs={12} md={12}>
                <Paper
                  elevation={3}
                  sx={{ p: 3, display: 'flex', flexDirection: 'column', borderRadius: 2 }}
                >
                  <RecentEvals evals={evals} />
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
