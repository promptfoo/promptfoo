import React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { displayNameOverrides } from './constants';
import './StrategyStats.css';

interface StrategyStatsProps {
  strategyStats: Record<string, { pass: number; total: number }>;
}

const StrategyStats: React.FC<StrategyStatsProps> = ({ strategyStats }) => {
  const strategies = Object.entries(strategyStats).sort(
    (a, b) => b[1].pass / b[1].total - a[1].pass / a[1].total,
  );

  return (
    <Card className="strategy-stats-card">
      <CardContent>
        <Typography variant="h5" gutterBottom>
          Performance by attack strategy
        </Typography>
        <Stack spacing={2}>
          {strategies.map(([strategy, { pass, total }]) => {
            const passRate = (pass / total) * 100;
            return (
              <Box key={strategy} className="strategy-item">
                <Typography variant="body1" gutterBottom>
                  {displayNameOverrides[strategy as keyof typeof displayNameOverrides] || strategy}
                </Typography>
                <Box display="flex" alignItems="center">
                  <Box width="100%" mr={1}>
                    <LinearProgress
                      variant="determinate"
                      value={passRate}
                      className={`strategy-progress ${
                        passRate >= 80 ? 'high' : passRate >= 50 ? 'medium' : 'low'
                      }`}
                    />
                  </Box>
                  <Box minWidth={35}>
                    <Typography variant="body2" color="text.secondary">
                      {passRate.toFixed(1)}%
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {pass} / {total} passed
                </Typography>
              </Box>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default StrategyStats;
