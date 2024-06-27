import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
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
    <Grid container spacing={2} mb={4}>
      {severities.map((severity) => (
        <Grid item xs={12} sm={6} md={3} key={severity}>
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
        </Grid>
      ))}
    </Grid>
  );
};

export default Overview;
