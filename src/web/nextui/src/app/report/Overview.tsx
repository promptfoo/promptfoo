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
    <Stack spacing={2} mb={4} direction="row">
      {severities.map((severity) => (
        <Box
          key={severity}
          width={{ xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(25% - 8px)' }}
          mb={2}
        >
          <Card className={`card-${severity.toLowerCase()}`}>
            <CardContent onClick={() => (window.location.hash = '#table')}>
              <Typography variant="body2" component="div">
                {severity}
              </Typography>
              <Typography variant="h6" color="text.primary">
                {severityCounts[severity]} issues
              </Typography>
            </CardContent>
          </Card>
        </Box>
      ))}
    </Stack>
  );
};

export default Overview;
