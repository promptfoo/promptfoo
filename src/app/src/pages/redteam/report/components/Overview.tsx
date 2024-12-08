import React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
  Severity,
  severityDisplayNames,
  type Plugin as PluginType,
} from '@promptfoo/redteam/constants';
import { getRiskCategorySeverityMap } from '@promptfoo/redteam/sharedFrontend';
import type { RedteamPluginObject } from '@promptfoo/redteam/types';
import { useReportStore } from './store';
import './Overview.css';

interface OverviewProps {
  categoryStats: Record<PluginType, { pass: number; total: number }>;
  plugins: RedteamPluginObject[];
}

const Overview: React.FC<OverviewProps> = ({ categoryStats, plugins }) => {
  const { pluginPassRateThreshold } = useReportStore();

  const severityCounts = Object.values(Severity).reduce(
    (acc, severity) => {
      acc[severity] = Object.keys(categoryStats).reduce((count, category) => {
        const stats = categoryStats[category as PluginType];
        const passRate = stats.pass / stats.total;
        if (
          getRiskCategorySeverityMap(plugins)[category as PluginType] === severity &&
          passRate < pluginPassRateThreshold
        ) {
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
      {Object.values(Severity).map((severity) => (
        <Box key={severity} flex={1}>
          <Card className={`severity-card card-${severity.toLowerCase()}`}>
            <CardContent onClick={() => (window.location.hash = '#table')}>
              <Typography variant="h6" gutterBottom>
                {severityDisplayNames[severity]}
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
