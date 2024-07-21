import React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Severity, riskCategorySeverityMap } from './constants';
import './Overview.css';

interface OverviewProps {
  categoryStats: Record<string, { pass: number; total: number }>;
}

const Overview: React.FC<OverviewProps> = ({ categoryStats }) => {
  const severities = [Severity.Critical, Severity.High, Severity.Medium, Severity.Low];

  const severityCounts = severities.reduce(
    (acc, severity) => {
      acc[severity] = Object.keys(categoryStats).reduce((count, category) => {
        if (riskCategorySeverityMap[category] === severity) {
          return count + 1;
        }
        return count;
      }, 0);
      return acc;
    },
    {} as Record<Severity, number>,
  );

  return (
    <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }}>
      {severities.map((severity) => (
        <Box key={severity} flex={1}>
          <Card className={`severity-card card-${severity.toLowerCase()}`}>
            <CardContent onClick={() => (window.location.hash = '#table')}>
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
      ))}
    </Stack>
  );
};

export default Overview;
