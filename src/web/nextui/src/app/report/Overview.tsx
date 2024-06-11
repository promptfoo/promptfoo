import React from 'react';
import { Grid, Card, CardContent, Typography } from '@mui/material';

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
    <Grid container spacing={2} mb={4}>
      {severities.map((severity) => (
        <Grid item xs={12} sm={6} md={3} key={severity}>
          <Card className={`card-${severity.toLowerCase()}`}>
            <CardContent>
              <Typography variant="body2" component="div">
                {severity}
              </Typography>
              <Typography variant="h6" color="text.primary">
                {severityCounts[severity]} issues
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

export default Overview;
