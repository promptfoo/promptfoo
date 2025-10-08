import React from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import Grid from '@mui/material/Grid';
import LinearProgress, { linearProgressClasses } from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import { alpha, styled, useTheme } from '@mui/material/styles';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { displayNameOverrides, subCategoryDescriptions } from '@promptfoo/redteam/constants';
import { getPluginIdFromResult, getStrategyIdFromTest } from './shared';
import type { EvaluateResult, GradingResult } from '@promptfoo/types';
import { calculateAttackSuccessRate } from '@promptfoo/redteam/metrics';
import { formatASRForDisplay } from '@app/utils/redteam';
import { type TestResultStats, type CategoryStats } from './FrameworkComplianceUtils';

interface TestWithMetadata {
  prompt: string;
  output: string;
  gradingResult?: GradingResult;
  result?: EvaluateResult;
  metadata?: {
    strategyId?: string;
    [key: string]: any;
  };
}

interface StrategyStatsProps {
  strategyStats: CategoryStats;
  failuresByPlugin: Record<string, TestWithMetadata[]>;
  passesByPlugin: Record<string, TestWithMetadata[]>;
}

interface DrawerContentProps {
  selectedStrategy: string;
  tabValue: number;
  onTabChange: (value: number) => void;
  failuresByPlugin: Record<string, TestWithMetadata[]>;
  passesByPlugin: Record<string, TestWithMetadata[]>;
  selectedStrategyStats: TestResultStats;
}

const DangerLinearProgress = styled(LinearProgress)(({ theme }) => ({
  height: 10,
  borderRadius: 5,
  [`&.${linearProgressClasses.colorPrimary}`]: {
    backgroundColor:
      theme.palette.mode === 'light'
        ? alpha(theme.palette.error.main, 0.1)
        : alpha(theme.palette.error.dark, 0.2),
  },
  [`& .${linearProgressClasses.bar}`]: {
    borderRadius: 5,
    backgroundColor:
      theme.palette.mode === 'light' ? theme.palette.error.main : theme.palette.error.light,
  },
}));

const StyledCard = styled(Card)(({ theme }) => ({
  transition: 'all 0.3s ease',
  backgroundColor:
    theme.palette.mode === 'dark'
      ? alpha(theme.palette.background.paper, 0.8)
      : theme.palette.background.paper,
  boxShadow: theme.shadows[theme.palette.mode === 'dark' ? 2 : 1],
}));

const StyledGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: theme.spacing(2),
}));

const StyledStrategyItem = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
  transition: 'all 0.2s ease',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: alpha(theme.palette.action.hover, theme.palette.mode === 'dark' ? 0.1 : 0.04),
  },
}));

const StyledProgressContainer = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  marginBottom: '8px',
});

const StyledFailRate = styled(Box)({
  minWidth: 45,
  textAlign: 'right',
});

const StyledStrategyName = styled(Typography)(({ theme }) => ({
  fontWeight: 600,
  marginBottom: theme.spacing(1),
}));

const StyledStrategyDescription = styled(Typography)(({ theme }) => ({
  minHeight: 40,
  marginBottom: theme.spacing(2),
}));

const DrawerContent = ({
  selectedStrategy,
  tabValue,
  onTabChange,
  failuresByPlugin,
  passesByPlugin,
  selectedStrategyStats,
}: DrawerContentProps) => {
  const theme = useTheme();

  const pluginStats = React.useMemo(() => {
    const pluginStats: Record<string, { successfulAttacks: number; total: number }> = {};

    // Process failures (blocked attacks)
    Object.entries(passesByPlugin).forEach(([plugin, tests]) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromTest(test);

        if (testStrategy === selectedStrategy) {
          if (!pluginStats[plugin]) {
            pluginStats[plugin] = { successfulAttacks: 0, total: 0 };
          }
          pluginStats[plugin].total++;
        }
      });
    });

    // Process passes (successful attacks)
    Object.entries(failuresByPlugin).forEach(([plugin, tests]) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromTest(test);

        if (testStrategy === selectedStrategy) {
          if (!pluginStats[plugin]) {
            pluginStats[plugin] = { successfulAttacks: 0, total: 0 };
          }
          pluginStats[plugin].successfulAttacks++;
          pluginStats[plugin].total++;
        }
      });
    });

    return Object.entries(pluginStats)
      .map(([plugin, stats]) => ({
        plugin,
        ...stats,
        asr: calculateAttackSuccessRate(stats.total, stats.successfulAttacks),
      }))
      .sort((a, b) => b.asr - a.asr);
  }, [failuresByPlugin, passesByPlugin, selectedStrategy]);

  const examplesByStrategy = React.useMemo(() => {
    const failures: (typeof failuresByPlugin)[string] = [];
    const passes: (typeof passesByPlugin)[string] = [];

    // Collect failures for this strategy
    Object.values(failuresByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromTest(test);
        if (testStrategy === selectedStrategy) {
          failures.push(test);
        }
      });
    });

    // Collect passes for this strategy
    Object.values(passesByPlugin).forEach((tests) => {
      tests.forEach((test) => {
        const testStrategy = getStrategyIdFromTest(test);
        if (testStrategy === selectedStrategy) {
          passes.push(test);
        }
      });
    });

    return { failures, passes };
  }, [failuresByPlugin, passesByPlugin, selectedStrategy]);

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

  return (
    <Box
      sx={{
        width: 750,
        p: 3,
        color: theme.palette.text.primary,
        backgroundColor:
          theme.palette.mode === 'dark'
            ? alpha(theme.palette.background.paper, 0.9)
            : theme.palette.background.paper,
        backdropFilter: theme.palette.mode === 'dark' ? 'blur(10px)' : 'none',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <Typography variant="h5" gutterBottom>
        {displayNameOverrides[selectedStrategy as keyof typeof displayNameOverrides] ||
          selectedStrategy}
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {subCategoryDescriptions[selectedStrategy as keyof typeof subCategoryDescriptions] || ''}
      </Typography>

      {/* Stats Grid */}
      <Box
        sx={{
          mt: 3,
          mb: 4,
          p: 2,
          bgcolor:
            theme.palette.mode === 'dark'
              ? alpha(theme.palette.background.paper, 0.6)
              : theme.palette.grey[50],
          borderRadius: 1,
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Grid container spacing={3}>
          <Grid size={{ xs: 4 }}>
            <Typography variant="h6" align="center">
              {selectedStrategyStats.total}
            </Typography>
            <Typography variant="body2" align="center" color="text.secondary">
              Total Attempts
            </Typography>
          </Grid>
          <Grid size={{ xs: 4 }}>
            <Typography variant="h6" align="center" color="error.main">
              {selectedStrategyStats.pass}
            </Typography>
            <Typography variant="body2" align="center" color="text.secondary">
              Flagged Attempts
            </Typography>
          </Grid>
          <Grid size={{ xs: 4 }}>
            <Typography variant="h6" align="center">
              {`${formatASRForDisplay(calculateAttackSuccessRate(selectedStrategyStats.total, selectedStrategyStats.failCount))}%`}
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
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Plugin</TableCell>
              <TableCell align="right">Attack Success Rate</TableCell>
              <TableCell align="right"># Flagged Attempts</TableCell>
              <TableCell align="right"># Attempts</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pluginStats.map((stat) => (
              <TableRow key={stat.plugin}>
                <TableCell component="th" scope="row">
                  {displayNameOverrides[stat.plugin as keyof typeof displayNameOverrides] ||
                    stat.plugin}
                </TableCell>
                <TableCell align="right">{formatASRForDisplay(stat.asr)}%</TableCell>
                <TableCell align="right">{stat.total - stat.successfulAttacks}</TableCell>
                <TableCell align="right">{stat.total}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Tabs */}
      <Tabs
        value={tabValue}
        onChange={(_, newValue) => onTabChange(newValue)}
        sx={{ mt: 3, mb: 2 }}
      >
        <Tab label={`Flagged Attempts (${selectedStrategyStats.pass})`} />
        <Tab label={`Successful Attacks (${selectedStrategyStats.failCount})`} />
      </Tabs>

      {/* Tab Content */}
      {tabValue === 0 && (
        <List>
          {examplesByStrategy.passes.slice(0, 5).map((flaggedAttempt) => (
            <Paper
              key={`${flaggedAttempt.prompt}-${flaggedAttempt.result}`}
              elevation={0}
              sx={{
                mb: 2,
                p: 2,
                backgroundColor:
                  theme.palette.mode === 'dark'
                    ? alpha(theme.palette.background.paper, 0.4)
                    : theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              <ListItem
                sx={{
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  p: 2,
                }}
              >
                <Box sx={{ width: '100%' }}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 1,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      color="text.secondary"
                      gutterBottom
                      sx={{ fontWeight: 'bold' }}
                    >
                      Prompt:
                    </Typography>
                    {flaggedAttempt.result && (
                      <Chip
                        size="small"
                        label={
                          displayNameOverrides[
                            getPluginIdFromResult(
                              flaggedAttempt.result,
                            ) as keyof typeof displayNameOverrides
                          ] || 'Unknown Plugin'
                        }
                        sx={{ ml: 1 }}
                      />
                    )}
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      mb: 2,
                      p: 1.5,
                      bgcolor:
                        theme.palette.mode === 'dark'
                          ? alpha(theme.palette.common.black, 0.2)
                          : alpha(theme.palette.grey[100], 0.5),
                      borderRadius: 1,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  >
                    {getPromptDisplayString(flaggedAttempt.prompt)}
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 1,
                    }}
                  >
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Response:
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      p: 1.5,
                      bgcolor:
                        theme.palette.mode === 'dark'
                          ? alpha(theme.palette.common.black, 0.2)
                          : alpha(theme.palette.grey[100], 0.5),
                      borderRadius: 1,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  >
                    {getOutputDisplay(flaggedAttempt.output)}
                  </Typography>
                </Box>
              </ListItem>
            </Paper>
          ))}
        </List>
      )}

      {tabValue === 1 && (
        <List>
          {examplesByStrategy.failures.slice(0, 5).map((successfulAttack) => (
            <Paper
              key={`${successfulAttack.prompt}-${successfulAttack.result}`}
              elevation={0}
              sx={{
                mb: 2,
                p: 2,
                backgroundColor:
                  theme.palette.mode === 'dark'
                    ? alpha(theme.palette.background.paper, 0.4)
                    : theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              <ListItem
                sx={{
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  p: 2,
                }}
              >
                <Box sx={{ width: '100%' }}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 1,
                    }}
                  >
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Prompt:
                    </Typography>
                    {successfulAttack.result && (
                      <Chip
                        size="small"
                        label={
                          displayNameOverrides[
                            getPluginIdFromResult(
                              successfulAttack.result,
                            ) as keyof typeof displayNameOverrides
                          ] || 'Unknown Plugin'
                        }
                        sx={{ ml: 1 }}
                      />
                    )}
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      mb: 2,
                      p: 1.5,
                      bgcolor:
                        theme.palette.mode === 'dark'
                          ? alpha(theme.palette.common.black, 0.2)
                          : alpha(theme.palette.grey[100], 0.5),
                      borderRadius: 1,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  >
                    {getPromptDisplayString(successfulAttack.prompt)}
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 1,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      color="text.secondary"
                      gutterBottom
                      sx={{ fontWeight: 'bold' }}
                    >
                      Response:
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      p: 1.5,
                      bgcolor:
                        theme.palette.mode === 'dark'
                          ? alpha(theme.palette.common.black, 0.2)
                          : alpha(theme.palette.grey[100], 0.5),
                      borderRadius: 1,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  >
                    {getOutputDisplay(successfulAttack.output)}
                  </Typography>
                </Box>
              </ListItem>
            </Paper>
          ))}
        </List>
      )}
    </Box>
  );
};

const StrategyStats = ({ strategyStats, failuresByPlugin, passesByPlugin }: StrategyStatsProps) => {
  const [selectedStrategy, setSelectedStrategy] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  /**
   * Sort strategies by ASR (highest first)
   */
  const strategies = Object.entries(strategyStats).sort((a, b) => {
    const asrA = calculateAttackSuccessRate(a[1].total, a[1].failCount);
    const asrB = calculateAttackSuccessRate(b[1].total, b[1].failCount);
    return asrB - asrA;
  });

  const handleStrategyClick = async (strategy: string) => {
    try {
      setIsLoading(true);
      setSelectedStrategy(strategy);
      // ... any async operations
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrawerClose = () => {
    setSelectedStrategy(null);
  };

  const [tabValue, setTabValue] = React.useState(0);
  const theme = useTheme();

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">Error loading strategy stats: {error.message}</Typography>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <StyledCard
        role="region"
        aria-label="Attack Methods Statistics"
        sx={{
          pageBreakInside: 'avoid',
          breakInside: 'avoid',
          pageBreakAfter: 'always',
          breakAfter: 'always',
        }}
      >
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h5" mb={2}>
            Attack Methods
          </Typography>
          <StyledGrid>
            {strategies.map(([strategy, { total, failCount }]) => {
              const asr = calculateAttackSuccessRate(total, failCount);
              return (
                <StyledStrategyItem
                  key={strategy}
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${strategy} attack method`}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleStrategyClick(strategy);
                    }
                  }}
                  onClick={() => handleStrategyClick(strategy)}
                >
                  <StyledStrategyName variant="body1">
                    {displayNameOverrides[strategy as keyof typeof displayNameOverrides] ||
                      strategy}
                  </StyledStrategyName>
                  <StyledStrategyDescription variant="body2" color="text.secondary">
                    {subCategoryDescriptions[strategy as keyof typeof subCategoryDescriptions] ||
                      ''}
                  </StyledStrategyDescription>
                  <StyledProgressContainer>
                    <Box width="100%" mr={1}>
                      <DangerLinearProgress variant="determinate" value={asr} />
                    </Box>
                    <StyledFailRate>
                      <Typography variant="body2" color="text.secondary">
                        {formatASRForDisplay(asr)}%
                      </Typography>
                    </StyledFailRate>
                  </StyledProgressContainer>
                  <Typography variant="caption" color="text.secondary">
                    {failCount} / {total} attacks succeeded
                  </Typography>
                </StyledStrategyItem>
              );
            })}
          </StyledGrid>
        </CardContent>
      </StyledCard>

      <Drawer
        aria-label="Strategy details"
        anchor="right"
        open={Boolean(selectedStrategy)}
        onClose={handleDrawerClose}
        PaperProps={{
          sx: {
            backgroundColor:
              theme.palette.mode === 'dark'
                ? alpha(theme.palette.background.paper, 0.9)
                : theme.palette.background.paper,
            borderLeft: `1px solid ${theme.palette.divider}`,
          },
        }}
      >
        {selectedStrategy && (
          <DrawerContent
            selectedStrategy={selectedStrategy}
            tabValue={tabValue}
            onTabChange={(newValue) => setTabValue(newValue)}
            failuresByPlugin={failuresByPlugin}
            passesByPlugin={passesByPlugin}
            selectedStrategyStats={strategyStats[selectedStrategy]}
          />
        )}
      </Drawer>
    </>
  );
};

export default StrategyStats;
