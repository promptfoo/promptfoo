import React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress, { linearProgressClasses } from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/system';
import { displayNameOverrides, subCategoryDescriptions } from './constants';
import './StrategyStats.css';

interface StrategyStatsProps {
  strategyStats: Record<string, { pass: number; total: number }>;
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

const StrategyStats: React.FC<StrategyStatsProps> = ({ strategyStats }) => {
  const strategies = Object.entries(strategyStats).sort(
    (a, b) => (b[1].total - b[1].pass) / b[1].total - (a[1].total - a[1].pass) / a[1].total,
  );

  return (
    <Card className="strategy-stats-card">
      <CardContent className="strategy-stats-content">
        <Typography variant="h5" mb={2}>
          Attack success rates
        </Typography>
        <Box className="strategy-grid">
          {strategies.map(([strategy, { pass, total }]) => {
            const failRate = ((total - pass) / total) * 100;
            return (
              <Box key={strategy} className="strategy-item">
                <Typography variant="body1" className="strategy-name">
                  {displayNameOverrides[strategy as keyof typeof displayNameOverrides] || strategy}
                </Typography>
                <Typography variant="body2" color="text.secondary" className="strategy-description">
                  {subCategoryDescriptions[strategy as keyof typeof subCategoryDescriptions] || ''}
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
  );
};

export default StrategyStats;
