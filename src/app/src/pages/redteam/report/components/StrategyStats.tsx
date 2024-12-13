import React from 'react';
import { Tabs, Tab, List, ListItem } from '@mui/material';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Drawer from '@mui/material/Drawer';
import Grid from '@mui/material/Grid';
import LinearProgress, { linearProgressClasses } from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/system';
import { displayNameOverrides, subCategoryDescriptions } from '@promptfoo/redteam/constants';
import type { GradingResult } from '@promptfoo/types';
import { getStrategyIdFromGradingResult } from './shared';
import './StrategyStats.css';

interface StrategyStatsProps {
  strategyStats: Record<string, { pass: number; total: number }>;
  failuresByPlugin?: Record<
    string,
    { prompt: string; output: string; gradingResult?: GradingResult }[]
  >;
  passesByPlugin?: Record<
    string,
    { prompt: string; output: string; gradingResult?: GradingResult }[]
  >;
}

const DangerLinearProgress = styled(LinearProgress)(({ theme }) => ({
  height: 8,
  borderRadius: 8,
  [`&.${linearProgressClasses.colorPrimary}`]: {
    backgroundColor: theme.palette.mode === 'light' ? '#e0e0e0' : '#424242',
  },
  [`& .${linearProgressClasses.bar}`]: {
    borderRadius: 8,
    backgroundColor: theme.palette.mode === 'light' ? '#ff1744' : '#ff8a80',
  },
})) as React.FC<React.ComponentProps<typeof LinearProgress>>;

const StrategyStats: React.FC<StrategyStatsProps> = ({
  strategyStats,
  failuresByPlugin = {},
  passesByPlugin = {},
}) => {
  const [selectedStrategy, setSelectedStrategy] = React.useState<string | null>(null);
  const strategies = Object.entries(strategyStats).sort(
    (a, b) => (b[1].total - b[1].pass) / b[1].total - (a[1].total - a[1].pass) / a[1].total,
  );

  const handleStrategyClick = (strategy: string) => {
    setSelectedStrategy(strategy);
  };

  const handleDrawerClose = () => {
    setSelectedStrategy(null);
  };

  const getPluginStats = (strategy: string) => {
    const pluginStats: Record<string, { passes: number; total: number }> = {};

    // Process failures
    Object.entries(failuresByPlugin).forEach(([plugin, tests]) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromGradingResult(test.gradingResult);
        if (
          (strategy === 'basic' && !testStrategy) || // Handle basic strategy case
          testStrategy === strategy
        ) {
          if (!pluginStats[plugin]) {
            pluginStats[plugin] = { passes: 0, total: 0 };
          }
          pluginStats[plugin].total++;
        }
      });
    });

    // Process passes
    Object.entries(passesByPlugin).forEach(([plugin, tests]) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromGradingResult(test.gradingResult);
        if (
          (strategy === 'basic' && !testStrategy) || // Handle basic strategy case
          testStrategy === strategy
        ) {
          if (!pluginStats[plugin]) {
            pluginStats[plugin] = { passes: 0, total: 0 };
          }
          pluginStats[plugin].passes++;
          pluginStats[plugin].total++;
        }
      });
    });

    return Object.entries(pluginStats)
      .map(([plugin, stats]) => ({
        plugin,
        ...stats,
        failRate: ((stats.total - stats.passes) / stats.total) * 100,
      }))
      .sort((a, b) => b.failRate - a.failRate);
  };

  const getExamplesByStrategy = (strategy: string) => {
    const failures: (typeof failuresByPlugin)[string] = [];
    const passes: (typeof passesByPlugin)[string] = [];

    // Collect failures for this strategy
    Object.values(failuresByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromGradingResult(test.gradingResult);
        if ((strategy === 'basic' && !testStrategy) || testStrategy === strategy) {
          failures.push(test);
        }
      });
    });

    // Collect passes for this strategy
    Object.values(passesByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromGradingResult(test.gradingResult);
        if ((strategy === 'basic' && !testStrategy) || testStrategy === strategy) {
          passes.push(test);
        }
      });
    });

    return { failures, passes };
  };

  const getPromptDisplayString = (prompt: string): string => {
    try {
      const parsedPrompt = JSON.parse(prompt);
      if (Array.isArray(parsedPrompt)) {
        const lastPrompt = parsedPrompt[parsedPrompt.length - 1];
        if (lastPrompt?.content) {
          return lastPrompt.content || '-';
        }
      }
    } catch {
      console.debug('Failed to parse prompt as JSON, using raw string');
    }
    return prompt;
  };

  const getOutputDisplay = (output: string | object) => {
    if (typeof output === 'string') {
      return output;
    }
    if (Array.isArray(output)) {
      const items = output.filter((item) => item.type === 'function');
      if (items.length > 0) {
        return (
          <>
            {items.map((item) => (
              <div key={item.id}>
                <strong>Used tool {item.function?.name}</strong>: ({item.function?.arguments})
              </div>
            ))}
          </>
        );
      }
    }
    return JSON.stringify(output);
  };

  const [tabValue, setTabValue] = React.useState(0);

  return (
    <>
      <Card className="strategy-stats-card">
        <CardContent className="strategy-stats-content">
          <Typography variant="h5" mb={2}>
            Attack Methods
          </Typography>
          <Box className="strategy-grid">
            {strategies.map(([strategy, { pass, total }]) => {
              const failRate = ((total - pass) / total) * 100;
              return (
                <Box
                  key={strategy}
                  className="strategy-item"
                  onClick={() => handleStrategyClick(strategy)}
                  sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.04)' } }}
                >
                  <Typography variant="body1" className="strategy-name">
                    {displayNameOverrides[strategy as keyof typeof displayNameOverrides] ||
                      strategy}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    className="strategy-description"
                  >
                    {subCategoryDescriptions[strategy as keyof typeof subCategoryDescriptions] ||
                      ''}
                  </Typography>
                  <Box display="flex" alignItems="center" className="progress-container">
                    <Box width="100%" mr={1}>
                      <DangerLinearProgress variant="determinate" value={failRate} />
                    </Box>
                    <Box minWidth={45} className="fail-rate">
                      <Typography variant="body2" color="text.secondary">
                        {failRate.toFixed(1)}%
                      </Typography>
                    </Box>
                  </Box>
                  <Typography variant="caption" color="text.secondary" className="attack-stats">
                    {total - pass} / {total} attacks succeeded
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </CardContent>
      </Card>

      <Drawer anchor="right" open={Boolean(selectedStrategy)} onClose={handleDrawerClose}>
        <Box sx={{ width: 750, p: 3 }}>
          <Typography variant="h5" gutterBottom>
            {selectedStrategy &&
              (displayNameOverrides[selectedStrategy as keyof typeof displayNameOverrides] ||
                selectedStrategy)}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {selectedStrategy &&
              (subCategoryDescriptions[selectedStrategy as keyof typeof subCategoryDescriptions] ||
                '')}
          </Typography>

          <Box sx={{ mt: 3, mb: 4, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
            <Grid container spacing={3}>
              <Grid item xs={4}>
                <Typography variant="h6" align="center">
                  {selectedStrategy && strategyStats[selectedStrategy]?.total}
                </Typography>
                <Typography variant="body2" align="center" color="text.secondary">
                  Total Attempts
                </Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="h6" align="center" color="error.main">
                  {selectedStrategy &&
                    strategyStats[selectedStrategy].total - strategyStats[selectedStrategy].pass}
                </Typography>
                <Typography variant="body2" align="center" color="text.secondary">
                  Successful Attacks
                </Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="h6" align="center">
                  {selectedStrategy &&
                    `${(
                      ((strategyStats[selectedStrategy].total -
                        strategyStats[selectedStrategy].pass) /
                        strategyStats[selectedStrategy].total) *
                      100
                    ).toFixed(1)}%`}
                </Typography>
                <Typography variant="body2" align="center" color="text.secondary">
                  Success Rate
                </Typography>
              </Grid>
            </Grid>
          </Box>

          <Typography variant="h6" gutterBottom sx={{ mt: 4, mb: 2 }}>
            Attack Performance by Plugin
          </Typography>

          {selectedStrategy && (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Plugin</TableCell>
                    <TableCell align="right">Attack Success Rate</TableCell>
                    <TableCell align="right"># Successful Attacks</TableCell>
                    <TableCell align="right"># Attempts</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {getPluginStats(selectedStrategy).map((stat) => (
                    <TableRow key={stat.plugin}>
                      <TableCell component="th" scope="row">
                        {displayNameOverrides[stat.plugin as keyof typeof displayNameOverrides] ||
                          stat.plugin}
                      </TableCell>
                      <TableCell align="right">{stat.failRate.toFixed(1)}%</TableCell>
                      <TableCell align="right">{stat.total - stat.passes}</TableCell>
                      <TableCell align="right">{stat.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Typography variant="h6" gutterBottom sx={{ mt: 4, mb: 2 }}>
            Example Attacks
          </Typography>

          <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)} sx={{ mb: 2 }}>
            <Tab
              label={`Successful Attacks (${selectedStrategy ? strategyStats[selectedStrategy].total - strategyStats[selectedStrategy].pass : 0})`}
            />
            <Tab
              label={`Failed Attempts (${selectedStrategy ? strategyStats[selectedStrategy].pass : 0})`}
            />
          </Tabs>

          {tabValue === 0 && selectedStrategy && (
            <List>
              {getExamplesByStrategy(selectedStrategy)
                .failures.slice(0, 5)
                .map((failure, index) => (
                  <Paper key={index} elevation={1} sx={{ mb: 2, p: 2 }}>
                    <ListItem
                      sx={{
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        p: 2,
                      }}
                    >
                      <Box sx={{ width: '100%' }}>
                        <Typography
                          variant="subtitle2"
                          color="text.secondary"
                          gutterBottom
                          sx={{ fontWeight: 'bold' }}
                        >
                          Prompt:
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            mb: 2,
                            p: 1.5,
                            bgcolor: 'grey.50',
                            borderRadius: 1,
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {getPromptDisplayString(failure.prompt)}
                        </Typography>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Response:
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            p: 1.5,
                            bgcolor: 'grey.50',
                            borderRadius: 1,
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {getOutputDisplay(failure.output)}
                        </Typography>
                      </Box>
                    </ListItem>
                  </Paper>
                ))}
            </List>
          )}

          {tabValue === 1 && selectedStrategy && (
            <List>
              {getExamplesByStrategy(selectedStrategy)
                .passes.slice(0, 5)
                .map((pass, index) => (
                  <Paper key={index} elevation={1} sx={{ mb: 2 }}>
                    <ListItem
                      sx={{
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        p: 2,
                      }}
                    >
                      <Box sx={{ width: '100%' }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Prompt:
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            mb: 2,
                            p: 1.5,
                            bgcolor: 'grey.50',
                            borderRadius: 1,
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {getPromptDisplayString(pass.prompt)}
                        </Typography>
                        <Typography
                          variant="subtitle2"
                          color="text.secondary"
                          gutterBottom
                          sx={{ fontWeight: 'bold' }}
                        >
                          Response:
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            p: 1.5,
                            bgcolor: 'grey.50',
                            borderRadius: 1,
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {getOutputDisplay(pass.output)}
                        </Typography>
                      </Box>
                    </ListItem>
                  </Paper>
                ))}
            </List>
          )}
        </Box>
      </Drawer>
    </>
  );
};

export default StrategyStats;
