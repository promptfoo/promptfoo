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

const PRIMARY_TEXT_COLORS = {
  [Severity.Critical]: '#4a0814',
  [Severity.High]: '#ff9100',
  [Severity.Medium]: '#ffc400',
  [Severity.Low]: '#00e676',
};

const BACKGROUND_COLORS = {
  [Severity.Critical]: '#fffafb',
  [Severity.High]: '#fffcfa',
  [Severity.Medium]: '#fffefb',
  [Severity.Low]: '#fafffc',
};

const DARK_MODE_BACKGROUND_COLORS = {
  [Severity.Critical]: '#2d1b1e',
  [Severity.High]: '#2d251b',
  [Severity.Medium]: '#2d2a1b',
  [Severity.Low]: '#1b2d20',
};

const SECONDARY_TEXT_COLORS = {
  [Severity.Critical]: '#ff1744',
  [Severity.High]: '#7a3c00',
  [Severity.Medium]: '#7a6a00',
  [Severity.Low]: '#005c2e',
};

const DARK_MODE_SECONDARY_TEXT_COLORS = {
  [Severity.Critical]: '#ff1744',
  [Severity.High]: '#ff9100',
  [Severity.Medium]: '#ffc400',
  [Severity.Low]: '#00e676',
};

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
            <CardContent
              onClick={() => (window.location.hash = '#table')}
              sx={[
                {
                  backgroundColor: BACKGROUND_COLORS[severity],
                  color: SECONDARY_TEXT_COLORS[severity],
                },
                (theme) =>
                  theme.applyStyles('dark', {
                    backgroundColor: DARK_MODE_BACKGROUND_COLORS[severity],
                    color: DARK_MODE_SECONDARY_TEXT_COLORS[severity],
                  }),
              ]}
            >
              <Typography
                variant="h6"
                gutterBottom
                sx={[
                  {
                    color: PRIMARY_TEXT_COLORS[severity],
                  },
                  (theme) =>
                    theme.applyStyles('dark', {
                      color: DARK_MODE_SECONDARY_TEXT_COLORS[severity],
                    }),
                ]}
              >
                {severityDisplayNames[severity]}
              </Typography>
              <Typography variant="h4">{severityCounts[severity]}</Typography>
              <Typography variant="body2">issues</Typography>
            </CardContent>
          </Card>
        </Box>
      ))}
    </Stack>
  );
};

export default Overview;
