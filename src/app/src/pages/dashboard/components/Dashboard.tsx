'use client';

import React, { useEffect, useState } from 'react';
import {
  Severity,
  categoryAliases,
  riskCategories,
  riskCategorySeverityMap,
} from '@app/pages/report/components/constants';
import { callApi } from '@app/utils/api';
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
import type { StandaloneEval } from '@promptfoo/util';
import type { ApplicationAttackSuccessDataPoint } from './ApplicationAttackSuccessChart';
import CategoryBreakdown from './CategoryBreakdown';
import DashboardCharts from './DashboardCharts';
import EmergingRisks from './EmergingRisks';
import HighestSeverityCategories from './HighestSeverityCategories';
import IssuesBySeverity from './IssuesBySeverity';
import RecentEvals from './RecentEvals';
import TopFailingCategories from './TopFailingCategories';

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
  //const [sidebarOpen, setSidebarOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [attackSuccessRateData, setAttackSuccessRateData] = useState<AttackSuccessRateDataPoint[]>(
    [],
  );
  const [issuesResolvedData, setIssuesResolvedData] = useState<
    { date: string; resolved: number }[]
  >([]);
  const [activeChart, setActiveChart] = useState<
    'attackSuccess' | 'issuesResolved' | 'applicationSuccess'
  >('attackSuccess');
  const [applicationAttackSuccessData, setApplicationAttackSuccessData] = useState<
    ApplicationAttackSuccessDataPoint[]
  >([]);

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

    const response = await callApi(`/progress?${queryParams}`);
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

        Object.entries(eval_.pluginFailCount || {}).forEach(([pluginId, count]) => {
          const severity = riskCategorySeverityMap[pluginId] || Severity.Low;
          dataPoint[severity] += count;
          dataPoint.total += count;
        });

        return dataPoint;
      });

    setAttackSuccessRateData(attackSuccessRateOverTime);

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
          const resolved = Math.max(0, previousIssues - currentIssues);

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

    // Prepare data for Application Attack Success chart
    const applicationData: Record<string, Record<string, number>> = {};
    evals.forEach((eval_) => {
      const date = new Date(eval_.createdAt).toISOString().split('T')[0];
      const application = eval_.description || 'Unknown';
      if (!applicationData[date]) {
        applicationData[date] = {};
      }
      if (!applicationData[date][application]) {
        applicationData[date][application] = 0;
      }
      const successfulAttacks = eval_.metrics?.testFailCount || 0;
      applicationData[date][application] += successfulAttacks;
    });

    const applicationAttackSuccess: ApplicationAttackSuccessDataPoint[] = Object.entries(
      applicationData,
    )
      .map(([date, apps]) => ({
        date,
        applications: apps,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    setApplicationAttackSuccessData(applicationAttackSuccess);
  }, [evals]);

  const calculateSeveritySummary = () => {
    /*
    // Mock severity counts
    const severityCounts = {
      [Severity.Critical]: 5,
      [Severity.High]: 12,
      [Severity.Medium]: 20,
      [Severity.Low]: 30,
    };

    const totalIssues = Object.values(severityCounts).reduce((a, b) => a + b, 0);

    return { severityCounts, totalIssues };
    */
    const severityCounts = {
      [Severity.Critical]: 0,
      [Severity.High]: 0,
      [Severity.Medium]: 0,
      [Severity.Low]: 0,
    };

    //evals.forEach((eval_) => {
    // Just show the first eval for now
    const eval_ = evals[0];
    if (eval_) {
      Object.entries(riskCategories).forEach(([category, subCategories]) => {
        subCategories.forEach((subCategory) => {
          const pluginId = subCategory;
          if (eval_.pluginPassCount && eval_.pluginFailCount) {
            const failCount = eval_.pluginFailCount[pluginId] || 0;
            if (failCount > 0) {
              const severity = riskCategorySeverityMap[subCategory] || Severity.Low;
              //severityCounts[severity] += failCount;
              // Count the number of failing _plugins_, not the number of failing tests.
              severityCounts[severity] += 1;
            }
          }
        });
      });
    }
    //});

    const totalIssues = Object.values(severityCounts).reduce((a, b) => a + b, 0);
    const highestSeverity =
      Object.keys(severityCounts).find((severity) => severityCounts[severity as Severity] > 0) ||
      Severity.Low;

    return { severityCounts, totalIssues, highestSeverity };
  };

  const { severityCounts, totalIssues } = calculateSeveritySummary();

  const autoCompleteOptions = Array.from(new Set(evals.map((eval_) => eval_.description))).sort();

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
      {/*<Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />*/}

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          transition: 'margin-left 0.3s ease-in-out',
          // ...(sidebarOpen && { marginLeft: '180px' }),
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
            sx={{
              p: 3,
              mb: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap',
              justifyContent: 'space-between',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Autocomplete
                options={autoCompleteOptions}
                renderInput={(params) => <TextField {...params} label="Select application" />}
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
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: 'green',
                }}
              />
              {evals[0]?.createdAt && (
                <Typography variant="body2">
                  Last scan: {new Date(evals[0].createdAt).toLocaleString()}
                </Typography>
              )}
            </Box>
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
                  applicationAttackSuccessData={applicationAttackSuccessData}
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
