import React from 'react';
import { Box, Tabs, Tab, Card, CardContent, Grid, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { alpha } from '@mui/material/styles';
import TabPanel from './components/TabPanel';
import TestExample from './components/TestExample';
import type { StrategyStatsProps } from './types';
import { getPluginStats, getExamplesByStrategy } from './utils/stats';
import './StrategyStats.css';

const StrategyStats: React.FC<StrategyStatsProps> = ({
  strategyStats,
  failuresByPlugin = {},
  passesByPlugin = {},
}) => {
  const [selectedStrategy, setSelectedStrategy] = React.useState<string | null>(null);
  const [tabValue, setTabValue] = React.useState(0);
  const theme = useTheme();

  const handleStrategyClick = (strategy: string) => {
    setSelectedStrategy(strategy);
  };

  const handleDrawerClose = () => {
    setSelectedStrategy(null);
  };

  const strategies = Object.entries(strategyStats).sort(
    (a, b) => (b[1].total - b[1].pass) / b[1].total - (a[1].total - a[1].pass) / a[1].total,
  );

  const pluginStats = React.useMemo(
    () => (selectedStrategy ? getPluginStats(selectedStrategy) : []),
    [selectedStrategy, failuresByPlugin, passesByPlugin],
  );

  const examplesByStrategy = React.useMemo(
    () =>
      selectedStrategy ? getExamplesByStrategy(selectedStrategy) : { failures: [], passes: [] },
    [selectedStrategy, failuresByPlugin, passesByPlugin],
  );

  return (
    <>
      <Card className="strategy-stats-card">
        <CardContent>
          <Grid container spacing={2}>
            {strategies.map(([strategy, stats]) => (
              <Grid item xs={12} sm={6} key={strategy}>
                <div
                  className="strategy-item"
                  onClick={() => handleStrategyClick(strategy)}
                  role="button"
                  tabIndex={0}
                >
                  <Typography variant="h6" className="strategy-name">
                    {displayNameOverrides[strategy as keyof typeof displayNameOverrides] ||
                      strategy}
                  </Typography>
                  <Typography variant="body2" className="strategy-description">
                    {subCategoryDescriptions[strategy as keyof typeof subCategoryDescriptions] ||
                      ''}
                  </Typography>
                  <div className="progress-container">
                    <DangerLinearProgress
                      variant="determinate"
                      value={((stats.total - stats.pass) / stats.total) * 100}
                    />
                  </div>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" color="text.secondary">
                      {stats.total} attempts
                    </Typography>
                    <Typography variant="body2" className="fail-rate">
                      {(((stats.total - stats.pass) / stats.total) * 100).toFixed(1)}% success
                    </Typography>
                  </Box>
                  {pluginStats.length > 0 && (
                    <Typography variant="caption" className="attack-stats">
                      Most effective: {pluginStats[0].plugin} ({pluginStats[0].failRate.toFixed(1)}%
                      success)
                    </Typography>
                  )}
                </div>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

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
        <Box
          role="dialog"
          aria-modal="true"
          sx={{
            width: 750,
            p: 3,
            color: theme.palette.text.primary,
          }}
        >
          {/* ... Strategy details ... */}

          <Box sx={{ width: '100%' }}>
            <Tabs
              value={tabValue}
              onChange={(_, newValue) => {
                console.log('Tab changed to:', newValue);
                setTabValue(newValue);
              }}
              aria-label="Strategy test results"
              sx={{
                mb: 2,
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Tab
                label={`Successful Attacks (${
                  selectedStrategy
                    ? strategyStats[selectedStrategy].total - strategyStats[selectedStrategy].pass
                    : 0
                })`}
                id="strategy-tab-0"
                aria-controls="strategy-tabpanel-0"
              />
              <Tab
                label={`Failed Attempts (${selectedStrategy ? strategyStats[selectedStrategy].pass : 0})`}
                id="strategy-tab-1"
                aria-controls="strategy-tabpanel-1"
              />
            </Tabs>

            <TabPanel value={tabValue} index={0}>
              {examplesByStrategy.failures.slice(0, 5).map((failure, index) => (
                <TestExample
                  key={`failure-${index}`}
                  prompt={failure.prompt}
                  output={failure.output}
                  type="failure"
                  onClick={() => handleStrategyClick(selectedStrategy || '')}
                />
              ))}
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
              {examplesByStrategy.passes.slice(0, 5).map((pass, index) => (
                <TestExample
                  key={`pass-${index}`}
                  prompt={pass.prompt}
                  output={pass.output}
                  type="pass"
                  onClick={() => handleStrategyClick(selectedStrategy || '')}
                />
              ))}
            </TabPanel>
          </Box>
        </Box>
      </Drawer>
    </>
  );
};

export default StrategyStats;
